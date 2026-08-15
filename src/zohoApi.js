import fs from "node:fs/promises";
import http from "node:http";
import { exec } from "node:child_process";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import {
  ACCOUNTS_URL,
  FETCH_RETRIES,
  FETCH_TIMEOUT_MS,
  SCOPES,
  TOKEN_PATH,
  ZOHO_CLIENT_ID,
  ZOHO_CLIENT_SECRET,
  ZOHO_REDIRECT_URI,
} from "./config.js";

let tokenCache = null;

async function loadTokenFile() {
  try {
    const content = await fs.readFile(TOKEN_PATH, "utf8");
    return JSON.parse(content);
  } catch {
    return null;
  }
}

async function saveTokenFile(token) {
  await fs.writeFile(TOKEN_PATH, JSON.stringify(token, null, 2), "utf8");
}

async function exchangeCodeForToken(code) {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: ZOHO_CLIENT_ID,
    client_secret: ZOHO_CLIENT_SECRET,
    redirect_uri: ZOHO_REDIRECT_URI,
    code,
  });

  const response = await fetch(`${ACCOUNTS_URL}/oauth/v2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = await response.json();
  if (!response.ok || data.error) {
    if (data.error === "invalid_code") {
      throw new Error(
        "Authorization code is invalid, expired, or already used. Run the command again and complete login in the browser — do not reuse an old code."
      );
    }
    throw new Error(data.error || `Token exchange failed (${response.status})`);
  }
  return data;
}

async function refreshAccessToken(refreshToken) {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: ZOHO_CLIENT_ID,
    client_secret: ZOHO_CLIENT_SECRET,
    refresh_token: refreshToken,
  });

  const response = await fetch(`${ACCOUNTS_URL}/oauth/v2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = await response.json();
  if (!response.ok || data.error) {
    throw new Error(data.error || `Token refresh failed (${response.status})`);
  }
  return data;
}

async function openBrowser(url) {
  const command =
    process.platform === "win32"
      ? `cmd /c start "" "${url}"`
      : process.platform === "darwin"
        ? `open "${url}"`
        : `xdg-open "${url}"`;

  await new Promise((resolve, reject) => {
    exec(command, (error) => (error ? reject(error) : resolve()));
  }).catch(() => {
    console.log("Could not open browser automatically. Open this URL manually:\n", url);
  });
}

async function waitForOAuthCode(authUrl) {
  const redirectUrl = new URL(ZOHO_REDIRECT_URI);
  const port = Number(redirectUrl.port || 80);
  const pathname = redirectUrl.pathname;

  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const reqUrl = new URL(req.url || "/", ZOHO_REDIRECT_URI);
      if (reqUrl.pathname !== pathname) {
        res.writeHead(404);
        res.end("Not found");
        return;
      }

      const code = reqUrl.searchParams.get("code");
      const error = reqUrl.searchParams.get("error");

      if (error) {
        res.writeHead(400, { "Content-Type": "text/html" });
        res.end(`<h1>Authorization failed</h1><p>${error}</p>`);
        server.close();
        reject(new Error(error));
        return;
      }

      if (!code) {
        res.writeHead(400, { "Content-Type": "text/html" });
        res.end("<h1>Missing authorization code</h1>");
        return;
      }

      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(
        "<h1>Authorization successful</h1><p>You can close this tab and return to the terminal.</p>"
      );
      server.close();
      resolve(code);
    });

    server.on("error", reject);

    server.listen(port, async () => {
      console.log(`Listening for OAuth callback on ${ZOHO_REDIRECT_URI}`);
      console.log("Opening browser for Zoho login...\n", authUrl.toString());
      await openBrowser(authUrl.toString());
    });

    setTimeout(() => {
      server.close();
      reject(new Error("OAuth timed out after 5 minutes. Run the command again."));
    }, 5 * 60 * 1000);
  });
}

async function promptForCodeManually() {
  const rl = readline.createInterface({ input, output });
  const code = await rl.question("Enter the code from the redirect URL here: ");
  rl.close();
  return code.trim();
}

