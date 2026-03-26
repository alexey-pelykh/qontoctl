// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

/**
 * Commander argParser for boolean option values.
 * Accepts only "true" or "false"; throws on any other input.
 */
export function parseBool(value: string): boolean {
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error(`Expected "true" or "false", got "${value}".`);
}

/**
 * Commander argParser for monetary amount option values.
 * Accepts any finite number; throws on non-numeric input.
 */
export function parseAmount(value: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Expected a numeric amount, got "${value}".`);
  }
  return parsed;
}
