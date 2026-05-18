// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { execFileSync, type ExecFileSyncOptions } from "node:child_process";
import { resolve } from "node:path";
import { expect, type TestContext } from "vitest";
import { cliEnv } from "./sandbox.js";

/**
 * Absolute path to the bundled CLI binary used by spawned-process E2E
 * tests. Computed once at module load via `import.meta.url`, so it is
 * independent of the spawning test's location within `packages/e2e/src/`.
 */
export const CLI_PATH = resolve(import.meta.dirname, "..", "..", "qontoctl", "dist", "cli.js");

/**
 * Default timeout for CLI invocations from E2E tests (15s). Individual
 * tests can override via {@link cliRaw}'s `options.timeout`.
 */
const DEFAULT_CLI_TIMEOUT_MS = 15_000;

/**
 * Outcome of a CLI invocation that may legitimately fail in some
 * sandbox configurations. The `failed` variant carries enough context
 * for tests to make per-test skip vs. fail decisions.
 */
export type CliResult =
  | { readonly ok: true; readonly stdout: string }
  | { readonly ok: false; readonly status: number; readonly stdout: string; readonly stderr: string };

interface ExecError {
  readonly status?: number;
  readonly stdout?: Buffer | string;
  readonly stderr?: Buffer | string;
  readonly message: string;
}

/**
 * Run the bundled CLI with the given arguments and return the structured
 * outcome (success or non-zero exit with captured streams). Inherits
 * credentials from {@link cliEnv}.
 *
 * Use this when a test wants to inspect the failure shape before deciding
 * whether to skip or fail (e.g. detecting HTTP 404 from sandbox feature
 * gating). For the simpler "throw on failure" pattern, use {@link cli}.
 *
 * Uses `stdio: "pipe"` so the child's stderr is captured into the result
 * instead of being inherited to the parent process — without this, vitest's
 * worker stderr ends up muxed into the test report between unrelated test
 * file boundaries (see #512).
 */
export function cliRaw(args: readonly string[], options: { timeout?: number } = {}): CliResult {
  const execOptions: ExecFileSyncOptions = {
    encoding: "utf-8",
    env: cliEnv(),
    stdio: "pipe",
    timeout: options.timeout ?? DEFAULT_CLI_TIMEOUT_MS,
  };

  try {
    const stdout = execFileSync("node", [CLI_PATH, ...args], execOptions);
    return { ok: true, stdout: typeof stdout === "string" ? stdout : stdout.toString("utf-8") };
  } catch (error: unknown) {
    const e = error as ExecError;
    return {
      ok: false,
      status: e.status ?? 1,
      stdout: bufferToString(e.stdout),
      stderr: bufferToString(e.stderr),
    };
  }
}

function bufferToString(value: Buffer | string | undefined): string {
  if (value === undefined) return "";
  return typeof value === "string" ? value : value.toString("utf-8");
}

/**
 * Run the bundled CLI with the given arguments and return stdout.
 * Throws on non-zero exit (mirrors `execFileSync` semantics).
 *
 * The single canonical CLI invocation helper for E2E tests — use this
 * instead of duplicating the `execFileSync(node, [CLI_PATH, ...args], ...)`
 * boilerplate in every test file.
 *
 * Uses `stdio: "pipe"` so the child's stderr is captured into the thrown
 * error's `stderr` property instead of being inherited to vitest's worker
 * stderr (see #512).
 */
export function cli(...args: string[]): string {
  return execFileSync("node", [CLI_PATH, ...args], {
    encoding: "utf-8",
    env: cliEnv(),
    stdio: "pipe",
    timeout: DEFAULT_CLI_TIMEOUT_MS,
  });
}

/**
 * Run the bundled CLI with `--output json` (prepended) and parse the
 * stdout as JSON. Convenience over {@link cli} for the very common
 * "list/show as JSON" pattern.
 */
// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- callers pin the parsed shape via `cliJson<Foo[]>(...)`
export function cliJson<T>(...args: string[]): T {
  const output = cli("--output", "json", ...args);
  return JSON.parse(output) as T;
}

