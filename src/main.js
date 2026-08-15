import { classifyEmail } from "./classifier.js";
import { MAIL_LOOKBACK_DAYS, MAIL_SEARCH_KEY, POLL_INTERVAL_SECONDS } from "./config.js";
import { MailClient } from "./mailClient.js";
import { getEmailBody, normalizeText } from "./normalize.js";
import { parseEmail } from "./parsers/index.js";
import { SheetsClient } from "./sheetsClient.js";

function parseArgs(argv) {
  const args = {
    once: false,
    loop: false,
    dryRun: false,
    searchKey: MAIL_SEARCH_KEY,
    interval: POLL_INTERVAL_SECONDS,
    days: MAIL_LOOKBACK_DAYS,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--once") args.once = true;
    else if (arg === "--loop") args.loop = true;
    else if (arg === "--dry-run") args.dryRun = true;
    else if (arg === "--search-key") args.searchKey = argv[++i];
    else if (arg === "--interval") args.interval = Number(argv[++i]);
    else if (arg === "--days") args.days = Number(argv[++i]);
  }

  return args;
}

export async function processMessage(mail, sheets, messageRef, { dryRun = false } = {}) {
  const email = await mail.fetchMessage(messageRef);
  let body = getEmailBody(email.htmlBody, email.textBody);
  if (!body) body = normalizeText(email.snippet);

  const emailType = classifyEmail(email.subject, body);
  let tab;
  let row;

  if (emailType === "unknown") {
    tab = "_log";
    row = {
      gmail_message_id: email.messageId,
      email_date: email.emailDate,
      subject: email.subject,
      parsed_at: new Date().toISOString(),
      email_type: "unknown",
      error: "Could not classify email template",
      raw_snippet: body.slice(0, 500),
    };
  } else {
    try {
      row = parseEmail(emailType, body, {
        gmailMessageId: email.messageId,
        emailDate: email.emailDate,
        subject: email.subject,
      });
      tab = emailType;
    } catch (error) {
      tab = "_log";
      row = {
        gmail_message_id: email.messageId,
        email_date: email.emailDate,
        subject: email.subject,
        parsed_at: new Date().toISOString(),
        email_type: emailType,
        error: error.message,
        raw_snippet: body.slice(0, 500),
      };
    }
  }

  if (await sheets.isDuplicate(tab, row)) {
    if (!dryRun) {
      await mail.markProcessed(messageRef);
    }
    return `skip duplicate: ${email.subject.slice(0, 60)} (${tab})`;
  }

  if (dryRun) {
    return `dry-run: would append to ${tab} -> ${email.subject.slice(0, 60)}`;
  }

  await sheets.appendRow(tab, row);
  await mail.markProcessed(messageRef);
  return `processed: ${email.subject.slice(0, 60)} -> ${tab}`;
}

export async function runOnce({
  dryRun = false,
  searchKey = MAIL_SEARCH_KEY,
  days = MAIL_LOOKBACK_DAYS,
} = {}) {
  const mail = new MailClient();
  const sheets = new SheetsClient();
  if (!dryRun) await sheets.ensureTabs();

  const messages = await mail.listMessages({ searchKey, days });
  const results = [];
  for (const messageRef of messages) {
    try {
      results.push(await processMessage(mail, sheets, messageRef, { dryRun }));
    } catch (error) {
      // Leave the message unlabelled so the next run retries it; sheet dedupe
      // stops it being appended twice if the row already landed.
      results.push(
        `error: ${messageRef.subject.slice(0, 60)} -> ${error.message}`
      );
    }
  }
  return results;
}

export async function runLoop({
  dryRun = false,
  interval = POLL_INTERVAL_SECONDS,
  days = MAIL_LOOKBACK_DAYS,
} = {}) {
  while (true) {
    try {
      const results = await runOnce({ dryRun, days });
      for (const line of results) console.log(line);
      if (!results.length) console.log("No new messages.");
    } catch (error) {
      // A whole cycle failed (network, token refresh, Zoho outage). Keep the
      // poller alive — the next cycle picks up whatever was missed.
      console.error(`[${new Date().toISOString()}] cycle failed: ${error.message}`);
    }
    await new Promise((resolve) => setTimeout(resolve, interval * 1000));
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.once || !args.loop) {
    const results = await runOnce({
      dryRun: args.dryRun,
      searchKey: args.searchKey,
      days: args.days,
    });
    for (const line of results) console.log(line);
    if (!results.length) {
      console.log(`No new messages (searched last ${args.days} day(s)).`);
    }
    return;
  }

  await runLoop({ dryRun: args.dryRun, interval: args.interval, days: args.days });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
