import * as z from "zod/v4";

import { STANDARD_METRICS } from "./postmaster.js";

export const googleDateSchema = z.object({
  year: z.number().int().min(1),
  month: z.number().int().min(1).max(12),
  day: z.number().int().min(1).max(31),
});

export const dateInputSchema = z.union([
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD."),
  googleDateSchema,
]);

export const metricInputSchema = z.object({
  name: z
    .string()
    .min(1)
    .describe("User-defined result key used to identify this metric in the response."),
  standardMetric: z
    .enum(STANDARD_METRICS)
    .describe("Google Postmaster standard metric to query."),
  filter: z
    .string()
    .optional()
    .describe('Optional API filter, for example: auth_type = "dkim".'),
});

export const queryStatsSchema = z.object({
  domain: z
    .string()
    .min(1)
    .describe("Fully qualified domain, for example example.com."),
  metrics: z
    .array(metricInputSchema)
    .min(1)
    .optional()
    .describe("Metrics to query. Defaults to SPAM_RATE when omitted."),
  dateRanges: z
    .array(
      z.object({
        start: dateInputSchema.describe("Inclusive start date."),
        end: dateInputSchema.describe("Inclusive end date."),
      }),
    )
    .min(1)
    .optional()
    .describe("Inclusive date ranges to query."),
  dates: z
    .array(dateInputSchema)
    .min(1)
    .optional()
    .describe("Specific dates to query."),
  pageSize: z.number().int().min(1).max(200).optional(),
  pageToken: z.string().optional(),
  aggregationGranularity: z.enum(["DAILY", "OVERALL"]).optional(),
});

export const listDomainsSchema = z.object({
  pageSize: z.number().int().min(1).max(200).optional(),
  pageToken: z.string().optional(),
});

export const domainSchema = z.object({
  domain: z
    .string()
    .min(1)
    .describe("Fully qualified domain, for example example.com."),
});
