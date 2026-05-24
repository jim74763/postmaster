import { readFileSync } from "node:fs";

import { OAuth2Client } from "google-auth-library";

import { loadDotEnv } from "./env.js";

loadDotEnv();

const POSTMASTER_SCOPES = [
  "https://www.googleapis.com/auth/postmaster.domain",
  "https://www.googleapis.com/auth/postmaster.traffic.readonly",
] as const;

interface OAuthCredentialObject {
  type?: string;
  client_id?: string;
  client_secret?: string;
  refresh_token?: string;
  installed?: OAuthCredentialObject;
  web?: OAuthCredentialObject;
}

let oauthClient: OAuth2Client | undefined;

export function getDefaultScopes(): readonly string[] {
  return POSTMASTER_SCOPES;
}

export async function getAccessToken(): Promise<string> {
  const staticToken = env("POSTMASTER_ACCESS_TOKEN", "GOOGLE_ACCESS_TOKEN");
  if (staticToken) {
    return staticToken;
  }

  const client = getOAuthClient();
  const accessToken = await client.getAccessToken();
  const token = typeof accessToken === "string" ? accessToken : accessToken.token;

  if (!token) {
    throw new Error("Google OAuth did not return an access token.");
  }

  return token;
}

function getOAuthClient(): OAuth2Client {
  if (oauthClient) {
    return oauthClient;
  }

  const credentials = loadCredentialObject();
  const nestedCredentials = credentials?.installed ?? credentials?.web;
  const credentialSource = nestedCredentials ?? credentials;

  const clientId =
    env("POSTMASTER_CLIENT_ID", "GOOGLE_CLIENT_ID") ?? credentialSource?.client_id;
  const clientSecret =
    env("POSTMASTER_CLIENT_SECRET", "GOOGLE_CLIENT_SECRET") ??
    credentialSource?.client_secret;
  const refreshToken =
    env("POSTMASTER_REFRESH_TOKEN", "GOOGLE_REFRESH_TOKEN") ??
    credentials?.refresh_token ??
    credentialSource?.refresh_token;

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(
      [
        "Missing Google OAuth credentials.",
        "Set POSTMASTER_CLIENT_ID, POSTMASTER_CLIENT_SECRET, and POSTMASTER_REFRESH_TOKEN,",
        "or set POSTMASTER_ACCESS_TOKEN for a short-lived token,",
        "or set POSTMASTER_OAUTH_CREDENTIALS_FILE to an authorized_user JSON file.",
      ].join(" "),
    );
  }

  oauthClient = new OAuth2Client({ clientId, clientSecret });
  oauthClient.setCredentials({
    refresh_token: refreshToken,
    scope: POSTMASTER_SCOPES.join(" "),
  });

  return oauthClient;
}

function loadCredentialObject(): OAuthCredentialObject | undefined {
  const rawJson = env("POSTMASTER_OAUTH_CREDENTIALS", "GOOGLE_OAUTH_CREDENTIALS");
  if (rawJson) {
    return JSON.parse(rawJson) as OAuthCredentialObject;
  }

  const filePath = env(
    "POSTMASTER_OAUTH_CREDENTIALS_FILE",
    "GOOGLE_OAUTH_CREDENTIALS_FILE",
  );
  if (!filePath) {
    return undefined;
  }

  return JSON.parse(readFileSync(filePath, "utf8")) as OAuthCredentialObject;
}

function env(...names: string[]): string | undefined {
  for (const name of names) {
    const value = process.env[name];
    if (value && value.trim()) {
      return value.trim();
    }
  }

  return undefined;
}
