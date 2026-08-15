import * as cheerio from "cheerio";

export function normalizeText(text) {
  if (!text) return "";
  let result = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  result = result.replace(/PayP\s*al/gi, "PayPal");
  result = result.replace(/PP-R-\s*([A-Z]{3})-\s*(\d+)/g, "PP-R-$1-$2");
  result = result.replace(/[ \t]+/g, " ");
  // Drop blank/whitespace-only lines left by HTML-to-text conversion
  result = result
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join("\n");
  return result.trim();
}

export function htmlToText(html) {
  if (!html) return "";
  const $ = cheerio.load(html);
  $("script, style").remove();
  const text = $("body").text() || $.root().text();
  return normalizeText(text.replace(/\n/g, "\n"));
}

export function getEmailBody(htmlBody, textBody) {
  if (htmlBody) return htmlToText(htmlBody);
  return normalizeText(textBody);
}
