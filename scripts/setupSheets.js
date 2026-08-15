import { SheetsClient } from "../src/sheetsClient.js";

const sheets = new SheetsClient();
await sheets.ensureTabs();
console.log("Zoho Sheet headers are ready.");
