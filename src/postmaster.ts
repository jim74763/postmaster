import { getAccessToken } from "./auth.js";
import { type GoogleDate, normalizeGoogleDate } from "./google-date.js";

const API_BASE_URL =
  process.env.POSTMASTER_API_BASE_URL ??
  "https://gmailpostmastertools.googleapis.com";

export const STANDARD_METRICS = [
  "FEEDBACK_LOOP_ID",
  "FEEDBACK_LOOP_SPAM_RATE",
  "SPAM_RATE",
  "AUTH_SUCCESS_RATE",
  "TLS_ENCRYPTION_MESSAGE_COUNT",
  "TLS_ENCRYPTION_RATE",
  "DELIVERY_ERROR_COUNT",
  "DELIVERY_ERROR_RATE",
] as const;

export type StandardMetric = (typeof STANDARD_METRICS)[number];

export interface MetricInput {
  name: string;
  standardMetric: StandardMetric;
  filter?: string;
}

export interface GoogleMetricDefinition {
  name: string;
  baseMetric: {
    standardMetric: StandardMetric;
  };
  filter?: string;
}

export interface DateRangeInput {
  start: string | GoogleDate;
  end: string | GoogleDate;
}

export interface QueryStatsInput {
  domain: string;
  metrics?: MetricInput[];
  dateRanges?: DateRangeInput[];
  dates?: Array<string | GoogleDate>;
  pageSize?: number;
  pageToken?: string;
  aggregationGranularity?: "DAILY" | "OVERALL";
}

export interface BatchQueryStatsInput {
  requests: QueryStatsInput[];
}

export interface PostmasterApiOptions {
  method?: "GET" | "POST";
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
}

export class PostmasterApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly responseBody: unknown,
  ) {
    super(message);
    this.name = "PostmasterApiError";
  }
}

export function getMetricReference(): Array<{
  metric: StandardMetric;
  notes: string;
}> {
  return [
    {
      metric: "SPAM_RATE",
      notes: "User-reported spam rate.",
    },
    {
      metric: "AUTH_SUCCESS_RATE",
      notes: 'Requires filter: auth_type = "spf", auth_type = "dkim", or auth_type = "dmarc".',
    },
    {
      metric: "TLS_ENCRYPTION_MESSAGE_COUNT",
      notes: 'Requires filter: traffic_direction = "inbound" or traffic_direction = "outbound".',
    },
    {
      metric: "TLS_ENCRYPTION_RATE",
      notes: 'Requires filter: traffic_direction = "inbound" or traffic_direction = "outbound".',
    },
    {
      metric: "DELIVERY_ERROR_COUNT",
      notes:
        'Optional filter: empty, error_type = "reject", error_type = "temp_fail", or error_type plus error_reason.',
    },
    {
      metric: "DELIVERY_ERROR_RATE",
      notes:
        'Optional filter: empty, error_type = "reject", error_type = "temp_fail", or error_type plus error_reason.',
    },
    {
      metric: "FEEDBACK_LOOP_ID",
      notes:
        'Optional filter: aggregation_key_type = "FROM_HEADER" or aggregation_key_type = "ALL_DKIM".',
    },
    {
      metric: "FEEDBACK_LOOP_SPAM_RATE",
      notes:
        'Requires filter: feedback_loop_id = "..."; optional aggregation_key_type may be included.',
    },
  ];
}

export async function listDomains(input: {
  pageSize?: number;
  pageToken?: string;
}): Promise<unknown> {
  return postmasterRequest("/v2/domains", {
    query: {
      pageSize: input.pageSize,
      pageToken: input.pageToken,
    },
  });
}

export async function getDomain(domain: string): Promise<unknown> {
  return postmasterRequest(`/v2/${domainResourcePath(domain)}`);
}

export async function getComplianceStatus(domain: string): Promise<unknown> {
  return postmasterRequest(`/v2/${domainResourcePath(domain)}/complianceStatus`);
}

