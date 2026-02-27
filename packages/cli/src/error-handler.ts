// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { ConfigError, AuthError, QontoApiError, QontoRateLimitError } from "@qontoctl/core";

/**
 * Global CLI error handler that formats known error types into
 * user-friendly messages written to stderr.
 *
 * Stack traces are only shown for unknown errors in debug mode.
 */
export function handleCliError(error: unknown, debug: boolean): void {
  if (error instanceof ConfigError) {
    process.stderr.write(
      [
        `Configuration error: ${error.message}`,
        "",
        "To configure credentials, create ~/.qontoctl.yaml:",
        "",
        "  api-key:",
        "    organization-slug: <your-org-slug>",
        "    secret-key: <your-secret-key>",
        "",
        "Or set environment variables:",
        "  QONTOCTL_ORGANIZATION_SLUG=<your-org-slug>",
        "  QONTOCTL_SECRET_KEY=<your-secret-key>",
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
        "Verify your API key credentials in ~/.qontoctl.yaml or environment variables.",
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

  // Unknown errors: show stack trace in debug mode, message only otherwise
  if (debug && error instanceof Error && error.stack !== undefined) {
    process.stderr.write(`${error.stack}\n`);
  } else {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`Error: ${message}\n`);
  }
  process.exitCode = 1;
}
