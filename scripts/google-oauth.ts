#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { resolve } from "node:path";
import { URL } from "node:url";

import { OAuth2Client } from "google-auth-library";

import { getDefaultScopes } from "../src/auth.js";
import { loadDotEnv } from "../src/env.js";

loadDotEnv();

let clientId: string;
let clientSecret: string;

try {
  clientId = requiredEnv("POSTMASTER_CLIENT_ID", "GOOGLE_CLIENT_ID");
  clientSecret = requiredEnv("POSTMASTER_CLIENT_SECRET", "GOOGLE_CLIENT_SECRET");
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
const redirectUri =
  process.env.POSTMASTER_OAUTH_REDIRECT_URI ??
  "http://127.0.0.1:0/oauth2callback";
const scopes = (
  process.env.POSTMASTER_OAUTH_SCOPES?.split(/[,\s]+/).filter(Boolean) ??
  getDefaultScopes()
) as string[];

const redirect = new URL(redirectUri);
let oauthClient: OAuth2Client | undefined;

const server = createServer(async (request, response) => {
  try {
    if (!oauthClient) {
      throw new Error("OAuth client is not ready yet.");
    }

    const requestUrl = new URL(request.url ?? "/", redirect.origin);
    if (requestUrl.pathname !== redirect.pathname) {
      response.writeHead(404);
      response.end("Not found");
      return;
    }

    const code = requestUrl.searchParams.get("code");
    const oauthError = requestUrl.searchParams.get("error");
    if (oauthError) {
      throw new Error(`Google OAuth returned error: ${oauthError}`);
    }

    if (!code) {
      throw new Error("OAuth callback did not include a code.");
    }

    const { tokens } = await oauthClient.getToken(code);
    if (!tokens.refresh_token) {
      throw new Error(
        "Google did not return a refresh token. Re-run with prompt=consent or revoke the app grant and try again.",
      );
    }

    response.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Authorization complete. You can return to the terminal.");

    console.log("\nAdd these values to your MCP client environment:\n");
    console.log(`POSTMASTER_CLIENT_ID=${shellEscape(clientId)}`);
    console.log(`POSTMASTER_CLIENT_SECRET=${shellEscape(clientSecret)}`);
    console.log(`POSTMASTER_REFRESH_TOKEN=${shellEscape(tokens.refresh_token)}`);
    writeRefreshTokenToDotEnv(tokens.refresh_token);
    console.log("\nAuthorized user JSON:\n");
    console.log(
      JSON.stringify(
        {
          type: "authorized_user",
          client_id: clientId,
          client_secret: clientSecret,
          refresh_token: tokens.refresh_token,
        },
        null,
        2,
      ),
    );

    server.close();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    response.end(message);
    console.error(message);
    server.close(() => {
      process.exitCode = 1;
    });
  }
});

server.once("error", (error: NodeJS.ErrnoException) => {
  const address = `${redirect.hostname}:${redirect.port || "random"}`;
  if (error.code === "EADDRINUSE") {
    console.error(
      `Could not start OAuth callback listener on ${address}: port is already in use.`,
    );
    console.error(
      "Set POSTMASTER_OAUTH_REDIRECT_URI to another loopback URL, for example http://127.0.0.1:33334/oauth2callback.",
    );
  } else if (error.code === "EACCES" || error.code === "EPERM") {
    console.error(
      `Could not start OAuth callback listener on ${address}: this environment blocked local port binding.`,
    );
    console.error(
      "Run pnpm oauth from a normal terminal, outside the sandboxed Codex command runner.",
    );
  } else {
    console.error(
      `Could not start OAuth callback listener on ${address}: ${error.message}`,
    );
  }

  process.exitCode = 1;
});

server.listen(Number(redirect.port || 0), redirect.hostname, () => {
  const address = server.address() as AddressInfo;
  redirect.port = String(address.port);
  const actualRedirectUri = redirect.toString();

  oauthClient = new OAuth2Client({
    clientId,
    clientSecret,
    redirectUri: actualRedirectUri,
  });

  const authUrl = oauthClient.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: scopes,
  });

  console.log("Open this URL in your browser to authorize Postmaster access:\n");
  console.log(authUrl);
  console.log(`\nWaiting for callback on ${actualRedirectUri} ...`);
});

function requiredEnv(...names: string[]): string {
  for (const name of names) {
    const value = process.env[name];
    if (value && value.trim()) {
      return value.trim();
    }
  }

  throw new Error(`Set one of: ${names.join(", ")}`);
}

function shellEscape(value: string): string {
  if (/^[A-Za-z0-9_./:@-]+$/.test(value)) {
    return value;
  }

  return JSON.stringify(value);
}

function writeRefreshTokenToDotEnv(refreshToken: string): void {
  const envPath = resolve(process.cwd(), process.env.POSTMASTER_DOTENV_FILE ?? ".env");
  const tokenLine = `POSTMASTER_REFRESH_TOKEN=${refreshToken}`;

  if (!existsSync(envPath)) {
    writeFileSync(envPath, `${tokenLine}\n`);
    console.log(`\nSaved POSTMASTER_REFRESH_TOKEN to ${envPath}`);
    return;
  }

  const lines = readFileSync(envPath, "utf8").split(/\r?\n/);
  let replaced = false;
  const nextLines = lines.map((line) => {
    if (/^\s*POSTMASTER_REFRESH_TOKEN\s*=/.test(line)) {
      replaced = true;
      return tokenLine;
    }

    return line;
  });

  if (!replaced) {
    if (nextLines.length > 0 && nextLines[nextLines.length - 1] !== "") {
      nextLines.push("");
    }

    nextLines.push(tokenLine);
  }

  writeFileSync(envPath, `${nextLines.join("\n").replace(/\n+$/, "")}\n`);
  console.log(`\nSaved POSTMASTER_REFRESH_TOKEN to ${envPath}`);
}
