// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

/**
 * Schema-vs-runtime contract probe (local drift detector).
 *
 * Calls a representative sample of Qonto GET endpoints with OAuth credentials,
 * parses the live response with the matching Zod schema, and emits a drift
 * report listing extra fields, missing fields, and strictness mismatches per
 * endpoint, with suggested Zod declaration corrections.
 *
 * READ-ONLY by construction: only GET endpoints in `contract-probe.endpoints.json`.
 * SUGGEST-ONLY by design: never edits schema files; output is a JSON report +
 * console table. Manual review and Zod-file edits are downstream.
 *
 * Usage:
 *   pnpm contract-probe                   — run probe (uses resolved config)
 *   QONTOCTL_CONFIG_FILE=./.qontoctl.yaml pnpm contract-probe
 *   QONTOCTL_PROFILE=name pnpm contract-probe
 *
 * Exit codes:
 *   0 — all probed endpoints are clean (no drift detected)
 *   1 — drift detected on one or more endpoints (report written)
 *   2 — OAuth credentials missing, expired, or refresh failed (clear error)
 *   3 — config / network / schema-shape error (configuration problem)
 *
 * See:
 *   - docs/designs/e2e-test-reliability.md §8.1 (design contract)
 *   - docs/prds/e2e-test-reliability.md §4.4 (R-CP-1..R-CP-4) + §5 Scenario 4
 *   - CLAUDE.md (project conventions)
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { z } from "zod";

import {
  ConfigError,
  HttpClient,
  OAuthRefreshError,
  QontoApiError,
  QontoRateLimitError,
  createOAuthAuthorization,
  resolveConfig,
  resolveScaMethod,
  OAUTH_TOKEN_URL,
  OAUTH_TOKEN_SANDBOX_URL,
} from "@qontoctl/core";
import * as CoreSchemas from "@qontoctl/core";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Typed error carrying an exit code for the script's `process.exit()` call.
 *
 * Helpers throw {@link ProbeError}; `main()` catches at the top level and
 * exits exactly once with the carried code. This keeps the pure helpers
 * (`walkKeys`, `diffSchema`, `suggestCorrection`) free of `process.exit()`
 * side effects and trivially unit-testable.
 */
export class ProbeError extends Error {
  readonly exitCode: 0 | 1 | 2 | 3;
  constructor(message: string, exitCode: 0 | 1 | 2 | 3) {
    super(message);
    this.name = "ProbeError";
    this.exitCode = exitCode;
  }
}

/** Per-field strictness flags extracted from a Zod schema. */
export interface KeySpec {
  readonly isNullable: boolean;
  readonly isOptional: boolean;
}

/** A field present in runtime but absent from the schema. */
export interface ExtraField {
  readonly field: string;
  readonly observed_type: string;
}

/** A field present in schema but absent from runtime (and not optional). */
export interface MissingField {
  readonly field: string;
}

/** A field present in both but with mismatched strictness. */
export interface StrictnessMismatch {
  readonly field: string;
  readonly observed: "null" | string;
  readonly schema_strictness: "non-nullable" | "required";
}

/** A drift issue against a specific schema, used as input to suggestCorrection. */
export type DriftIssue =
  | (ExtraField & { readonly kind: "extra_field"; readonly schema_name: string })
  | (MissingField & { readonly kind: "missing_field"; readonly schema_name: string })
  | (StrictnessMismatch & { readonly kind: "strictness_mismatch"; readonly schema_name: string });

/** Full diff between a response object and a schema. */
export interface SchemaDiff {
  readonly extra_fields: ExtraField[];
  readonly missing_fields: MissingField[];
  readonly strictness_mismatches: StrictnessMismatch[];
}

/** Probe result for a single endpoint, written to the JSON report. */
export interface SchemaDriftReport {
  readonly endpoint_id: string;
  readonly method: string;
  readonly path: string;
  readonly schema: string;
  readonly status: "ok" | "drift" | "skipped" | "error";
  readonly extra_fields: ExtraField[];
  readonly missing_fields: MissingField[];
  readonly strictness_mismatches: StrictnessMismatch[];
  readonly suggested_fixes: string[];
  readonly error?: string;
  readonly captured_at: string;
}

