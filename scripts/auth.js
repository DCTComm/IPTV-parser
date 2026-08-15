import { getAccessToken } from "../src/zohoApi.js";

await getAccessToken();
console.log("Zoho authorization complete. token.json has been saved.");
