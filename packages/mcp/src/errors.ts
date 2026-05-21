// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import {
  type HttpClient,
  ConfigError,
  AuthError,
  OAuthNoTokenError,
  QontoApiError,
  QontoOAuthScopeError,
  QontoRateLimitError,
  QontoScaNotEnrolledError,
  QontoScaRequiredError,
} from "@qontoctl/core";

import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { formatScaPendingResponse } from "./sca.js";

function textError(message: string): CallToolResult {
  return {
    content: [{ type: "text", text: message }],
    isError: true,
  };
}

function formatConfigError(error: ConfigError): CallToolResult {
  switch (error.code) {
    case "NO_CREDS":
      return textError(
        [
          `Configuration error: ${error.message}`,
          "",
          "Set credentials via one of:",
          "  • A config file at ~/.qontoctl.yaml",
          "  • The QONTOCTL_CONFIG_FILE env var pointing at an absolute path",
          "  • Env vars QONTOCTL_ORGANIZATION_SLUG + QONTOCTL_SECRET_KEY (api-key)",
          "  • Env vars QONTOCTL_CLIENT_ID + QONTOCTL_CLIENT_SECRET (oauth)",
        ].join("\n"),
      );
    case "PARSE":
      return textError(
        [
          `Configuration error: ${error.message}`,
          "",
          "The YAML file could not be parsed. Check indentation, quoting, and special characters.",
        ].join("\n"),
      );
    case "VALIDATION":
      return textError([`Configuration error: ${error.message}`, "", "Fix the offending field and retry."].join("\n"));
    case "PERMISSION":
      return textError(
        [
          `Configuration error: ${error.message}`,
          "",
          "Check file ownership and permissions. OAuth-bearing files should be 0600 (chmod 600 <path>).",
        ].join("\n"),
      );
    case "CONFLICT":
      return textError(
        [
          `Configuration error: ${error.message}`,
          "",
          "Another qontoctl process is writing to the same config file.",
          "Wait for it to finish, or kill it if it's stuck (a stale lock is reaped after 10 seconds).",
        ].join("\n"),
      );
    default:
      // Future-proof: any unrecognized code (e.g., a new ConfigErrorCode
      // variant added without updating this switch) still produces a
      // legible message rather than returning undefined.
      return textError(`Configuration error: ${error.message}`);
  }
}

function formatAuthError(error: AuthError): CallToolResult {
  return textError(
    [
      `Authentication error: ${error.message}`,
      "",
      "Verify your API key credentials in ~/.qontoctl.yaml, via QONTOCTL_CONFIG_FILE, or via environment variables.",
    ].join("\n"),
  );
}

/**
 * Dedicated formatter for {@link OAuthNoTokenError} (subclass of
 * {@link AuthError}). The generic AuthError formatter directs the user to
 * "Verify your API key credentials" — appropriate for genuine api-key
 * failures but actively misleading when the actual cause is the OAuth-side
 * lack of an access token. This handler points at the OAuth setup path and
 * mentions the api-key-first MCP-args workaround for users who want to
 * keep an api-key escape hatch without re-running `auth login`.
 */
function formatOAuthNoTokenError(error: OAuthNoTokenError): CallToolResult {
  return textError(
    [
      `Authentication error: ${error.message}`,
      "",
      'Run "qontoctl auth login" to obtain an OAuth access token.',
      'Alternatively, add "--auth api-key" or "--auth api-key-first" to the MCP server args (or set QONTOCTL_AUTH) when api-key credentials are configured.',
    ].join("\n"),
  );
}

function formatOAuthScopeError(error: QontoOAuthScopeError): CallToolResult {
  const details = error.errors.map((e) => `  - ${e.code}: ${e.detail}`).join("\n");
  return textError(
    [
      `Qonto API error (HTTP 403):`,
      details,
      "",
      "Your OAuth token is missing a required scope for this operation.",
      'Run "qontoctl auth setup" to select the needed scopes, then "qontoctl auth login" to re-authenticate.',
    ].join("\n"),
  );
}

function formatApiError(error: QontoApiError): CallToolResult {
  const details = error.errors.map((e) => `  - ${e.code}: ${e.detail}`).join("\n");
  return textError(`Qonto API error (HTTP ${error.status}):\n${details}`);
}

function formatRateLimitError(error: QontoRateLimitError): CallToolResult {
  const retryHint = error.retryAfter !== undefined ? ` Retry after ${error.retryAfter} seconds.` : "";
  return textError(`Rate limit exceeded.${retryHint} Please wait before retrying.`);
}

function formatScaNotEnrolledError(error: QontoScaNotEnrolledError): CallToolResult {
  const details = error.errors.map((e) => `  - ${e.code}: ${e.detail}`).join("\n");
  return textError(
    [
      `Qonto API error (HTTP 428):`,
      details,
      "",
      "Strong Customer Authentication (SCA) is not enabled on this Qonto account.",
      "This is a configuration error: retrying will produce the same response.",
      "",
      "Enroll a paired device or passkey in the Qonto mobile app, then retry.",
      "See: https://docs.qonto.com/api-reference/business-api/authentication/sca/sca-flows",
    ].join("\n"),
  );
}

/**
 * Wraps a tool handler with consistent error handling.
 *
 * Resolves the HttpClient lazily and converts known error types
 * into MCP-compliant `isError: true` results.
 */
export async function withClient(
  getClient: () => Promise<HttpClient>,
  handler: (client: HttpClient) => Promise<CallToolResult>,
): Promise<CallToolResult> {
  try {
    const client = await getClient();
    return await handler(client);
  } catch (error: unknown) {
    if (error instanceof ConfigError) return formatConfigError(error);
    // OAuthNoTokenError MUST be checked BEFORE AuthError (it is a subclass).
    if (error instanceof OAuthNoTokenError) return formatOAuthNoTokenError(error);
    if (error instanceof AuthError) return formatAuthError(error);
    if (error instanceof QontoScaRequiredError) return formatScaPendingResponse(error.scaSessionToken, false);
    if (error instanceof QontoScaNotEnrolledError) return formatScaNotEnrolledError(error);
    if (error instanceof QontoOAuthScopeError) return formatOAuthScopeError(error);
    if (error instanceof QontoApiError) return formatApiError(error);
    if (error instanceof QontoRateLimitError) return formatRateLimitError(error);

    const message = error instanceof Error ? error.message : String(error);
    return textError(`Unexpected error: ${message}`);
  }
}