/**
 * Pattern matchers for stderr text emitted by the CLI's error handler
 * (`packages/cli/src/error-handler.ts`). The CLI exits non-zero with a
 * standardized "Qonto API error (HTTP {status}):" prefix, so tests can
 * cheaply inspect `result.stderr` to distinguish sandbox-feature 404s
 * from genuine bugs.
 */
const QONTO_HTTP_STATUS_RE = /^Qonto API error \(HTTP (\d+)\):/m;

/**
 * Extract the HTTP status code from a failed CLI invocation's stderr,
 * matching the canonical "Qonto API error (HTTP {status}):" prefix.
 * Returns `undefined` when stderr does not contain the prefix (e.g.
 * config error, unknown failure mode, timeout).
 */
export function qontoHttpStatus(stderr: string): number | undefined {
  const match = QONTO_HTTP_STATUS_RE.exec(stderr);
  if (match === null || match[1] === undefined) return undefined;
  const code = Number.parseInt(match[1], 10);
  return Number.isFinite(code) ? code : undefined;
}

/**
 * Sentinel returned by {@link skipIfQontoStatus} when the CLI failed
 * with one of the caller-supplied "ok to skip" HTTP statuses. Tests
 * compare via `=== SKIP` and `return` to short-circuit, mirroring the
 * existing `if (items.length === 0) return;` skip-if-empty idiom.
 */
export const SKIP: unique symbol = Symbol("skip");
export type Skip = typeof SKIP;

/**
 * Run a CLI invocation and either return its stdout or {@link SKIP}
 * when the call failed with one of the caller-supplied HTTP statuses
 * (typically `404`, sometimes `403`/`422`). Re-throws on any other
 * failure shape — only "expected" sandbox-feature gaps are absorbed.
 *
 * Standard usage in a test:
 *
 * ```ts
 * const stdout = skipIfQontoStatus([404], "payment-link", "list");
 * if (stdout === SKIP) return; // Feature unavailable in this sandbox
 * const items = JSON.parse(stdout) as { id: string }[];
 * ```
 *
 * Uses Vitest's `console.warn` so the skip reason is visible in CI
 * logs without forcing a custom reporter.
 */
export function skipIfQontoStatus(skippableStatuses: readonly number[], ...args: string[]): string | Skip {
  const result = cliRaw(args);
  if (result.ok) return result.stdout;

  const status = qontoHttpStatus(result.stderr);
  if (status !== undefined && skippableStatuses.includes(status)) {
    console.warn(`[e2e] skipping: ${args.join(" ")} -> HTTP ${String(status)} (sandbox feature unavailable)`);
    return SKIP;
  }

  // Genuine failure — re-throw the original error so the test fails with
  // useful context.
  throw new Error(
    `CLI failed: \`${args.join(" ")}\` exit=${String(result.status)}\n--- stderr ---\n${result.stderr}\n--- stdout ---\n${result.stdout}`,
  );
}

/**
 * Convenience over {@link skipIfQontoStatus} for the very common "skip
 * on 404 (feature gated, resource missing) but fail on anything else"
 * pattern.
 */
export function skipIfNotFound(...args: string[]): string | Skip {
  return skipIfQontoStatus([404], ...args);
}

/**
 * Run a CLI invocation and return {@link SKIP} when the call failed with
 * one of the caller-supplied HTTP statuses **and** the stderr contains
 * any of the caller-supplied substrings. More restrictive than
 * {@link skipIfQontoStatus} alone — useful for HTTP 400 cases where the
 * status is generic but the error message identifies a specific known
 * environmental limitation (e.g. `"Organization is not KYB accepted"`
 * for IBAN-certificate generation against non-KYB-validated test orgs).
 *
 * Re-throws on any other failure shape — only the explicitly-named
 * limitation is absorbed; unrelated 400s still fail the test.
 *
 * Standard usage:
 *
 * ```ts
 * const stdout = skipIfQontoErrorContains(
 *   [400],
 *   ["KYB accepted"],
 *   "account", "iban-certificate", id, "--output-file", path,
 * );
 * if (stdout === SKIP) return; // Test org not KYB-validated
 * ```
 */