/** One endpoint entry from `contract-probe.endpoints.json`. */
export interface EndpointConfig {
  readonly id: string;
  readonly method: string;
  readonly path: string;
  readonly query?: Record<string, string>;
  readonly schema: string;
  readonly response_path: string;
  readonly notes?: string;
}

interface EndpointsFile {
  readonly endpoints: readonly EndpointConfig[];
}

// ---------------------------------------------------------------------------
// Pure functions (unit-tested in contract-probe.test.ts)
// ---------------------------------------------------------------------------

/**
 * Extract the field map from a Zod object schema, capturing nullable / optional
 * flags. Unwraps `ZodOptional`/`ZodNullable` wrappers iteratively via the
 * Zod 4 `_zod.def.innerType` chain to support `.nullable().optional()` in
 * either order.
 *
 * Schemas not satisfying `instanceof z.ZodObject` should be rejected by the
 * caller before invoking this helper — the function assumes a `.shape` field.
 */
export function walkKeys(schema: z.ZodObject<z.ZodRawShape>): Map<string, KeySpec> {
  const result = new Map<string, KeySpec>();
  // `schema.shape` values are typed as Zod's internal `$ZodType` interface;
  // they are `z.ZodType` instances at runtime (the `instanceof` checks below
  // confirm this). The cast bridges the public/internal type split.
  for (const [key, raw] of Object.entries(schema.shape)) {
    let inner: z.ZodType = raw as z.ZodType;
    let isNullable = false;
    let isOptional = false;
    // Unwrap ZodOptional / ZodNullable iteratively; both orderings work.
    while (inner instanceof z.ZodOptional || inner instanceof z.ZodNullable) {
      if (inner instanceof z.ZodOptional) isOptional = true;
      if (inner instanceof z.ZodNullable) isNullable = true;
      inner = (inner as unknown as { _zod: { def: { innerType: z.ZodType } } })._zod.def.innerType;
    }
    result.set(key, { isNullable, isOptional });
  }
  return result;
}

/**
 * Diff a runtime response against a Zod object schema. Walks nested objects
 * (qualifying paths with `.`) and arrays (using the first element as a sample
 * and qualifying with `[]`). Returns drift in three buckets: extra fields,
 * missing required fields, and strictness mismatches (null observed where
 * schema is non-nullable).
 *
 * Schemas not satisfying `instanceof z.ZodObject` are treated as "no fields
 * to diff" and return an empty diff — the caller catches the schema-shape
 * error at config-load time, not here.
 */
export function diffSchema(schema: z.ZodType, response: unknown): SchemaDiff {
  const extra_fields: ExtraField[] = [];
  const missing_fields: MissingField[] = [];
  const strictness_mismatches: StrictnessMismatch[] = [];
  walkDiff(schema, response, "", { extra_fields, missing_fields, strictness_mismatches });
  return { extra_fields, missing_fields, strictness_mismatches };
}

