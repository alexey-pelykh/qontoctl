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

      // Documented sandbox-precondition: `quote_update` returns HTTP 412
      // `quote_has_no_attachment` against the live sandbox unless the quote
      // has at least one attachment first (design §7.2 R-SP-3 Path B; #606
      // catalog). Triage rather than assert so the lifecycle's downstream
      // delete step still runs.
      skipIfToolError(result, ctx, "sandbox-precondition", "quote_update requires attachment — see #606 (design §7.2)");

      const parsed = JSON.parse(firstTextFromMcpResult(result)) as Record<string, unknown>;
      expect(parsed).toHaveProperty("id", id);
    });

    it("attempts to send the created quote via callTool (skips on missing mailbox)", async (ctx) => {
      skipIfUpstreamSkipped(lifecycleSkip, ctx);
      const id = assertLifecycleState(createdQuoteId, "createdQuoteId");

      const result = await client.callTool({
        name: "quote_send",
        arguments: { id },
      });

      // Send may fail with a 4xx if the quote's client lacks a mailbox.
      // Triage as sandbox-precondition (the client has no email configured);
      // see #606 (epic #603) for the L3 sandbox-precondition catalog (#605).
      skipIfToolError(result, ctx, "sandbox-precondition", "quote_send requires client mailbox — see #606");

      const parsed = JSON.parse(firstTextFromMcpResult(result)) as Record<string, unknown>;
      expect(parsed).toHaveProperty("sent", true);
      expect(parsed).toHaveProperty("id", id);
    });

    it("deletes the created quote via callTool (skips if already sent)", async (ctx) => {
      skipIfUpstreamSkipped(lifecycleSkip, ctx);
      const id = assertLifecycleState(createdQuoteId, "createdQuoteId");

      const result = await client.callTool({
        name: "quote_delete",
        arguments: { id },
      });

      // If the previous step actually sent the quote, the delete is likely
      // rejected by the API. Triage as sandbox-precondition (delete requires
      // non-sent state); see #606 for the L3 catalog (#605).
      skipIfToolError(result, ctx, "sandbox-precondition", "quote_delete requires non-sent state — see #606");

      const parsed = JSON.parse(firstTextFromMcpResult(result)) as Record<string, unknown>;
      expect(parsed).toHaveProperty("deleted", true);
      expect(parsed).toHaveProperty("id", id);
    });
  });
});