export function skipIfQontoErrorContains(
  skippableStatuses: readonly number[],
  errorPatterns: readonly string[],
  ...args: string[]
): string | Skip {
  const result = cliRaw(args);
  if (result.ok) return result.stdout;

  const status = qontoHttpStatus(result.stderr);
  if (status !== undefined && skippableStatuses.includes(status)) {
    const matched = errorPatterns.find((p) => result.stderr.includes(p));
    if (matched !== undefined) {
      console.warn(
        `[e2e] skipping: ${args.join(" ")} -> HTTP ${String(status)} matching "${matched}" (known environmental limitation)`,
      );
      return SKIP;
    }
  }

  // Genuine failure — re-throw the original error so the test fails with
  // useful context.
  throw new Error(
    `CLI failed: \`${args.join(" ")}\` exit=${String(result.status)}\n--- stderr ---\n${result.stderr}\n--- stdout ---\n${result.stdout}`,
  );
}

/**
 * Single-entry MCP tool result content shape (text payload).
 */
interface McpTextContent {
  readonly type: string;
  readonly text: string;
}

/**
 * Extract the first `text`-typed content entry from an MCP `callTool`
 * result. Centralizes the assertion-laden boilerplate previously
 * duplicated across every MCP E2E test file.
 */
export function firstTextFromMcpResult(result: { content: unknown }): string {
  const content = result.content as McpTextContent[];
  expect(content).toHaveLength(1);
  const entry = content[0] as McpTextContent;
  expect(entry.type).toBe("text");
  return entry.text;
}

// ---------------------------------------------------------------------------
// Visible-skip helpers (R-FV-1…R-FV-5, R-SR-1, R-SR-2 — see #605, epic #603,
// `docs/designs/e2e-test-reliability.md` §6.1).
//
// The pre-#605 suite used a two-stage silent mask — `if (result.isError ===
// true) return;` swallowed tool errors, leaving the CRUD chain's shared
// `createdId` undefined, then `if (createdId === undefined) return;`
// swallowed every downstream test. Three semantically distinct outcomes
// ("couldn't execute", "executed and found a bug", "executed correctly")
// collapsed into one green dot. This pattern hid #496 for ~2 weeks.
//
// The helpers below replace the silent pattern with *visible* skips —
// every non-execution surfaces in the vitest report with a recorded reason
// drawn from the {@link SkipKind} taxonomy. The CI guard
// `scripts/check-no-silent-skip.js` bans reintroduction of the raw return.
//
// Deviation from design §6.1 (documented for reviewers): the design sketched
// helpers as `(...): boolean` returning a "should-stop" flag for the caller
// to `return` on. Vitest's `ctx.skip(reason)` actually THROWS a
// `PendingError` (verified against @vitest/runner@4.1.1
// `chunk-artifact.js:2349-2357`), so the `if (helper(...)) return;`
// indirection is impossible without re-implementing the skip mechanism. The
// helpers below throw via `ctx.skip(...)` and set the optional lifecycle
// carrier BEFORE the throw — preserving the design's
// lifecycle-propagation intent at the cost of one syntactic indirection.
// ---------------------------------------------------------------------------

/**
 * Triage taxonomy for E2E test skips (R-SR-2). Every visible skip carries
 * one of these prefixes in its reason string, enabling future trend
 * analysis (e.g. "% of runs that skipped due to sandbox preconditions").
 *
 * - `feature-not-supported` — the Qonto sandbox does not expose the
 *   feature this test exercises (commonly: 404 on `*_list`). The CLI/MCP
 *   surface is presumed correct; the test cannot reach it.
 * - `sandbox-precondition` — the sandbox accepts the call shape but the
 *   resource is in a state that violates an undocumented precondition
 *   (commonly: 412 on a `*_update` that requires a related entity first).
 *   These feed the L3 catalog tracked under epic #603 (Wave B / #606).
 * - `missing-fixture` — a list returned successfully but contained zero
 *   items, so the test has no seed data to exercise its scenario.
 *   Distinct from `feature-not-supported`: the feature works; the org is
 *   empty.
 */
export type SkipKind = "feature-not-supported" | "sandbox-precondition" | "missing-fixture";