function walkDiff(
  schema: z.ZodType,
  response: unknown,
  pathPrefix: string,
  acc: {
    extra_fields: ExtraField[];
    missing_fields: MissingField[];
    strictness_mismatches: StrictnessMismatch[];
  },
): void {
  // Unwrap optional/nullable/preprocess wrappers for nested traversal — the
  // wrapper's own strictness was already recorded by the parent's walkKeys;
  // here we descend into the inner schema for nested object/array diffing.
  const unwrapped = unwrapForDescent(schema);

  if (unwrapped instanceof z.ZodObject) {
    if (response === null || typeof response !== "object" || Array.isArray(response)) {
      return; // can't diff non-object against object schema; caller may flag elsewhere
    }
    const responseObj = response as Record<string, unknown>;
    const keys = walkKeys(unwrapped as z.ZodObject<z.ZodRawShape>);

    // Extra fields: in response, not in schema.
    for (const key of Object.keys(responseObj)) {
      if (!keys.has(key)) {
        const qualified = qualifyPath(pathPrefix, key);
        acc.extra_fields.push({ field: qualified, observed_type: typeofObserved(responseObj[key]) });
      }
    }

    // Missing fields + strictness mismatches: walk schema keys.
    for (const [key, spec] of keys.entries()) {
      const qualified = qualifyPath(pathPrefix, key);
      const hasKey = Object.prototype.hasOwnProperty.call(responseObj, key);
      const value = hasKey ? responseObj[key] : undefined;

      if (!hasKey) {
        if (!spec.isOptional) {
          acc.missing_fields.push({ field: qualified });
        }
        continue;
      }
      if (value === null) {
        if (!spec.isNullable) {
          acc.strictness_mismatches.push({
            field: qualified,
            observed: "null",
            schema_strictness: "non-nullable",
          });
        }
        continue;
      }

      // Recurse into nested object/array. Cast bridges the public/internal
      // type split — see walkKeys for the same pattern.
      const childSchema = (unwrapped as z.ZodObject<z.ZodRawShape>).shape[key] as z.ZodType | undefined;
      if (childSchema !== undefined) {
        walkDiff(childSchema, value, qualified, acc);
      }
    }
    return;
  }

  if (unwrapped instanceof z.ZodArray) {
    if (!Array.isArray(response) || response.length === 0) return;
    const elementSchema = (unwrapped as unknown as { _zod: { def: { element: z.ZodType } } })._zod.def.element;
    // Sample the first element for shape diffing — matches probe sampling
    // semantics where we use `per_page=1`.
    walkDiff(elementSchema, response[0], `${pathPrefix}[]`, acc);
    return;
  }

  // Other Zod types (string, number, boolean, enum, literal, etc.) are leaf
  // values; no nested keys to diff.
}

/**
 * Unwrap a schema for nested-traversal purposes — descends through
 * ZodOptional / ZodNullable / ZodPipe to reach the underlying structural
 * schema (ZodObject, ZodArray, or leaf). Unlike {@link unwrapToObject} this
 * does NOT enforce that the result is an object — leaves and arrays are
 * legitimate descent targets.
 */
function unwrapForDescent(schema: z.ZodType): z.ZodType {
  let inner: z.ZodType = schema;
  for (let i = 0; i < 16; i++) {
    if (inner instanceof z.ZodOptional || inner instanceof z.ZodNullable) {
      inner = (inner as unknown as { _zod: { def: { innerType: z.ZodType } } })._zod.def.innerType;
      continue;
    }
    const def = (inner as unknown as { _zod?: { def?: { out?: unknown; in?: unknown } } })._zod?.def;
    if (
      def !== undefined &&
      def.out instanceof z.ZodType &&
      !(inner instanceof z.ZodObject) &&
      !(inner instanceof z.ZodArray)
    ) {
      inner = def.out;
      continue;
    }
    return inner;
  }
  return inner;
}

function qualifyPath(prefix: string, key: string): string {
  if (prefix === "") return key;
  if (prefix.endsWith("]")) return `${prefix}.${key}`;
  return `${prefix}.${key}`;
}

