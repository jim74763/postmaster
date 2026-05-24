#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/server";
import { StdioServerTransport } from "@modelcontextprotocol/server";
import * as z from "zod/v4";

import {
  batchQueryDomainStats,
  getComplianceStatus,
  getDomain,
  getMetricReference,
  listDomains,
  queryDomainStats,
} from "./postmaster.js";
import {
  domainSchema,
  listDomainsSchema,
  queryStatsSchema,
} from "./schemas.js";

const server = new McpServer({
  name: "google-postmaster",
  version: "0.1.0",
});

server.registerTool(
  "postmaster_list_domains",
  {
    description:
      "List Gmail Postmaster Tools domains registered to the authenticated Google user.",
    inputSchema: listDomainsSchema,
  },
  async (input) => jsonResult(await listDomains(input)),
);

server.registerTool(
  "postmaster_get_domain",
  {
    description:
      "Get metadata for a Gmail Postmaster Tools domain registered to the authenticated Google user.",
    inputSchema: domainSchema,
  },
  async ({ domain }) => jsonResult(await getDomain(domain)),
);

server.registerTool(
  "postmaster_get_compliance_status",
  {
    description:
      "Get SPF, DKIM, DMARC, TLS, spam-rate, and unsubscribe compliance status for a Postmaster domain.",
    inputSchema: domainSchema,
  },
  async ({ domain }) => jsonResult(await getComplianceStatus(domain)),
);

server.registerTool(
  "postmaster_query_domain_stats",
  {
    description:
      "Query Gmail Postmaster domain statistics for one domain, metrics, and dates or date ranges.",
    inputSchema: queryStatsSchema,
  },
  async (input) => jsonResult(await queryDomainStats(input)),
);

server.registerTool(
  "postmaster_batch_query_domain_stats",
  {
    description:
      "Run up to 100 Gmail Postmaster domain stats queries in one API request.",
    inputSchema: z.object({
      requests: z.array(queryStatsSchema).min(1).max(100),
    }),
  },
  async (input) => jsonResult(await batchQueryDomainStats(input)),
);

server.registerTool(
  "postmaster_metric_reference",
  {
    description:
      "Return supported Gmail Postmaster v2 standard metrics and the filter syntax each metric expects.",
    inputSchema: z.object({}),
  },
  async () => jsonResult(getMetricReference()),
);

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Google Postmaster MCP server running on stdio");
}

function jsonResult(value: unknown): {
  content: Array<{ type: "text"; text: string }>;
} {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(value, null, 2),
      },
    ],
  };
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Fatal error: ${message}`);
  process.exit(1);
});
