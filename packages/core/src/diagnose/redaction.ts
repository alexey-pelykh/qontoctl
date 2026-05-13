// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import type { QontoctlConfig } from "../config/types.js";

/**
 * Whitelist-only redaction of a check's evidence object.
 *
 * Drops every key not in the `allowedFields` set. Returns the filtered
 * evidence, or `undefined` when the result is empty (so the caller can
 * omit the field from its output entirely rather than emitting `{}`).
 *
 * Default-deny by construction: any field a check accidentally adds
 * (e.g., a refactor that pulls in `iban` or `balance_cents` from a
 * Qonto response) is dropped without breaking the check, while still
 * being caught by the global tripwire if it leaks via `detail` strings.
 */
export function whitelistEvidence(
  evidence: Record<string, unknown> | undefined,
  allowedFields: readonly string[],
): Record<string, unknown> | undefined {
  if (evidence === undefined) return undefined;
  const allowed = new Set(allowedFields);
  const filtered: Record<string, unknown> = {};
  let kept = 0;
  for (const [key, value] of Object.entries(evidence)) {
    if (allowed.has(key)) {
      filtered[key] = value;
      kept++;
    }
  }
  return kept === 0 ? undefined : filtered;
}

/**
 * Per-run redaction context: the literal credential values to scrub
 * from any string output as a final safety net.
 *
 * Built from {@link buildRedactionContext} so callers do not have to
 * remember which `config` fields are sensitive.
 */
export interface RedactionContext {
  /** Literal secret values to scrub from any rendered string. */
  readonly secrets: readonly string[];
}

/**
 * Outcome of a global-tripwire pass. `cleaned` is the input with all
 * matched secrets / patterns replaced; `leaks` is a non-secret
 * description of what matched (for CI auditing).
 */
export interface TripwireResult {
  readonly cleaned: string;
  readonly leaks: readonly string[];
}

/**
 * JWT-shaped tokens (`eyJxxx.yyy.zzz`). Most opaque OAuth tokens are not
 * JWTs but Qonto's are, and this catches accidental token-in-detail leaks.
 */
const JWT_RE = /\beyJ[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]+/g;

/**
 * `Authorization: Bearer xxx` style headers — never legitimate in
 * diagnose output.
 */
const BEARER_RE = /\bBearer\s+[A-Za-z0-9._~+/=-]{20,}/g;

/**
 * Full IBAN: ISO-3166 alpha-2 country code + 2 check digits + 11–30
 * alphanumeric. Diagnose deliberately reports counts and statuses, not
 * IBANs — any match means a check leaked one through `detail`.
 */
const FULL_IBAN_RE = /\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/g;

/**
 * Card PAN: 13–19 contiguous digits. Imperfect (matches long numeric
 * IDs too), but the failure mode is "false positive masks a benign
 * number" rather than "leaks a real PAN", which is the safer bias.
 */
const PAN_RE = /\b\d{13,19}\b/g;

/**
 * Apply the global tripwire to a rendered string. Replaces any matched
 * secret or pattern with a `[redacted-*]` placeholder.
 *
 * Designed as the LAST step before emitting output — by the time
 * tripwire runs, the per-check `whitelistEvidence` should already
 * have prevented most leakage. A non-empty `leaks` array indicates
 * a defense-in-depth save and SHOULD be surfaced to the developer
 * (CI redaction-audit test fails the build).
 */
export function applyTripwire(text: string, ctx: RedactionContext): TripwireResult {
  const leaks: string[] = [];
  let cleaned = text;

  // Literal-secret scrub first — minimum 8-char threshold avoids
  // false positives on short, non-secret config values that happen
  // to coincide with a substring of the output.
  for (const secret of ctx.secrets) {
    if (secret.length < 8) continue;
    if (cleaned.includes(secret)) {
      cleaned = cleaned.replaceAll(secret, "[redacted-secret]");
      leaks.push(`literal-secret length=${String(secret.length)}`);
    }
  }

  cleaned = cleaned.replace(JWT_RE, () => {
    leaks.push("jwt-like-token");
    return "[redacted-jwt]";
  });
  cleaned = cleaned.replace(BEARER_RE, () => {
    leaks.push("bearer-header");
    return "Bearer [redacted]";
  });
  cleaned = cleaned.replace(FULL_IBAN_RE, () => {
    leaks.push("iban-like");
    return "[redacted-iban]";
  });
  cleaned = cleaned.replace(PAN_RE, () => {
    leaks.push("pan-like-number");
    return "[redacted-pan]";
  });

  return { cleaned, leaks };
}

/**
 * Build a {@link RedactionContext} populated with every literal secret
 * present in the resolved config. Tokens / keys that are absent contribute
 * nothing.
 */
export function buildRedactionContext(config: QontoctlConfig): RedactionContext {
  const secrets: string[] = [];
  if (config.apiKey?.secretKey) secrets.push(config.apiKey.secretKey);
  if (config.oauth?.accessToken) secrets.push(config.oauth.accessToken);
  if (config.oauth?.refreshToken) secrets.push(config.oauth.refreshToken);
  if (config.oauth?.stagingToken) secrets.push(config.oauth.stagingToken);
  if (config.oauth?.clientSecret) secrets.push(config.oauth.clientSecret);
  return { secrets };
}
