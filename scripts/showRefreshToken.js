import fs from "node:fs/promises";
import { TOKEN_PATH } from "../src/config.js";

let token;
try {
  token = JSON.parse(await fs.readFile(TOKEN_PATH, "utf8"));
} catch {
  console.error(`No token file at ${TOKEN_PATH}. Run "npm run auth" first.`);
  process.exit(1);
}

if (!token.refresh_token) {
  console.error("Token file has no refresh_token. Re-run \"npm run auth\".");
  process.exit(1);
}

console.log("Set this as ZOHO_REFRESH_TOKEN in Coolify:\n");
console.log(token.refresh_token);
console.log("\nKeep it secret — it grants access until revoked.");
