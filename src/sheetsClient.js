import {
  MASTER_COLUMNS,
  SHEET_API_URL,
  ZOHO_SHEET_RESOURCE_ID,
  ZOHO_WORKSHEET_NAME,
} from "./config.js";
import { zohoFormRequest } from "./zohoApi.js";

const EXTRA_WORKSHEETS_BY_EMAIL_TYPE = {
  invoice_sent: "Sent",
  invoice_paid: "Paid",
};

function escapeCsvValue(value) {
  const text = value == null ? "" : String(value);
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

/** Stable key for sheet dedupe without storing Zoho message IDs. */
export function duplicateKey(row = {}) {
  if (row.txn_id) return `txn:${row.txn_id}`;
  if (row.case_id) return `case:${row.case_id}:${row.email_type || ""}`;
  if (row.invoice_number) {
    return `inv:${row.email_type || ""}:${row.invoice_number}:${row.email_date || ""}`;
  }
  return `sub:${row.email_date || ""}|${row.subject || ""}|${row.email_type || ""}`;
}

export class SheetsClient {
  constructor(resourceId = ZOHO_SHEET_RESOURCE_ID) {
    if (!resourceId) {
      throw new Error("ZOHO_SHEET_RESOURCE_ID is not set");
    }
    this.resourceId = resourceId;
    this.worksheetName = ZOHO_WORKSHEET_NAME;
    this.duplicateKeyCache = null;
  }

  async sheetRequest(params) {
    return zohoFormRequest(SHEET_API_URL, `/api/v2/${this.resourceId}`, {
      resource_id: this.resourceId,
      ...params,
    });
  }

  async listWorksheets() {
    const result = await this.sheetRequest({ method: "worksheet.list" });
    return result?.worksheet_names || result?.worksheets || [];
  }

  async ensureTabs() {
    const worksheets = await this.listWorksheets();
    const names = worksheets.map((ws) =>
      typeof ws === "string" ? ws : ws.worksheet_name || ws.name
    );

    if (!names.includes(this.worksheetName)) {
      throw new Error(
        `Worksheet "${this.worksheetName}" not found in your Zoho Sheet. ` +
          `Set ZOHO_WORKSHEET_NAME in .env to match an existing tab in your Sheet. ` +
          `Found: ${names.join(", ") || "(none)"}`
      );
    }

    await this.ensureHeaders(this.worksheetName, MASTER_COLUMNS);

    for (const worksheetName of Object.values(EXTRA_WORKSHEETS_BY_EMAIL_TYPE)) {
      if (!names.includes(worksheetName)) {
        await this.createWorksheet(worksheetName);
      }
      await this.ensureHeaders(worksheetName, MASTER_COLUMNS);
    }
  }

  async createWorksheet(worksheetName) {
    await this.sheetRequest({
      method: "worksheet.insert",
      worksheet_name: worksheetName,
    });
  }

  async ensureHeaders(worksheetName, headers) {
    const csv = `${headers.map(escapeCsvValue).join(",")}\n`;
    await this.sheetRequest({
      method: "worksheet.csvdata.set",
      worksheet_name: worksheetName,
      row: 1,
      column: 1,
      data: csv,
    });
  }

  async appendRow(_tabName, row) {
    const values = MASTER_COLUMNS.map((header) => escapeCsvValue(row[header] ?? ""));
    const csv = `${values.join(",")}\n`;

    await this.sheetRequest({
      method: "worksheet.csvdata.append",
      worksheet_name: this.worksheetName,
      data: csv,
    });

    const extraWorksheetName = EXTRA_WORKSHEETS_BY_EMAIL_TYPE[row.email_type];
    if (extraWorksheetName) {
      await this.sheetRequest({
        method: "worksheet.csvdata.append",
        worksheet_name: extraWorksheetName,
        data: csv,
      });
    }

    if (this.duplicateKeyCache) {
      this.duplicateKeyCache.add(duplicateKey(row));
    }
  }

  async getDuplicateKeys() {
    if (this.duplicateKeyCache) return this.duplicateKeyCache;

    try {
      const result = await this.sheetRequest({
        method: "worksheet.records.fetch",
        worksheet_name: this.worksheetName,
        header_row: 1,
        render_option: "formatted",
        records_start_index: 1,
        is_case_sensitive: true,
        column_names: [
          "email_date",
          "subject",
          "email_type",
          "txn_id",
          "case_id",
          "invoice_number",
        ],
        count: 1000,
      });

      const records = result?.records || result?.record_details || [];
      const keys = new Set();
      for (const record of records) {
        const row = record.row_details || record;
        keys.add(duplicateKey(row));
      }
      this.duplicateKeyCache = keys;
      return keys;
    } catch (err) {
      if (
        String(err.message).toLowerCase().includes("does not exist") ||
        String(err.message).toLowerCase().includes("not found")
      ) {
        this.duplicateKeyCache = new Set();
        return this.duplicateKeyCache;
      }
      throw err;
    }
  }

  async isDuplicate(_tabName, row) {
    const keys = await this.getDuplicateKeys();
    return keys.has(duplicateKey(row));
  }
}
