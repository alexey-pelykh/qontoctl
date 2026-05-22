// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { QuoteListResponseSchema, QuoteSchema } from "@qontoctl/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  CLI_PATH,
  firstTextFromMcpResult,
  type LifecycleSkipCarrier,
  assertLifecycleState,
  skipIfToolError,
  skipIfUpstreamSkipped,
  skipMissingFixture,
} from "../helpers.js";
import { cliEnv, hasOAuthCredentials, pinAuthPreference } from "../sandbox.js";

describe.skipIf(!hasOAuthCredentials())("MCP quote tools (e2e)", () => {
  pinAuthPreference("oauth-first");

  let client: Client;
  let transport: StdioClientTransport;

  beforeAll(async () => {
    transport = new StdioClientTransport({
      command: "node",
      args: [CLI_PATH, "mcp"],
      env: cliEnv(),
      stderr: "pipe",
    });

    client = new Client({ name: "e2e-test", version: "0.0.0" });
    await client.connect(transport);
  });

  afterAll(async () => {
    await client.close();
  });

  describe("quote_list", () => {
    it("returns a list of quotes with expected structure", async (ctx) => {
      const result = await client.callTool({
        name: "quote_list",
        arguments: {},
      });

      // Sandbox may not expose the quotes module — surface as visible
      // feature-not-supported skip (#605).
      skipIfToolError(result, ctx, "feature-not-supported", "quote_list");

      const parsed = JSON.parse(firstTextFromMcpResult(result)) as {
        quotes: unknown[];
        meta: Record<string, unknown>;
      };
      QuoteListResponseSchema.parse(parsed);
      expect(parsed).toHaveProperty("quotes");
      expect(parsed).toHaveProperty("meta");
      expect(Array.isArray(parsed.quotes)).toBe(true);
    });
  });

  describe("quote_show", () => {
    it("returns details for a specific quote", async (ctx) => {
      const listResult = await client.callTool({
        name: "quote_list",
        arguments: {},
      });
      skipIfToolError(listResult, ctx, "feature-not-supported", "quote_list");

      const listParsed = JSON.parse(firstTextFromMcpResult(listResult)) as {
        quotes: { id: string }[];
      };
      if (listParsed.quotes.length === 0) {
        skipMissingFixture(ctx, "no quotes in sandbox to resolve an id for quote_show");
      }

      const quoteId = (listParsed.quotes[0] as { id: string }).id;

      const result = await client.callTool({
        name: "quote_show",
        arguments: { id: quoteId },
      });

      expect(result.isError).toBeFalsy();
      const parsed = JSON.parse(firstTextFromMcpResult(result)) as Record<string, unknown>;
      QuoteSchema.parse(parsed);
      expect(parsed).toHaveProperty("id", quoteId);
      expect(parsed).toHaveProperty("status");
      expect(parsed).toHaveProperty("items");
    });
  });

  // MCP CRUD smoke for `quote_create` / `quote_update` / `quote_delete` /
  // `quote_send` — closes the CLI/MCP asymmetry surfaced by the #449 audit
  // (Group 2). Mirrors the CRUD lifecycle covered by the CLI suite but
  // exercises the same operations through callTool, asserting the MCP
  // wrapper contract (input schema, isError, text-content shape) on top of
  // the underlying API contract.
  describe("quote CRUD lifecycle (MCP)", () => {
    const lifecycleSkip: LifecycleSkipCarrier = { reason: undefined };
    let createdQuoteId: string | undefined;

    it("creates a quote via callTool", async (ctx) => {
      // Reuse an existing quote's client_id (creating a new client for an
      // ad-hoc test would muddy the sandbox).
      const listResult = await client.callTool({
        name: "quote_list",
        arguments: {},
      });
      skipIfToolError(listResult, ctx, "feature-not-supported", "quote_list", lifecycleSkip);

      const listParsed = JSON.parse(firstTextFromMcpResult(listResult)) as {
        quotes: { client: { id: string } }[];
      };
      if (listParsed.quotes.length === 0) {
        skipMissingFixture(ctx, "no quotes in sandbox to reuse a client_id", lifecycleSkip);
      }

      const clientId = (listParsed.quotes[0] as { client: { id: string } }).client.id;
      const today = new Date().toISOString().split("T")[0] as string;
      const expiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0] as string;

      const result = await client.callTool({
        name: "quote_create",
        arguments: {
          client_id: clientId,
          issue_date: today,
          expiry_date: expiry,
          currency: "EUR",
          terms_and_conditions: "E2E test quote — safe to delete",
          items: [
            {
              title: "E2E Test Service",
              quantity: "1",
              unit_price: { value: "100.00", currency: "EUR" },
              vat_rate: "0.20",
            },
          ],
        },
      });

      // This is the smoking-gun assertion (#496): a quote_list success
      // followed by a quote_create schema-parse failure was previously masked
      // as a silent green test for ~2 weeks. quote_list passing tells us the
      // org has quotes enabled; any create error here is unexpected and MUST
      // surface as a failure, not a skip (#605 / design §6.1).
      expect(result.isError, `quote_create failed: ${firstTextFromMcpResult(result)}`).toBeFalsy();

      const parsed = JSON.parse(firstTextFromMcpResult(result)) as Record<string, unknown>;
      expect(parsed).toHaveProperty("id");
      expect(parsed).toHaveProperty("status");
      createdQuoteId = parsed["id"] as string;
    });

    it("updates the created quote via callTool", async (ctx) => {
      skipIfUpstreamSkipped(lifecycleSkip, ctx);
      const id = assertLifecycleState(createdQuoteId, "createdQuoteId");

      const result = await client.callTool({
        name: "quote_update",
        arguments: {
          id,
          header: "Updated by MCP E2E test",
        },
      });

      // precondition: docs/qonto-sandbox-preconditions.md#patch-v2-quotes-id
      // `quote_update` returns HTTP 412 `quote_has_no_attachment` against the
      // live sandbox unless the quote has at least one attachment first
      // (design §7.2 R-SP-3 Path B). Triage rather than assert so the
      // lifecycle's downstream delete step still runs.
      skipIfToolError(result, ctx, "sandbox-precondition", "quote_update requires attachment — see #606 (design §7.2)");

      const parsed = JSON.parse(firstTextFromMcpResult(result)) as Record<string, unknown>;
      expect(parsed).toHaveProperty("id", id);
    });

    it("sends the created quote via callTool (#638)", async (ctx) => {
      skipIfUpstreamSkipped(lifecycleSkip, ctx);
      const id = assertLifecycleState(createdQuoteId, "createdQuoteId");

      // precondition: docs/qonto-sandbox-preconditions.md#post-v2-quotes-id-send
      // Since #638 the call carries a typed payload (`send_to`, `email_title`).
      // Empirical probe (2026-05-22, see PR #638 description): the API accepts
      // the send regardless of the quote's client mailbox state — the prior
      // "client mailbox" precondition was an artefact of the empty-body call
      // shape. Any error here (including the historical 422/EOF if reintroduced
      // or a malformed-payload regression) must surface as a failure, not skip.
      //
      // Parallel-endpoint cross-link (#643): the parallel `client_invoice_send`
      // MCP test (packages/e2e/src/client-invoices/mcp.e2e.test.ts) retains a
      // defensive sandbox-precondition triage path because its empirical
      // re-probe is blocked by `client_invoice_create`'s invoicing-IBAN
      // precondition (#539). The triage asymmetry is the cross-endpoint
      // reconciliation documented in #643.
      const result = await client.callTool({
        name: "quote_send",
        arguments: {
          id,
          send_to: ["e2e-recipient@example.com"],
          email_title: "E2E test quote — safe to ignore",
          copy_to_self: false,
        },
      });

      expect(result.isError, `quote_send failed: ${firstTextFromMcpResult(result)}`).toBeFalsy();

      const parsed = JSON.parse(firstTextFromMcpResult(result)) as Record<string, unknown>;
      expect(parsed).toHaveProperty("sent", true);
      expect(parsed).toHaveProperty("id", id);
    });

    it("rejects a quote_send call missing send_to via input schema (#638)", async () => {
      // Schema-level regression guard for the #638 bug class: omitting `send_to`
      // must be rejected by the MCP wrapper BEFORE any HTTP call. If a future
      // refactor drops the `send_to` constraint, this test fails — preventing
      // a silent return to the empty-body 422/EOF failure mode.
      const result = await client.callTool({
        name: "quote_send",
        arguments: {
          id: "00000000-0000-0000-0000-000000000000",
          email_title: "Subject",
        },
      });

      expect(result.isError).toBe(true);
    });

    it("deletes the created quote via callTool (skips if already sent)", async (ctx) => {
      skipIfUpstreamSkipped(lifecycleSkip, ctx);
      const id = assertLifecycleState(createdQuoteId, "createdQuoteId");

      const result = await client.callTool({
        name: "quote_delete",
        arguments: { id },
      });

      // precondition: docs/qonto-sandbox-preconditions.md#delete-v2-quotes-id
      // If the previous step actually sent the quote, the delete is likely
      // rejected by the API. Triage as sandbox-precondition (delete requires
      // non-sent state) so the lifecycle stays best-effort.
      skipIfToolError(result, ctx, "sandbox-precondition", "quote_delete requires non-sent state — see #606");

      const parsed = JSON.parse(firstTextFromMcpResult(result)) as Record<string, unknown>;
      expect(parsed).toHaveProperty("deleted", true);
      expect(parsed).toHaveProperty("id", id);
    });
  });
});
