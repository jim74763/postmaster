# Google Postmaster MCP Server

This is a stdio MCP server for the Gmail Postmaster Tools API v2. It exposes tools for listing registered domains, reading domain metadata, checking compliance status, and querying Postmaster traffic metrics.

Google requires OAuth 2.0 for Postmaster Tools API requests. Use a Google account that has access to the domains in Postmaster Tools.

## Tools

- `postmaster_list_domains`
- `postmaster_get_domain`
- `postmaster_get_compliance_status`
- `postmaster_query_domain_stats`
- `postmaster_batch_query_domain_stats`
- `postmaster_metric_reference`

## Setup

1. Enable the Postmaster Tools API in Google Cloud.
2. Configure Google Auth Platform for OAuth:
   - Go to Google Cloud Console > Google Auth Platform.
   - Set the app audience/user type to **External**.
   - Keep the publishing status in **Testing** while you are setting this up.
   - Add your own Google account email under **Test users**.
3. Add the Postmaster scopes under Data Access:

```text
https://www.googleapis.com/auth/postmaster.domain
https://www.googleapis.com/auth/postmaster.traffic.readonly
```

The broad `https://www.googleapis.com/auth/postmaster` scope also works.

4. Create an OAuth client with application type **Desktop app**. Copy the client
   ID and client secret into `.env`:

```bash
cp .env.example .env
```

```dotenv
POSTMASTER_CLIENT_ID=your-client-id
POSTMASTER_CLIENT_SECRET=your-client-secret
POSTMASTER_REFRESH_TOKEN=
```

Install and build:

```bash
pnpm install
pnpm build
```

Create a refresh token:

```bash
pnpm oauth
```

The OAuth helper automatically loads `.env` from the current directory and uses
an available loopback redirect port by default. After the browser authorization
succeeds, it saves `POSTMASTER_REFRESH_TOKEN` back into `.env`.

If you instead create a Web application OAuth client, set
`POSTMASTER_OAUTH_REDIRECT_URI` to a fixed loopback URL and add that exact URL as
an authorized redirect URI in Google Cloud.

Note: while the OAuth app is in Testing mode, only test users can authorize it.
Google can expire refresh tokens for Testing apps after 7 days. If API calls
start failing later, rerun `pnpm oauth` or move the app to production after
completing Google's requirements.

## Claude Desktop

On macOS, Claude Desktop reads:

```text
~/Library/Application Support/Claude/claude_desktop_config.json
```

Add this MCP server entry. Use the absolute path to this project:

```json
{
  "mcpServers": {
    "google-postmaster": {
      "command": "/opt/homebrew/bin/node",
      "args": ["/Users/jimvanduijsen/Programming/GitHub/postmaster/dist/src/index.js"],
      "env": {
        "POSTMASTER_DOTENV_FILE": "/Users/jimvanduijsen/Programming/GitHub/postmaster/.env"
      }
    }
  }
}
```

Fully quit and restart Claude Desktop after changing this file.

## Claude Code

From this project directory, add the server to Claude Code local config:

```bash
claude mcp add-json --scope local google-postmaster '{"command":"/opt/homebrew/bin/node","args":["/Users/jimvanduijsen/Programming/GitHub/postmaster/dist/src/index.js"],"env":{"POSTMASTER_DOTENV_FILE":"/Users/jimvanduijsen/Programming/GitHub/postmaster/.env"}}'
```

Check the connection:

```bash
claude mcp get google-postmaster
```

Expected status:

```text
Status: ✓ Connected
```

## Other MCP Clients

Use the built server with any stdio MCP client. Prefer pointing the server at
the `.env` file:

```json
{
  "mcpServers": {
    "google-postmaster": {
      "command": "node",
      "args": ["/absolute/path/to/postmaster/dist/src/index.js"],
      "env": {
        "POSTMASTER_DOTENV_FILE": "/absolute/path/to/postmaster/.env"
      }
    }
  }
}
```

For quick testing, you can use a short-lived token instead:

```json
{
  "env": {
    "POSTMASTER_ACCESS_TOKEN": "ya29..."
  }
}
```

## Example Tool Inputs

Query spam rate for one date range:

```json
{
  "domain": "example.com",
  "dateRanges": [
    {
      "start": "2026-05-01",
      "end": "2026-05-07"
    }
  ],
  "metrics": [
    {
      "name": "spam_rate",
      "standardMetric": "SPAM_RATE"
    }
  ],
  "aggregationGranularity": "DAILY"
}
```

Query DKIM authentication success:

```json
{
  "domain": "example.com",
  "dates": ["2026-05-01"],
  "metrics": [
    {
      "name": "dkim_auth_success",
      "standardMetric": "AUTH_SUCCESS_RATE",
      "filter": "auth_type = \"dkim\""
    }
  ]
}
```

## Credential Options

The server checks credentials in this order:

1. `POSTMASTER_ACCESS_TOKEN` or `GOOGLE_ACCESS_TOKEN`
2. `POSTMASTER_CLIENT_ID`, `POSTMASTER_CLIENT_SECRET`, and `POSTMASTER_REFRESH_TOKEN`
3. `POSTMASTER_OAUTH_CREDENTIALS`, containing authorized user JSON
4. `POSTMASTER_OAUTH_CREDENTIALS_FILE`, pointing to authorized user JSON

`GOOGLE_*` variants are accepted for the client ID, client secret, refresh token, and OAuth credentials file.
The server loads `.env` automatically from the current directory. Set
`POSTMASTER_DOTENV_FILE=/absolute/path/to/.env` when the MCP client starts the
server from another working directory.

## API Notes

The server targets `https://gmailpostmastertools.googleapis.com/v2`. By default, `postmaster_query_domain_stats` queries `SPAM_RATE` if no metrics are supplied. Use `postmaster_metric_reference` to see supported standard metrics and required filter syntax.

## References

- [Postmaster Tools API setup](https://developers.google.com/workspace/gmail/postmaster/guides/setup)
- [Configure OAuth consent and scopes](https://developers.google.com/workspace/guides/configure-oauth-consent)
- [Manage Google Auth Platform app audience](https://support.google.com/cloud/answer/15549945)
