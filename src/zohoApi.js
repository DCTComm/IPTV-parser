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
  ZOHO_REFRESH_TOKEN,
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
  try {
    await fs.writeFile(TOKEN_PATH, JSON.stringify(token, null, 2), "utf8");
  } catch (error) {
    // Read-only or ephemeral filesystem (containers). The in-memory cache
    // carries the process; a restart re-bootstraps from ZOHO_REFRESH_TOKEN.
    console.warn(`Could not persist token to ${TOKEN_PATH}: ${error.message}`);
  }
}

export function extractOAuthCode(input) {
  if (!input) return "";
  const trimmed = String(input).trim();
  if (trimmed.includes("code=")) {
    try {
      const url = new URL(
        trimmed.startsWith("http")
          ? trimmed
          : `http://localhost${trimmed.startsWith("/") || trimmed.startsWith("?") ? "" : "/"}${trimmed}`
      );
      const code = url.searchParams.get("code");
      if (code) return code.trim();
    } catch {
      const match = trimmed.match(/[?&]code=([^&]+)/);
      if (match) return decodeURIComponent(match[1]).trim();
    }
  }
  return trimmed;
}

async function exchangeCodeForToken(code) {
  const cleanCode = extractOAuthCode(code);
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: ZOHO_CLIENT_ID,
    client_secret: ZOHO_CLIENT_SECRET,
    redirect_uri: ZOHO_REDIRECT_URI,
    code: cleanCode,
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

/** Generous enough to cover email/2FA verification during Zoho login. */
const OAUTH_TIMEOUT_MS = 15 * 60 * 1000;

async function waitForOAuthCode(authUrl) {
  const redirectUrl = new URL(ZOHO_REDIRECT_URI);
  const port = Number(redirectUrl.port || 80);
  const pathname = redirectUrl.pathname;

  return new Promise((resolve, reject) => {
    let timeoutHandle;
    const settle = (fn, value) => {
      clearTimeout(timeoutHandle);
      server.close();
      fn(value);
    };

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
        settle(reject, new Error(error));
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
      settle(resolve, code);
    });

    server.on("error", (error) => settle(reject, error));

    server.listen(port, async () => {
      console.log(`Listening for OAuth callback on ${ZOHO_REDIRECT_URI}`);
      console.log("Opening browser for Zoho login...\n", authUrl.toString());
      await openBrowser(authUrl.toString());
    });

    timeoutHandle = setTimeout(() => {
      settle(
        reject,
        new Error(
          `OAuth timed out after ${OAUTH_TIMEOUT_MS / 60000} minutes. Run the command again.`
        )
      );
    }, OAUTH_TIMEOUT_MS);
  });
}

async function promptForCodeManually() {
  const rl = readline.createInterface({ input, output });
  const code = await rl.question("Enter the code from the redirect URL here: ");
  rl.close();
  return code.trim();
}

export async function authorizeInteractive() {
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
  } catch (err) {
    console.log(`\nCould not capture OAuth callback automatically (${err.message || err}).`);
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

  // 1. Try in-memory cache, then token.json on disk
  let token = tokenCache || (await loadTokenFile());

  // 2. Resolve refresh token from token.json or ZOHO_REFRESH_TOKEN (.env)
  const effectiveRefreshToken =
    token?.refresh_token || ZOHO_REFRESH_TOKEN || (process.env.ZOHO_REFRESH_TOKEN || "").trim().replace(/^["']|["']$/g, "");

  if (effectiveRefreshToken) {
    token = { ...(token || {}), refresh_token: effectiveRefreshToken };
  }

  // 3. If no refresh token is found in either source, fall back to interactive auth
  if (!token || !token.refresh_token) {
    if (!process.stdin.isTTY) {
      throw new Error(
        "No Zoho credentials available. Set ZOHO_REFRESH_TOKEN in .env, or point TOKEN_PATH " +
        `at a persistent file (currently ${TOKEN_PATH}). Interactive login needs a ` +
        'terminal — run "npm run auth" locally and copy the refresh token.'
      );
    }
    token = await authorizeInteractive();
  } else if (!token.expires_at || token.expires_at <= Date.now() + 60_000) {
    // 4. Silently generate/refresh access token using the refresh token
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

function formatZohoError(data, response, context = "") {
  const rawMsg =
    data.error_message ||
    data.message ||
    data.error ||
    data.status?.description ||
    `Zoho API error (${response.status})`;

  const isAuthError =
    response.status === 401 ||
    response.status === 403 ||
    (typeof rawMsg === "string" &&
      (rawMsg.toLowerCase().includes("not authorized") ||
        rawMsg.toLowerCase().includes("invalid_token") ||
        rawMsg.toLowerCase().includes("access denied")));

  if (isAuthError) {
    return (
      `${rawMsg}${context ? ` [${context}]` : ""}\n` +
      `[Zoho Authorization Diagnosis]:\n` +
      `  • Missing OAuth Scopes: If scopes were changed recently, run 'npm run auth' to reauthorize. (Refresh tokens do not automatically gain new scopes without interactive re-consent).\n` +
      `  • Account Mismatch / Permissions: Ensure the Zoho account authorized via 'npm run auth' owns or has write permissions on the resource (e.g. ZOHO_SHEET_RESOURCE_ID or Zoho Mail).\n` +
      `  • Sheet Resource ID: Verify ZOHO_SHEET_RESOURCE_ID in .env is correct and accessible.`
    );
  }

  return `${rawMsg}${context ? ` [${context}]` : ""}`;
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
    throw new Error(formatZohoError(data, response, path));
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
    const method = params?.method ? `method=${params.method}` : "";
    throw new Error(formatZohoError(data, response, method));
  }

  return data;
}
