// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

/**
 * Parses a JSON string, throwing a user-friendly error on failure.
 *
 * @param input - The raw JSON string to parse
 * @param context - A label for the option or source (e.g. "--body", "--file path.json")
 * @returns The parsed value
 */
export function parseJson(input: string, context: string): unknown {
  try {
    return JSON.parse(input);
  } catch (error) {
    const detail = error instanceof SyntaxError ? `: ${error.message}` : "";
    throw new Error(`Invalid JSON for ${context}${detail}`);
  }
}