/**
 * Shared, mutable record that propagates a skip reason through a CRUD
 * lifecycle `describe` block. The first test in the chain populates
 * `reason` (via {@link skipIfToolError}'s `carrier` parameter or directly);
 * subsequent tests check it via {@link skipIfUpstreamSkipped} and skip
 * themselves with the same reason prefixed by `upstream-skipped:`.
 *
 * Construct one per chain at module scope inside the enclosing `describe`:
 *
 * ```ts
 * describe("quote CRUD lifecycle", () => {
 *   const lifecycleSkip: LifecycleSkipCarrier = { reason: undefined };
 *   let createdQuoteId: string | undefined;
 *
 *   it("creates", async (ctx) => {
 *     skipIfToolError(listResult, ctx, "feature-not-supported", "quote_list", lifecycleSkip);
 *     // ...
 *   });
 *
 *   it("updates", async (ctx) => {
 *     skipIfUpstreamSkipped(lifecycleSkip, ctx);
 *     // ...
 *   });
 * });
 * ```
 *
 * Sequential E2E execution (`fileParallelism: false` in
 * `vitest.e2e.config.ts`) guarantees the chain runs in declaration order
 * within a single worker — no concurrency guards needed.
 */
export interface LifecycleSkipCarrier {
  reason: string | undefined;
}

/**
 * Tool-result shape with an `isError` flag (MCP `CallToolResult`-compatible).
 * Helpers below accept this loose contract so they apply to both MCP
 * `client.callTool` results and any other shape that signals errors via
 * boolean.
 */
interface ToolResultLike {
  readonly isError?: boolean;
}

/**
 * Mark the current test as skipped (visible in the vitest report) when a
 * tool/CLI result represents a known, *triaged* failure — not a bug.
 * Optionally populates a {@link LifecycleSkipCarrier} so subsequent
 * CRUD-chain tests can propagate the same reason via
 * {@link skipIfUpstreamSkipped}.
 *
 * Throws via vitest's `ctx.skip(reason)` (returns `never` on the skip path).
 * Returns `void` on the no-skip path so callers can chain. Setting the
 * carrier happens BEFORE the throw, preserving downstream propagation.
 *
 * Triage discipline (per design §6.1):
 *
 * - `feature-not-supported` — sandbox lacks the feature. No catalog entry
 *   needed. Example: `quote_list` returns 404 because the test org has no
 *   quotes module enabled.
 * - `sandbox-precondition` — request shape is valid; resource state is not.
 *   Flag the site for the L3 catalog (#606). Example: `quote_update`
 *   returns 412 `quote_has_no_attachment`.
 * - `missing-fixture` — pass via the lifecycle pattern when an upstream
 *   list returned successfully but empty. For in-test empty-fixture skips
 *   (no upstream context), call {@link skipMissingFixture} directly.
 *
 * `unexpected-error` is intentionally NOT in {@link SkipKind} — that case
 * is the #496 class and MUST surface as a failure via
 * `expect(result.isError).toBeFalsy()`. Never skip on it.
 *
 * @param result  Tool result with an `isError` boolean.
 * @param ctx     The vitest test context (`async (ctx) => { ... }`).
 * @param kind    The {@link SkipKind} triage category.
 * @param detail  Short, human-readable identifier (typically the tool/CLI
 *                operation name, e.g. `"quote_list"`). Appears in the
 *                vitest report after the kind prefix.
 * @param carrier Optional CRUD-chain carrier; populated with the same
 *                reason that's passed to `ctx.skip` before the throw.
 */
export function skipIfToolError(
  result: ToolResultLike,
  ctx: TestContext,
  kind: SkipKind,
  detail: string,
  carrier?: LifecycleSkipCarrier,
): void {
  if (result.isError !== true) return;
  const reason = `${kind}: ${detail}`;
  if (carrier !== undefined) {
    carrier.reason = reason;
  }
  ctx.skip(reason);
}

/**
 * Mark the current test as skipped (visible in the vitest report) when an
 * upstream test in a CRUD lifecycle chain has already skipped, propagating
 * the original reason so the chain's downstream entries stay legible in
 * the report.
 *
 * Throws via vitest's `ctx.skip(reason)` on the skip path; returns `void`
 * when no upstream skip is recorded so the caller can continue.
 *
 * The propagated reason is prefixed with `upstream-skipped:` so the report
 * makes the cascade obvious:
 *
 * ```
 * ✓ creates a quote                                    [pass]
 * ↓ updates the created quote — upstream-skipped:
 *                                feature-not-supported: quote_list
 * ↓ deletes the created quote   — upstream-skipped:
 *                                feature-not-supported: quote_list
 * ```
 *
 * @param carrier The carrier populated by the upstream test.
 * @param ctx     The vitest test context.
 */