export async function queryDomainStats(input: QueryStatsInput): Promise<unknown> {
  return postmasterRequest(`/v2/${domainResourcePath(input.domain)}/domainStats:query`, {
    method: "POST",
    body: buildQueryDomainStatsRequest(input),
  });
}

export async function batchQueryDomainStats(
  input: BatchQueryStatsInput,
): Promise<unknown> {
  return postmasterRequest("/v2/domainStats:batchQuery", {
    method: "POST",
    body: {
      requests: input.requests.map((request) => ({
        parent: domainResource(request.domain),
        ...buildQueryDomainStatsRequest(request),
      })),
    },
  });
}

function buildQueryDomainStatsRequest(input: QueryStatsInput): Record<string, unknown> {
  return omitUndefined({
    metricDefinitions: buildMetricDefinitions(input.metrics),
    timeQuery: buildTimeQuery(input),
    pageSize: input.pageSize,
    pageToken: input.pageToken,
    aggregationGranularity: input.aggregationGranularity,
  });
}

function buildMetricDefinitions(metrics?: MetricInput[]): GoogleMetricDefinition[] {
  const inputs =
    metrics && metrics.length > 0
      ? metrics
      : [{ name: "spam_rate", standardMetric: "SPAM_RATE" as const }];

  return inputs.map((metric) =>
    omitUndefined({
      name: metric.name,
      baseMetric: {
        standardMetric: metric.standardMetric,
      },
      filter: metric.filter,
    }) as GoogleMetricDefinition,
  );
}

function buildTimeQuery(input: QueryStatsInput): Record<string, unknown> {
  if (input.dates && input.dates.length > 0) {
    return {
      dateList: {
        dates: input.dates.map(normalizeGoogleDate),
      },
    };
  }

  if (input.dateRanges && input.dateRanges.length > 0) {
    return {
      dateRanges: {
        dateRanges: input.dateRanges.map((range) => ({
          start: normalizeGoogleDate(range.start),
          end: normalizeGoogleDate(range.end),
        })),
      },
    };
  }

  throw new Error("Provide either dates or dateRanges when querying domain stats.");
}

function domainResource(domain: string): string {
  return `domains/${domainName(domain)}`;
}

function domainResourcePath(domain: string): string {
  return `domains/${encodeURIComponent(domainName(domain))}`;
}

function domainName(domain: string): string {
  const trimmed = domain.trim();
  if (!trimmed) {
    throw new Error("Domain must not be empty.");
  }

  return trimmed
    .replace(/^domains\//, "")
    .replace(/\/complianceStatus$/, "")
    .replace(/\/domainStats$/, "");
}

async function postmasterRequest(
  path: string,
  options: PostmasterApiOptions = {},
): Promise<unknown> {
  const url = new URL(path, API_BASE_URL);
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${await getAccessToken()}`,
    Accept: "application/json",
    "User-Agent": "google-postmaster-mcp/0.1.0",
  };

  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(url, {
    method: options.method ?? "GET",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  const responseText = await response.text();
  const responseBody = parseJson(responseText);

  if (!response.ok) {
    throw new PostmasterApiError(
      buildApiErrorMessage(response.status, response.statusText, responseBody),
      response.status,
      responseBody,
    );
  }

  return responseBody ?? {};
}

function buildApiErrorMessage(
  status: number,
  statusText: string,
  responseBody: unknown,
): string {
  if (
    responseBody &&
    typeof responseBody === "object" &&
    "error" in responseBody &&
    responseBody.error &&
    typeof responseBody.error === "object" &&
    "message" in responseBody.error
  ) {
    return `Google Postmaster API error ${status}: ${String(responseBody.error.message)}`;
  }

  return `Google Postmaster API error ${status}: ${statusText}`;
}

function parseJson(value: string): unknown {
  if (!value) {
    return undefined;
  }

  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function omitUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  ) as T;
}
