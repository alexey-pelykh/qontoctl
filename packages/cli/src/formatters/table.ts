// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

function toDisplayValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "object") {
    return JSON.stringify(value);
  }
  return String(value as number | boolean | bigint);
}

/**
 * Format an array of records as a column-aligned text table.
 *
 * Column headers are derived from the keys of the first record.
 * All columns are left-aligned and padded with spaces.
 */
export function formatTable(rows: readonly Record<string, unknown>[]): string {
  if (rows.length === 0) {
    return "";
  }

  const first = rows[0];
  if (first === undefined) {
    return "";
  }
  const columns = Object.keys(first);

  const cells = rows.map((row) => columns.map((col) => toDisplayValue(row[col])));

  const widths = columns.map((col, i) => Math.max(col.length, ...cells.map((row) => (row[i] ?? "").length)));

  const header = columns.map((col, i) => col.padEnd(widths[i] ?? 0)).join("  ");
  const separator = widths.map((w) => "-".repeat(w)).join("  ");
  const body = cells.map((row) => row.map((cell, i) => cell.padEnd(widths[i] ?? 0)).join("  "));

  return [header, separator, ...body].join("\n");
}