export function skipIfUpstreamSkipped(carrier: LifecycleSkipCarrier, ctx: TestContext): void {
  if (carrier.reason === undefined) return;
  ctx.skip(`upstream-skipped: ${carrier.reason}`);
}

/**
 * Mark the current test as skipped (visible in the vitest report) because
 * a required fixture is absent in the sandbox — typically a successful
 * list-call returning zero items. Throws via vitest's `ctx.skip()`;
 * returns `never` so TypeScript narrows variables after the call.
 *
 * Use for in-test empty-fixture skips that have no upstream CRUD context:
 *
 * ```ts
 * const cards = cliJson<CardItem[]>("card", "list", "--per-page", "1");
 * const first = cards[0];
 * if (first === undefined) skipMissingFixture(ctx, "no cards in sandbox");
 * // first: CardItem  (TS narrows via `never` return)
 * ```
 *
 * The defensive `throw` after `ctx.skip()` is unreachable in practice
 * (vitest's `PendingError` always throws) but guarantees the `never`
 * return type at the type-system level even if vitest internals change.
 *
 * When called from a CRUD lifecycle chain's first step where downstream
 * tests should propagate the missing-fixture skip, pass the chain's
 * {@link LifecycleSkipCarrier} so subsequent {@link skipIfUpstreamSkipped}
 * calls cascade the reason. The carrier is populated BEFORE the throw.
 *
 * For lifecycle-chain skips, use {@link skipIfUpstreamSkipped}. For
 * tool-error skips, use {@link skipIfToolError}.
 *
 * @param ctx     The vitest test context.
 * @param detail  Short, human-readable description of the missing fixture
 *                (e.g. `"no cards in sandbox"`). Appears in the vitest
 *                report after the `missing-fixture:` prefix.
 * @param carrier Optional CRUD-chain carrier; populated with the same
 *                reason that's passed to `ctx.skip` before the throw.
 */
export function skipMissingFixture(ctx: TestContext, detail: string, carrier?: LifecycleSkipCarrier): never {
  const reason = `missing-fixture: ${detail}`;
  if (carrier !== undefined) {
    carrier.reason = reason;
  }
  ctx.skip(reason);
  throw new Error("unreachable: ctx.skip should have thrown PendingError");
}

/**
 * Defensive invariant check for CRUD-chain downstream tests: when
 * {@link skipIfUpstreamSkipped} returns (chain still alive), the
 * upstream-populated state variable MUST be defined. If it is `undefined`
 * despite a clean lifecycle carrier, the upstream test failed
 * assertively (rather than skipping cleanly) — throw loudly here rather
 * than crashing on a property access several lines down with an opaque
 * `Cannot read property of undefined` error.
 *
 * Also serves as a TypeScript narrowing point: returns the value with
 * `undefined` excluded so callers can use it directly without `!`
 * non-null assertions or `as` casts.
 *
 * Usage:
 *
 * ```ts
 * let createdClientId: string | undefined;
 *
 * it("creates", async (ctx) => {
 *   const result = await client.callTool({ name: "client_create", arguments: {...} });
 *   expect(result.isError, ...).toBeFalsy();
 *   createdClientId = parsed.id;
 * });
 *
 * it("updates", async (ctx) => {
 *   skipIfUpstreamSkipped(lifecycleSkip, ctx);
 *   const id = assertLifecycleState(createdClientId, "createdClientId");
 *   // id: string  (TS narrowed)
 *   ...
 * });
 * ```
 *
 * @param value Lifecycle-chain shared state variable (typed `T | undefined`).
 * @param name  Identifier of the variable, for the error message.
 * @returns     `value`, narrowed to `T`.
 */
export function assertLifecycleState<T>(value: T | undefined, name: string): T {
  if (value === undefined) {
    throw new Error(
      `invariant violation: lifecycle carrier clean but '${name}' not populated by upstream test ` +
        `(upstream likely failed assertively — inspect prior test outcomes for the actual failure)`,
    );
  }
  return value;
}
