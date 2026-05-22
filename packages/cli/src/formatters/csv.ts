// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

function escapeCsvField(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function toCsvValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "string") {
    return escapeCsvField(value);
  }
  if (typeof value === "object") {
    return escapeCsvField(JSON.stringify(value));
  }
  // Narrow to non-stringifiable-as-object primitives. typescript-eslint sees this
  // as redundant because `String()` accepts any input; the cast is preserved as
  // documentation that the residual type is intentionally a safe primitive set.
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
  return escapeCsvField(String(value as number | boolean | bigint));
}

/**
 * Format an array of records as CSV with a header row.
 *
 * Each record is a plain object. Column order is derived from the keys
 * of the first record. Missing keys in subsequent records produce empty cells.
 */
export function formatCsv(rows: readonly Record<string, unknown>[]): string {
  if (rows.length === 0) {
    return "";
  }

  const first = rows[0];
  if (first === undefined) {
    return "";
  }
  const columns = Object.keys(first);

  const header = columns.map(escapeCsvField).join(",");
  const body = rows.map((row) => columns.map((col) => toCsvValue(row[col])).join(","));

  return [header, ...body].join("\n");
}
