// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import {
  type HttpClient,
  ConfigError,
  AuthError,
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
  return textError(
    [
      `Configuration error: ${error.message}`,
      "",
      "To configure credentials, create ~/.qontoctl.yaml:",
      "",
      "api-key:",
      "  organization-slug: <your-org-slug>",
      "  secret-key: <your-secret-key>",
      "",
      "Or set environment variables:",
      "  QONTOCTL_ORGANIZATION_SLUG=<your-org-slug>",
      "  QONTOCTL_SECRET_KEY=<your-secret-key>",
    ].join("\n"),
  );
}

function formatAuthError(error: AuthError): CallToolResult {
  return textError(
    [
      `Authentication error: ${error.message}`,
      "",
      "Verify your API key credentials in ~/.qontoctl.yaml or environment variables.",
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
