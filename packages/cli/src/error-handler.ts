// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import {
  ConfigError,
  AuthError,
  OAuthNoTokenError,
  QontoApiError,
  QontoOAuthScopeError,
  QontoRateLimitError,
  QontoScaNotEnrolledError,
  QontoScaRequiredError,
  ScaPollingFailedError,
  ScaTimeoutError,
  ScaDeniedError,
} from "@qontoctl/core";

/**
 * Global CLI error handler that formats known error types into
 * user-friendly messages written to stderr.
 *
 * Stack traces are only shown for unknown errors in debug mode.
 */
export function handleCliError(error: unknown, debug: boolean): void {
  if (error instanceof ConfigError) {
    process.stderr.write(formatConfigError(error) + "\n");
    process.exitCode = 1;
    return;
  }

  // OAuthNoTokenError must be checked BEFORE AuthError (it is a subclass).
  // The generic AuthError handler below directs the user to "Verify your API
  // key credentials" — appropriate for api-key failures but actively misleading
  // when the actual cause is OAuth-side (no access token). The dedicated
  // handler points at the OAuth setup path AND mentions the api-key-first
  // workaround for users who want to keep an api-key escape hatch.
  if (error instanceof OAuthNoTokenError) {
    process.stderr.write(
      [
        `Authentication error: ${error.message}`,
        "",
        'Run "qontoctl auth login" to obtain an OAuth access token.',
        'Alternatively, use "--auth api-key" or "--auth api-key-first" (or set QONTOCTL_AUTH) when api-key credentials are configured.',
      ].join("\n") + "\n",
    );
    process.exitCode = 1;
    return;
  }

  if (error instanceof AuthError) {
    process.stderr.write(
      [
        `Authentication error: ${error.message}`,
        "",
        "Verify your API key credentials in ~/.qontoctl.yaml, via QONTOCTL_CONFIG_FILE, or via environment variables.",
      ].join("\n") + "\n",
    );
    process.exitCode = 1;
    return;
  }

  if (error instanceof QontoOAuthScopeError) {
    const details = error.errors.map((e) => `  - ${e.code}: ${e.detail}`).join("\n");
    process.stderr.write(
      [
        `Qonto API error (HTTP 403):`,
        details,
        "",
        "Your OAuth token is missing a required scope for this operation.",
        'Run "qontoctl auth setup" to select the needed scopes, then "qontoctl auth login" to re-authenticate.',
      ].join("\n") + "\n",
    );
    process.exitCode = 1;
    return;
  }

  if (error instanceof QontoScaNotEnrolledError) {
    const details = error.errors.map((e) => `  - ${e.code}: ${e.detail}`).join("\n");
    process.stderr.write(
      [
        `Qonto API error (HTTP 428):`,
        details,
        "",
        "Strong Customer Authentication (SCA) is not enabled on this Qonto account.",
        "This is a configuration error: retrying will produce the same response.",
        "",
        "Enroll a paired device or passkey in the Qonto mobile app, then retry.",
        "See: https://docs.qonto.com/api-reference/business-api/authentication/sca/sca-flows",
      ].join("\n") + "\n",
    );
    process.exitCode = 1;
    return;
  }

  if (error instanceof QontoApiError) {
    const details = error.errors.map((e) => `  - ${e.code}: ${e.detail}`).join("\n");
    process.stderr.write(`Qonto API error (HTTP ${error.status}):\n${details}\n`);
    process.exitCode = 1;
    return;
  }

  if (error instanceof QontoRateLimitError) {
    const retryHint = error.retryAfter !== undefined ? ` Retry after ${error.retryAfter} seconds.` : "";
    process.stderr.write(`Rate limit exceeded.${retryHint} Please wait before retrying.\n`);
    process.exitCode = 1;
    return;
  }

  if (error instanceof QontoScaRequiredError) {
    process.stderr.write(
      [
        "SCA (Strong Customer Authentication) required for this operation.",
        "",
        `Session token: ${error.scaSessionToken}`,
        "Please approve the operation on your Qonto mobile app and retry.",
      ].join("\n") + "\n",
    );
    process.exitCode = 1;
    return;
  }

  if (error instanceof ScaTimeoutError) {
    process.stderr.write(
      `SCA authentication timed out after ${Math.round(error.timeoutMs / 1000)}s. Please try again.\n`,
    );
    process.exitCode = 1;
    return;
  }

  if (error instanceof ScaDeniedError) {
    process.stderr.write("SCA authentication was denied. The operation has been cancelled.\n");
    process.exitCode = 1;
    return;
  }

  if (error instanceof ScaPollingFailedError) {
    // The SCA challenge was created but its status could not be polled (#669) —
    // distinct from a timeout (poll ran, no decision) or denial (user said no).
    // Lead with the duplicate-payment safeguard: the operation's outcome is
    // genuinely unknown, so we must not imply it plainly failed.
    process.stderr.write(
      [
        "SCA (Strong Customer Authentication) required, but the approval could not be confirmed:",
        "polling the SCA session status failed. The challenge was created (a push was sent to your",
        "Qonto mobile app), but its outcome could not be retrieved, so the operation did NOT complete.",
        "",
        `Underlying failure: ${describeScaPollCause(error.cause)}`,
        "",
        "IMPORTANT — avoid a duplicate payment. This operation's outcome is unknown: it was not",
        "confirmed completed, but it may not have failed cleanly either. Before retrying, verify",
        "whether it already went through (check the Qonto app, or list the relevant transfers) to",
        "avoid a duplicate money movement.",
        "",
        `SCA session token (for diagnostics): ${error.scaSessionToken}`,
      ].join("\n") + "\n",
    );
    process.exitCode = 1;
    return;
  }

  // Unknown errors: show stack trace in debug mode, message only otherwise
  if (debug && error instanceof Error && error.stack !== undefined) {
    process.stderr.write(`${error.stack}\n`);
  } else {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`Error: ${message}\n`);
  }
  process.exitCode = 1;
}

