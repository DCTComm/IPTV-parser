import { classifyEmail } from "./classifier.js";
import {
  HISTORIC_DAYS,
  MAIL_LOOKBACK_DAYS,
  MAIL_SEARCH_KEY,
  POLL_INTERVAL_SECONDS,
  ZOHO_FETCH_TAGGED,
  ZOHO_MAIL_TAG,
} from "./config.js";
import { MailClient } from "./mailClient.js";
import { getEmailBody, normalizeText } from "./normalize.js";
import { parseEmail } from "./parsers/index.js";
import { SheetsClient } from "./sheetsClient.js";

function parseArgs(argv) {
  const args = {
    once: false,
    loop: false,
    dryRun: false,
    all: false,
    fetchTagged: ZOHO_FETCH_TAGGED,
    searchKey: MAIL_SEARCH_KEY,
    interval: POLL_INTERVAL_SECONDS,
    days: HISTORIC_DAYS,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--once") args.once = true;
    else if (arg === "--loop") args.loop = true;
    else if (arg === "--dry-run") args.dryRun = true;
    else if (arg === "--fetch-tagged" || arg === "--tagged-only") args.fetchTagged = true;
    else if (arg === "--all-emails" || arg === "--no-tag-filter") args.fetchTagged = false;
    else if (arg === "--all") {
      args.all = true;
      args.searchKey = "";
    } else if (arg.startsWith("--search-key=")) {
      args.searchKey = arg.slice("--search-key=".length);
    } else if (arg === "--search-key") {
      args.searchKey = argv[++i] ?? "";
    } else if (arg.startsWith("--interval=")) {
      args.interval = Number(arg.slice("--interval=".length));
    } else if (arg === "--interval") {
      args.interval = Number(argv[++i]);
    } else if (arg.startsWith("--days=")) {
      args.days = Number(arg.slice("--days=".length));
    } else if (arg === "--days") {
      args.days = Number(argv[++i]);
    }
  }

  if (args.searchKey === "all" || args.searchKey === "none") {
    args.searchKey = "";
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
    console.log(`Skipping duplicate message: ${messageRef.messageId}`);
    if (!dryRun) {
      try {
        await mail.markProcessed(messageRef);
      } catch (tagErr) {
        console.warn(
          `[WARNING] Failed to tag duplicate email ${messageRef.messageId}: ${tagErr.message}`
        );
      }
    }
    return {
      status: "duplicate",
      text: `Skipping duplicate message: ${messageRef.messageId}`,
    };
  }

  if (dryRun) {
    return {
      status: "dry_run",
      text: `dry-run: would insert into ${tab} -> ${email.subject.slice(0, 60)}`,
    };
  }

  // 1. Insert into Zoho Sheet FIRST
  await sheets.appendRow(tab, row);

  // 2. ONLY tag as processed AFTER Sheet insertion succeeds
  let tagWarning = false;
  try {
    await mail.markProcessed(messageRef);
  } catch (tagErr) {
    tagWarning = true;
    console.warn(
      `[WARNING] Sheet row inserted successfully, but failed to apply tag "${ZOHO_MAIL_TAG}" to message ${messageRef.messageId}: ${tagErr.message}`
    );
  }

  return {
    status: tagWarning ? "inserted_untagged" : "processed",
    text: `processed: ${email.subject.slice(0, 60)} -> ${tab}`,
  };
}

