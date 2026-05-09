// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { execFileSync, type ExecFileSyncOptions } from "node:child_process";
import { resolve } from "node:path";
import { expect } from "vitest";
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
 */
export function cliRaw(args: readonly string[], options: { timeout?: number } = {}): CliResult {
  const execOptions: ExecFileSyncOptions = {
    encoding: "utf-8",
    env: cliEnv(),
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
 */
export function cli(...args: string[]): string {
  return execFileSync("node", [CLI_PATH, ...args], {
    encoding: "utf-8",
    env: cliEnv(),
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