/**
 * Describe the underlying failure that broke SCA-session polling, for the
 * diagnostic line of the {@link ScaPollingFailedError} branch. A
 * {@link QontoApiError} is rendered with its HTTP status and JSON:API
 * `code: detail` entries (e.g. the `HTTP 404 — not_found: Not found` of #669);
 * anything else falls back to its message.
 */
function describeScaPollCause(cause: unknown): string {
  if (cause instanceof QontoApiError) {
    const details = cause.errors.map((e) => `${e.code}: ${e.detail}`).join("; ");
    return `Qonto API error (HTTP ${String(cause.status)})${details.length > 0 ? ` — ${details}` : ""}`;
  }
  if (cause instanceof Error) {
    return cause.message;
  }
  return String(cause);
}

/**
 * Formats a {@link ConfigError} for stderr, dispatching on the error's
 * discriminator code so each cause gets actionable guidance instead of a
 * generic "create ~/.qontoctl.yaml" hint that doesn't apply to most cases.
 */
function formatConfigError(error: ConfigError): string {
  switch (error.code) {
    case "NO_CREDS":
      return [
        `Configuration error: ${error.message}`,
        "",
        "Set credentials via one of:",
        "  • A config file at ~/.qontoctl.yaml (or pass --profile <name>)",
        "  • The QONTOCTL_CONFIG_FILE env var pointing at an absolute path",
        "  • Env vars QONTOCTL_ORGANIZATION_SLUG + QONTOCTL_SECRET_KEY (api-key)",
        "  • Env vars QONTOCTL_CLIENT_ID + QONTOCTL_CLIENT_SECRET (oauth)",
        "",
        "For repo-local config, a direnv .envrc with",
        '  export QONTOCTL_CONFIG_FILE="$PWD/.qontoctl.yaml"',
        "lets you keep a project-scoped credentials file without --config on every invocation.",
      ].join("\n");
    case "PARSE":
      return [
        `Configuration error: ${error.message}`,
        "",
        "The YAML file could not be parsed. Check indentation, quoting, and special characters.",
      ].join("\n");
    case "VALIDATION":
      return [
        `Configuration error: ${error.message}`,
        "",
        "Fix the offending field and retry. Run with --debug for the original location.",
      ].join("\n");
    case "PERMISSION":
      return [
        `Configuration error: ${error.message}`,
        "",
        "Check file ownership and permissions. OAuth-bearing files should be 0600 (chmod 600 <path>).",
      ].join("\n");
    case "CONFLICT":
      return [
        `Configuration error: ${error.message}`,
        "",
        "Another qontoctl process is writing to the same config file.",
        "Wait for it to finish, or kill it if it's stuck (a stale lock is reaped after 10 seconds).",
      ].join("\n");
    default:
      // Future-proof: any unrecognized code (e.g., a new ConfigErrorCode
      // variant added without updating this switch) still produces a
      // legible message rather than crashing the caller.
      return `Configuration error: ${error.message}`;
  }
}
