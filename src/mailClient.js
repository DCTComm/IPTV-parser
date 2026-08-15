import {
  MAIL_API_URL,
  MAIL_SEARCH_KEY,
  PAYPAL_SENDER,
  PROCESSED_LABEL,
  ZOHO_MAIL_ACCOUNT_ID,
} from "./config.js";
import { zohoRequest } from "./zohoApi.js";

function parseEmailDate(value) {
  if (!value) return "";
  const parsed = new Date(Number(value));
  if (Number.isNaN(parsed.getTime())) {
    const text = String(value);
    const dateOnly = text.match(/^\d{4}-\d{2}-\d{2}/);
    return dateOnly ? dateOnly[0] : text;
  }
  return parsed.toISOString().slice(0, 10);
}

export function getLookbackCutoffMs(days) {
  if (!days || days <= 0) return null;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  cutoff.setHours(0, 0, 0, 0);
  return cutoff.getTime();
}

export function buildSearchKey(baseKey = MAIL_SEARCH_KEY) {
  return baseKey;
}

function getReceivedTimeMs(message) {
  const value = message.receivedtime || message.receivedTime;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function isWithinLookback(message, cutoffMs) {
  if (!cutoffMs) return true;
  const receivedMs = getReceivedTimeMs(message);
  if (receivedMs == null) return true;
  return receivedMs >= cutoffMs;
}

function matchesPaypalSender(fromAddress = "") {
  return fromAddress.toLowerCase().includes(PAYPAL_SENDER.toLowerCase());
}

function hasProcessedLabel(message, processedLabelId) {
  if (!processedLabelId) return false;
  const labels = message.labelId || message.labels || [];
  return labels.map(String).includes(String(processedLabelId));
}

export class MailClient {
  constructor() {
    this.accountId = ZOHO_MAIL_ACCOUNT_ID;
    this.labelCache = new Map();
    this.processedLabelId = null;
    this.labelsUnavailable = false;
  }

  async getAccountId() {
    if (this.accountId) return this.accountId;

    const response = await zohoRequest(MAIL_API_URL, "/api/accounts");
    const accounts = response.data || [];
    if (!accounts.length) {
      throw new Error("No Zoho Mail accounts found for this user");
    }

    this.accountId = String(accounts[0].accountId);
    return this.accountId;
  }

  async listMessages({
    searchKey = MAIL_SEARCH_KEY,
    days,
    limit = 200,
    maxResults = 1000,
  } = {}) {
    const accountId = await this.getAccountId();
    const fullSearchKey = buildSearchKey(searchKey);
    const cutoffMs = getLookbackCutoffMs(days);
    const processedLabelId = await this.getProcessedLabelId();
    const matches = [];
    let start = 1;

    while (matches.length < maxResults) {
      const params = new URLSearchParams({
        searchKey: fullSearchKey,
        start: String(start),
        limit: String(limit),
        includeto: "true",
        receivedTime: String(Date.now()),
      });

      const response = await zohoRequest(
        MAIL_API_URL,
        `/api/accounts/${accountId}/messages/search?${params}`
      );

      const messages = response.data || [];
      if (!messages.length) break;

      let reachedOlderMessages = false;
      for (const message of messages) {
        if (!isWithinLookback(message, cutoffMs)) {
          reachedOlderMessages = true;
          continue;
        }
        if (!matchesPaypalSender(message.fromAddress)) continue;
        if (hasProcessedLabel(message, processedLabelId)) continue;

        matches.push({
          messageId: String(message.messageId),
          folderId: String(message.folderId),
          subject: message.subject || "",
          emailDate: parseEmailDate(message.receivedtime || message.receivedTime),
          fromAddr: message.fromAddress || "",
          snippet: message.summary || "",
        });

        if (matches.length >= maxResults) break;
      }

      if (reachedOlderMessages || messages.length < limit) break;
      start += limit;
    }

    return matches;
  }

  async fetchMessage(messageRef) {
    const { messageId, folderId, subject, emailDate, fromAddr, snippet } = messageRef;
    const accountId = await this.getAccountId();
    const contentResponse = await zohoRequest(
      MAIL_API_URL,
      `/api/accounts/${accountId}/folders/${folderId}/messages/${messageId}/content`
    );

    const content = contentResponse.data?.content || "";

    return {
      messageId: String(messageId),
      folderId: String(folderId),
      subject,
      emailDate,
      fromAddr,
      toAddr: "",
      htmlBody: content,
      textBody: "",
      snippet,
    };
  }

  async getProcessedLabelId() {
    if (this.labelsUnavailable) return null;
    if (this.processedLabelId) return this.processedLabelId;

    const accountId = await this.getAccountId();
    let response;
    try {
      response = await zohoRequest(
        MAIL_API_URL,
        `/api/accounts/${accountId}/labels`
      );
    } catch (error) {
      if (String(error.message).includes("401")) {
        this.labelsUnavailable = true;
        console.warn(
          "Zoho Mail labels API returned 401. Add ZohoMail.tags.ALL scope in the API Console, then run npm run auth. Falling back to mark-as-read only."
        );
        return null;
      }
      throw error;
    }

    const labels = response.data || [];
    const existing = labels.find(
      (label) =>
        label.displayName === PROCESSED_LABEL || label.labelName === PROCESSED_LABEL
    );
    if (existing) {
      this.processedLabelId = String(existing.labelId || existing.tagId);
      return this.processedLabelId;
    }

    const created = await zohoRequest(
      MAIL_API_URL,
      `/api/accounts/${accountId}/labels`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: PROCESSED_LABEL }),
      }
    );
    this.processedLabelId = String(
      created.data?.labelId || created.data?.tagId || created.data?.id
    );
    return this.processedLabelId;
  }

  async markProcessed({ messageId, folderId }) {
    const accountId = await this.getAccountId();
    const labelId = await this.getProcessedLabelId();

    await zohoRequest(MAIL_API_URL, `/api/accounts/${accountId}/updatemessage`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      // IDs exceed Number.MAX_SAFE_INTEGER — keep them as strings or they corrupt
      body: JSON.stringify({
        mode: "markAsRead",
        messageId: [String(messageId)],
      }),
    });

    if (labelId) {
      await zohoRequest(MAIL_API_URL, `/api/accounts/${accountId}/updatemessage`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "applyLabel",
          messageId: [String(messageId)],
          labelId: [String(labelId)],
          isFolderSpecific: true,
          folderId: String(folderId),
        }),
      });
    }
  }
}
