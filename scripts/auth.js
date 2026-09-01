import { authorizeInteractive } from "../src/zohoApi.js";

await authorizeInteractive();
console.log("Zoho authorization complete. token.json has been saved.");