async function authorizeInteractive() {
  if (!ZOHO_CLIENT_ID || !ZOHO_CLIENT_SECRET) {
    throw new Error("ZOHO_CLIENT_ID and ZOHO_CLIENT_SECRET must be set in .env");
  }

  const authUrl = new URL(`${ACCOUNTS_URL}/oauth/v2/auth`);
  authUrl.searchParams.set("scope", SCOPES.join(","));
  authUrl.searchParams.set("client_id", ZOHO_CLIENT_ID);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("redirect_uri", ZOHO_REDIRECT_URI);
  authUrl.searchParams.set("access_type", "offline");
  authUrl.searchParams.set("prompt", "consent");

  let code;
  try {
    code = await waitForOAuthCode(authUrl.toString());
  } catch {
    console.log("\nCould not capture OAuth callback automatically.");
    console.log("Open this URL, approve access, then paste the code from the redirect URL:\n");
    console.log(authUrl.toString());
    code = await promptForCodeManually();
  }

  const token = await exchangeCodeForToken(code);
  const saved = {
    access_token: token.access_token,
    refresh_token: token.refresh_token,
    expires_at: Date.now() + (token.expires_in || 3600) * 1000,
    api_domain: token.api_domain,
  };
  await saveTokenFile(saved);
  tokenCache = saved;
  return saved;
}

export async function getAccessToken() {
  if (tokenCache?.access_token && tokenCache.expires_at > Date.now() + 60_000) {
    return tokenCache.access_token;
  }

  let token = await loadTokenFile();
  if (!token) {
    token = await authorizeInteractive();
  } else if (!token.expires_at || token.expires_at <= Date.now() + 60_000) {
    const refreshed = await refreshAccessToken(token.refresh_token);
    token = {
      ...token,
      access_token: refreshed.access_token,
      expires_at: Date.now() + (refreshed.expires_in || 3600) * 1000,
      api_domain: refreshed.api_domain || token.api_domain,
    };
    await saveTokenFile(token);
  }

  tokenCache = token;
  return token.access_token;
}

function isRetryableNetworkError(error) {
  const code = error?.cause?.code || error?.code;
  return (
    error?.name === "AbortError" ||
    code === "UND_ERR_CONNECT_TIMEOUT" ||
    code === "ETIMEDOUT" ||
    code === "ECONNRESET" ||
    code === "ECONNREFUSED" ||
    code === "ENOTFOUND" ||
    code === "EAI_AGAIN"
  );
}

function formatNetworkError(error, url) {
  const host = (() => {
    try {
      return new URL(url).host;
    } catch {
      return url;
    }
  })();
  const code = error?.cause?.code || error?.code || error?.name;
  return (
    `Network error reaching ${host} (${code}). ` +
    "Check your internet connection, firewall, VPN, or try again in a minute."
  );
}

async function fetchWithRetry(url, options = {}) {
  let lastError;
  for (let attempt = 1; attempt <= FETCH_RETRIES; attempt++) {
    try {
      const response = await fetch(url, {
        ...options,
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      return response;
    } catch (error) {
      lastError = error;
      if (!isRetryableNetworkError(error) || attempt === FETCH_RETRIES) break;
      await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
    }
  }
  throw new Error(formatNetworkError(lastError, url), { cause: lastError });
}

export async function zohoRequest(baseUrl, path, options = {}) {
  const accessToken = await getAccessToken();
  const url = `${baseUrl}${path}`;
  const response = await fetchWithRetry(url, {
    ...options,
    headers: {
      Authorization: `Zoho-oauthtoken ${accessToken}`,
      Accept: "application/json",
      ...options.headers,
    },
  });

  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }

  if (isZohoFailure(data, response)) {
    const message =
      data.error_message ||
      data.message ||
      data.error ||
      data.status?.description ||
      `Zoho API error (${response.status})`;
    throw new Error(message);
  }

  return data;
}

function isZohoFailure(data, response) {
  if (!response.ok) return true;
  if (data.status === "failure") return true;
  const code = data.status?.code;
  if (typeof code === "number" && (code < 200 || code >= 300)) return true;
  return false;
}

export async function zohoFormRequest(baseUrl, resourcePath, params) {
  const accessToken = await getAccessToken();
  const body = new URLSearchParams(params);
  const url = `${baseUrl}${resourcePath}`;
  const response = await fetchWithRetry(url, {
    method: "POST",
    headers: {
      Authorization: `Zoho-oauthtoken ${accessToken}`,
      "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
      Accept: "application/json",
    },
    body,
  });

  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }

  if (isZohoFailure(data, response)) {
    const method = params?.method ? ` [${params.method}]` : "";
    const message =
      data.error_message ||
      data.message ||
      data.error ||
      `Zoho API error (${response.status})${method}`;
    throw new Error(message);
  }

  return data;
}
