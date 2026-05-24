export interface GoogleDate {
  year: number;
  month: number;
  day: number;
}

const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export function parseGoogleDate(value: string): GoogleDate {
  const match = ISO_DATE_PATTERN.exec(value);
  if (!match) {
    throw new Error(`Invalid date "${value}". Use YYYY-MM-DD.`);
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new Error(`Invalid date "${value}". Use a real calendar date.`);
  }

  return { year, month, day };
}

export function normalizeGoogleDate(value: string | GoogleDate): GoogleDate {
  if (typeof value === "string") {
    return parseGoogleDate(value);
  }

  return value;
}