export async function runOnce({
  dryRun = false,
  searchKey = MAIL_SEARCH_KEY,
  days = HISTORIC_DAYS,
  fetchTagged = ZOHO_FETCH_TAGGED,
} = {}) {
  const mail = new MailClient();
  const sheets = new SheetsClient();
  if (!dryRun) await sheets.ensureTabs();

  if (fetchTagged) {
    console.log(
      `Tagged-only mode enabled (ZOHO_FETCH_TAGGED=true) — processing ONLY emails tagged with "${ZOHO_MAIL_TAG}".`
    );
  } else {
    console.log(
      `Untagged-only mode enabled (ZOHO_FETCH_TAGGED=false) — skipping emails tagged with "${ZOHO_MAIL_TAG}".`
    );
  }

  const messages = await mail.listMessages({
    searchKey,
    days,
    fetchTagged,
  });

  const results = [];

  let candidatesCount = messages.stats?.candidateCount ?? messages.length;
  let taggedFoundCount = messages.stats?.taggedCount ?? messages.length;
  let skippedUntaggedCount = messages.stats?.skippedUntaggedCount ?? 0;
  let skippedTaggedCount = messages.stats?.skippedTaggedCount ?? 0;
  let processedCount = 0;
  let duplicatesCount = 0;
  let insertedCount = 0;
  let failedCount = 0;

  for (const messageRef of messages) {
    try {
      const outcome = await processMessage(mail, sheets, messageRef, { dryRun });
      results.push(outcome.text);

      if (outcome.status === "processed") {
        processedCount++;
        insertedCount++;
      } else if (outcome.status === "inserted_untagged") {
        processedCount++;
        insertedCount++;
      } else if (outcome.status === "duplicate") {
        duplicatesCount++;
      } else if (outcome.status === "dry_run") {
        processedCount++;
      }
    } catch (error) {
      failedCount++;
      const errMsg = `error: ${messageRef.subject?.slice(0, 60) || messageRef.messageId} -> ${error.message}`;
      console.error(`[ERROR] ${errMsg}`);
      console.error(
        `[ERROR] Sheet insert failed -> email was NOT tagged (message ID: ${messageRef.messageId})`
      );
      results.push(errMsg);
    }
  }

  console.log("\n==================================================");
  console.log(
    `Sync Mode: ${fetchTagged ? `Tagged Only (ZOHO_FETCH_TAGGED=true, tag: "${ZOHO_MAIL_TAG}")` : `Untagged Only (ZOHO_FETCH_TAGGED=false, tag: "${ZOHO_MAIL_TAG}")`}`
  );
  console.log(`Historical window: last ${days} days`);
  console.log(`Candidate emails inspected: ${candidatesCount}`);
  if (fetchTagged) {
    console.log(`Tagged emails found: ${taggedFoundCount}`);
    console.log(`Untagged emails skipped: ${skippedUntaggedCount}`);
  } else {
    console.log(`Untagged emails found: ${candidatesCount - skippedTaggedCount}`);
    console.log(`Tagged emails skipped: ${skippedTaggedCount}`);
  }
  console.log(`Processed: ${processedCount} emails`);
  console.log(`Duplicates skipped (Sheet): ${duplicatesCount}`);
  console.log(`Inserted into Zoho Sheet: ${insertedCount} rows`);
  console.log(`Failed: ${failedCount} emails`);
  console.log("==================================================\n");

  return results;
}

export async function runLoop({
  dryRun = false,
  interval = POLL_INTERVAL_SECONDS,
  days = MAIL_LOOKBACK_DAYS,
  fetchTagged = ZOHO_FETCH_TAGGED,
} = {}) {
  console.log(
    `poller started — interval ${interval}s, lookback ${days}d, node ${process.version}, pid ${process.pid}`
  );

  while (true) {
    const rssMb = Math.round(process.memoryUsage().rss / 1024 / 1024);
    console.log(`[${new Date().toISOString()}] cycle start (rss ${rssMb} MB)`);
    try {
      const results = await runOnce({ dryRun, days, fetchTagged });
      for (const line of results) console.log(line);
      if (!results.length) console.log("No new messages.");
    } catch (error) {
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
      fetchTagged: args.fetchTagged,
    });
    for (const line of results) console.log(line);
    if (!results.length) {
      console.log(`No new messages (searched last ${args.days} day(s)).`);
    }
    return;
  }

  await runLoop({
    dryRun: args.dryRun,
    interval: args.interval,
    days: args.days,
    fetchTagged: args.fetchTagged,
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});