function typeofObserved(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

/**
 * Format a single drift issue as an actionable Zod-declaration suggestion.
 * Output is a human-readable string — the probe never auto-applies fixes
 * (suggest-don't-apply per R-CP-4).
 */
export function suggestCorrection(issue: DriftIssue): string {
  switch (issue.kind) {
    case "extra_field": {
      const zodType = zodTypeForObserved(issue.observed_type);
      return `${issue.schema_name}: add \`${issue.field}: z.${zodType}().nullable().optional()\` — runtime response includes this field (observed type: ${issue.observed_type}); permissive declaration recommended`;
    }
    case "missing_field": {
      return `${issue.schema_name}.${issue.field}: runtime response omitted (field absent entirely). Relax to \`.optional()\` (preserve nullability if any) — change \`<existing>\` to \`<existing>.optional()\``;
    }
    case "strictness_mismatch": {
      return `${issue.schema_name}.${issue.field}: response is null but schema is ${issue.schema_strictness}. Relax to \`.nullable()\` (or \`.nullable().optional()\` if also absent on other responses)`;
    }
  }
}

function zodTypeForObserved(observed: string): string {
  switch (observed) {
    case "string":
      return "string";
    case "number":
      return "number";
    case "boolean":
      return "boolean";
    case "null":
      return "unknown";
    case "array":
      return "array(z.unknown())";
    case "object":
      return "object({})";
    default:
      return "unknown";
  }
}

/**
 * Resolve a `response_path` like `"organization"` or `"quotes[0]"` against
 * the response object. Returns `undefined` if the path doesn't resolve
 * (e.g., empty array at `[0]`).
 */
export function resolveResponsePath(response: unknown, path: string): unknown {
  // Tokenize: keys separated by `.`, `[N]` for array indices
  const tokens = tokenizePath(path);
  let current: unknown = response;
  for (const token of tokens) {
    if (current === null || current === undefined) return undefined;
    if (token.kind === "key") {
      if (typeof current !== "object") return undefined;
      current = (current as Record<string, unknown>)[token.value];
    } else {
      if (!Array.isArray(current)) return undefined;
      current = current[token.index];
    }
  }
  return current;
}

function tokenizePath(path: string): Array<{ kind: "key"; value: string } | { kind: "index"; index: number }> {
  const tokens: Array<{ kind: "key"; value: string } | { kind: "index"; index: number }> = [];
  const parts = path.split(".");
  for (const part of parts) {
    // Match "name" or "name[0]" or just "[0]"
    const arrayMatch = /^([^[]*)((?:\[\d+\])+)$/.exec(part);
    if (arrayMatch) {
      const name = arrayMatch[1];
      const indices = arrayMatch[2];
      if (name !== undefined && name !== "") tokens.push({ kind: "key", value: name });
      const indexMatches = indices?.matchAll(/\[(\d+)\]/g) ?? [];
      for (const m of indexMatches) {
        tokens.push({ kind: "index", index: Number(m[1]) });
      }
    } else if (part !== "") {
      tokens.push({ kind: "key", value: part });
    }
  }
  return tokens;
}

// ---------------------------------------------------------------------------
// I/O orchestration (not unit-tested; manual smoke-test via real Qonto)
// ---------------------------------------------------------------------------

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ENDPOINTS_JSON_PATH = join(REPO_ROOT, "scripts", "contract-probe.endpoints.json");

async function loadEndpoints(): Promise<readonly EndpointConfig[]> {
  let content: string;
  try {
    content = await readFile(ENDPOINTS_JSON_PATH, "utf-8");
  } catch (err) {
    throw new ProbeError(`Failed to read endpoints config at ${ENDPOINTS_JSON_PATH}: ${(err as Error).message}`, 3);
  }
  let parsed: EndpointsFile;
  try {
    parsed = JSON.parse(content) as EndpointsFile;
  } catch (err) {
    throw new ProbeError(`Failed to parse ${ENDPOINTS_JSON_PATH}: ${(err as Error).message}`, 3);
  }
  if (!Array.isArray(parsed.endpoints)) {
    throw new ProbeError(`${ENDPOINTS_JSON_PATH} must contain an \`endpoints\` array.`, 3);
  }
  return parsed.endpoints;
}

/**
 * Validate the catalog satisfies the load-bearing invariants:
 * 1. At least one endpoint (an empty catalog passes silently with zero
 *    coverage — visually indistinguishable from a healthy clean run).
 * 2. Every entry is method `GET` (the probe is read-only by construction;
 *    a non-GET entry would silently violate that contract even though the
 *    probe code calls `client.get` regardless).
 *
 * Exported for direct unit testing. Throws {@link ProbeError} with exit
 * code 3 (config error) on any violation.
 */
export function assertCatalogShape(endpoints: readonly EndpointConfig[]): void {
  if (endpoints.length === 0) {
    throw new ProbeError(`Endpoints catalog has zero entries; nothing to probe.`, 3);
  }
  for (const e of endpoints) {
    if (e.method !== "GET") {
      throw new ProbeError(
        `Endpoint \`${e.id}\` declares method \`${e.method}\`; the contract probe is GET-only by construction.`,
        3,
      );
    }
  }
}

function resolveSchema(name: string): z.ZodObject<z.ZodRawShape> {
  const candidate = (CoreSchemas as Record<string, unknown>)[name];
  if (candidate === undefined) {
    throw new ProbeError(`Schema \`${name}\` is not exported from @qontoctl/core. Check spelling.`, 3);
  }
  if (!(candidate instanceof z.ZodType)) {
    throw new ProbeError(`Export \`${name}\` from @qontoctl/core is not a Zod schema (got ${typeof candidate}).`, 3);
  }
  const unwrapped = unwrapToObject(candidate as z.ZodType);
  if (unwrapped === null) {
    throw new ProbeError(
      `Schema \`${name}\` does not unwrap to a z.ZodObject. The probe only supports object-shaped schemas (got ${(candidate as z.ZodType).constructor?.name ?? typeof candidate}).`,
      3,
    );
  }
  return unwrapped;
}

/**
 * Unwrap a Zod schema to its underlying ZodObject through ZodOptional /
 * ZodNullable / ZodPipe (e.g., `z.preprocess(fn, object)` returns ZodPipe
 * where `out` is the target object). Returns `null` when the schema cannot
 * be reduced to an object.
 *
 * Exported for use by the diff/walk pipeline AND by tests verifying schema
 * compatibility before invoking the probe against a live endpoint.
 */
export function unwrapToObject(schema: z.ZodType): z.ZodObject<z.ZodRawShape> | null {
  let inner: z.ZodType = schema;
  // Iteratively unwrap composite wrappers. Cap iterations to avoid pathological
  // loops on malformed schemas (depth > 16 is implausible in practice).
  for (let i = 0; i < 16; i++) {
    if (inner instanceof z.ZodObject) {
      return inner as z.ZodObject<z.ZodRawShape>;
    }
    if (inner instanceof z.ZodOptional || inner instanceof z.ZodNullable) {
      inner = (inner as unknown as { _zod: { def: { innerType: z.ZodType } } })._zod.def.innerType;
      continue;
    }
    // ZodPipe (e.g., from z.preprocess(fn, target)) — the target is `.out`
    const def = (inner as unknown as { _zod?: { def?: { out?: unknown; in?: unknown } } })._zod?.def;
    if (def !== undefined && def.out instanceof z.ZodType) {
      inner = def.out;
      continue;
    }
    if (def !== undefined && def.in instanceof z.ZodType) {
      // Some pipe forms have only `in` — try unwrapping that too as a fallback
      inner = def.in;
      continue;
    }
    return null;
  }
  return null;
}

async function probeEndpoint(client: HttpClient, endpoint: EndpointConfig): Promise<SchemaDriftReport> {
  const capturedAt = new Date().toISOString();
  const base = {
    endpoint_id: endpoint.id,
    method: endpoint.method,
    path: endpoint.path,
    schema: endpoint.schema,
    captured_at: capturedAt,
  } satisfies Omit<
    SchemaDriftReport,
    "status" | "extra_fields" | "missing_fields" | "strictness_mismatches" | "suggested_fixes"
  >;

  let schema: z.ZodObject<z.ZodRawShape>;
  try {
    schema = resolveSchema(endpoint.schema);
  } catch (err) {
    return {
      ...base,
      status: "error",
      extra_fields: [],
      missing_fields: [],
      strictness_mismatches: [],
      suggested_fixes: [],
      error: (err as Error).message,
    };
  }

  let response: unknown;
  try {
    response = await client.get(endpoint.path, endpoint.query);
  } catch (err) {
    // Rate-limit → partial report (per design A3 mitigation)
    if (err instanceof QontoRateLimitError) {
      return {
        ...base,
        status: "skipped",
        extra_fields: [],
        missing_fields: [],
        strictness_mismatches: [],
        suggested_fixes: [],
        error: `Rate-limited after retries: ${err.message}`,
      };
    }
    // OAuth refresh failure → bubble up to exit 2
    if (err instanceof OAuthRefreshError) {
      throw new ProbeError(
        `OAuth refresh failed during probe of ${endpoint.path}: ${err.message}. Re-authenticate via \`qontoctl oauth login\` and retry.`,
        2,
      );
    }
    // 4xx/5xx Qonto errors → record as endpoint-level error, continue
    if (err instanceof QontoApiError) {
      return {
        ...base,
        status: "error",
        extra_fields: [],
        missing_fields: [],
        strictness_mismatches: [],
        suggested_fixes: [],
        error: `Qonto API error: ${err.message}`,
      };
    }
    // Anything else (network, DNS, etc.) → endpoint-level error
    return {
      ...base,
      status: "error",
      extra_fields: [],
      missing_fields: [],
      strictness_mismatches: [],
      suggested_fixes: [],
      error: `Network error: ${(err as Error).message}`,
    };
  }

  const sample = resolveResponsePath(response, endpoint.response_path);
  if (sample === undefined || sample === null) {
    return {
      ...base,
      status: "skipped",
      extra_fields: [],
      missing_fields: [],
      strictness_mismatches: [],
      suggested_fixes: [],
      error: `response_path \`${endpoint.response_path}\` resolved to undefined/null (empty list?); skipping diff`,
    };
  }

  const diff = diffSchema(schema, sample);
  const totalDrift = diff.extra_fields.length + diff.missing_fields.length + diff.strictness_mismatches.length;

  const suggested_fixes: string[] = [];
  for (const f of diff.extra_fields) {
    suggested_fixes.push(suggestCorrection({ ...f, kind: "extra_field", schema_name: endpoint.schema }));
  }
  for (const f of diff.missing_fields) {
    suggested_fixes.push(suggestCorrection({ ...f, kind: "missing_field", schema_name: endpoint.schema }));
  }
  for (const f of diff.strictness_mismatches) {
    suggested_fixes.push(suggestCorrection({ ...f, kind: "strictness_mismatch", schema_name: endpoint.schema }));
  }

  return {
    ...base,
    status: totalDrift === 0 ? "ok" : "drift",
    extra_fields: diff.extra_fields,
    missing_fields: diff.missing_fields,
    strictness_mismatches: diff.strictness_mismatches,
    suggested_fixes,
  };
}

async function writeReport(reports: readonly SchemaDriftReport[]): Promise<string> {
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const outDir = join(REPO_ROOT, ".tmp", "contract-probe");
  const outPath = join(outDir, `${ts}.json`);
  try {
    await mkdir(outDir, { recursive: true });
    await writeFile(outPath, JSON.stringify(reports, null, 2) + "\n", "utf-8");
  } catch (err) {
    throw new ProbeError(`Failed to write report to ${outPath}: ${(err as Error).message}`, 3);
  }
  return outPath;
}

function printSummary(reports: readonly SchemaDriftReport[], reportPath: string): void {
  console.log("\nContract Probe — Drift Summary\n");
  console.log("Endpoint                                  Status   Drift  Notes");
  console.log("----------------------------------------  -------  -----  ------------------------------------");
  for (const r of reports) {
    const idCol = r.endpoint_id.padEnd(40).slice(0, 40);
    const statusCol = r.status.padEnd(7);
    const driftCount = r.extra_fields.length + r.missing_fields.length + r.strictness_mismatches.length;
    const driftCol = String(driftCount).padStart(5);
    const note = r.error ?? "";
    console.log(`  ${idCol}  ${statusCol}  ${driftCol}  ${note}`);
  }
  const okCount = reports.filter((r) => r.status === "ok").length;
  const driftCount = reports.filter((r) => r.status === "drift").length;
  const skippedCount = reports.filter((r) => r.status === "skipped").length;
  const errorCount = reports.filter((r) => r.status === "error").length;
  console.log(
    `\n${reports.length} probed: ${okCount} ok, ${driftCount} drift, ${skippedCount} skipped, ${errorCount} errors`,
  );
  console.log(`Report: ${reportPath}\n`);

  // Print suggested fixes (compact, one per line, grouped per endpoint)
  const withDrift = reports.filter((r) => r.suggested_fixes.length > 0);
  if (withDrift.length > 0) {
    console.log("Suggested fixes:");
    for (const r of withDrift) {
      console.log(`\n[${r.endpoint_id}] (${r.suggested_fixes.length} suggestion(s)):`);
      for (const fix of r.suggested_fixes) {
        console.log(`  - ${fix}`);
      }
    }
    console.log("");
  }
}

async function main(): Promise<void> {
  let endpoints: readonly EndpointConfig[];
  let config: Awaited<ReturnType<typeof resolveConfig>>;

  try {
    endpoints = await loadEndpoints();
  } catch (err) {
    if (err instanceof ProbeError) throw err;
    throw new ProbeError(`Failed to load endpoints: ${(err as Error).message}`, 3);
  }

  // Catalog-shape invariants (non-empty, GET-only). Pure validator; unit-tested.
  assertCatalogShape(endpoints);

  // Validate every schema reference at startup (fail-fast per typescript-architect rec).
  for (const e of endpoints) {
    resolveSchema(e.schema);
  }

  try {
    config = await resolveConfig();
  } catch (err) {
    if (err instanceof ConfigError) {
      const exitCode = err.code === "NO_CREDS" ? 2 : 3;
      throw new ProbeError(`Configuration error: ${err.message}`, exitCode);
    }
    throw new ProbeError(`Failed to resolve config: ${(err as Error).message}`, 3);
  }

  if (config.config.oauth === undefined) {
    throw new ProbeError(
      "Contract probe requires OAuth credentials (api-key is not sufficient — the probe needs full API access). " +
        "Configure OAuth in .qontoctl.yaml or via QONTOCTL_OAUTH_* env vars and retry.",
      2,
    );
  }

  const stagingToken = config.config.oauth.stagingToken;
  const tokenUrl = stagingToken !== undefined ? OAUTH_TOKEN_SANDBOX_URL : OAUTH_TOKEN_URL;
  const authorization = createOAuthAuthorization({
    oauth: config.config.oauth,
    tokenUrl,
    path: config.path,
  });

  const client = new HttpClient({
    baseUrl: config.endpoint,
    authorization,
    stagingToken,
    scaMethod: resolveScaMethod(config.config),
  });

  const reports: SchemaDriftReport[] = [];
  for (const endpoint of endpoints) {
    process.stderr.write(`probing ${endpoint.id} (${endpoint.path}) ... `);
    const report = await probeEndpoint(client, endpoint);
    const driftCount = report.extra_fields.length + report.missing_fields.length + report.strictness_mismatches.length;
    process.stderr.write(`${report.status} (${driftCount} drift)\n`);
    reports.push(report);
  }

  const reportPath = await writeReport(reports);
  printSummary(reports, reportPath);

  // Determine exit code: 1 if any drift detected (scriptable for release pipeline).
  const hasDrift = reports.some((r) => r.status === "drift");
  if (hasDrift) {
    throw new ProbeError("Schema drift detected. Review report and update Zod declarations.", 1);
  }
}

/**
 * Detect whether this module is being executed directly (via `tsx`) versus
 * imported by another module (e.g., the vitest test runner). When imported,
 * top-level `main()` MUST NOT run — otherwise the test process triggers a
 * real Qonto probe on every test invocation and `process.exit()` short-
 * circuits the test runner.
 */
function isDirectInvocation(): boolean {
  if (process.argv[1] === undefined) return false;
  try {
    return resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1]);
  } catch {
    return false;
  }
}

if (isDirectInvocation()) {
  // Top-level orchestration: single process.exit() at the bottom.
  main()
    .then(() => {
      process.exit(0);
    })
    .catch((err: unknown) => {
      if (err instanceof ProbeError) {
        if (err.exitCode !== 0) {
          process.stderr.write(`\nERROR: ${err.message}\n`);
        }
        process.exit(err.exitCode);
      }
      process.stderr.write(`\nUNEXPECTED ERROR: ${(err as Error).message}\n`);
      if (err instanceof Error && err.stack !== undefined) {
        process.stderr.write(`${err.stack}\n`);
      }
      process.exit(3);
    });
}
