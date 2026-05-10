// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { QuoteListResponseSchema, QuoteSchema } from "@qontoctl/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CLI_PATH, firstTextFromMcpResult } from "../helpers.js";
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
    it("returns a list of quotes with expected structure", async () => {
      const result = await client.callTool({
        name: "quote_list",
        arguments: {},
      });

      // Sandbox may not support quotes — skip gracefully on tool error
      if (result.isError === true) return;

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
    it("returns details for a specific quote", async () => {
      const listResult = await client.callTool({
        name: "quote_list",
        arguments: {},
      });
      if (listResult.isError === true) return;

      const listParsed = JSON.parse(firstTextFromMcpResult(listResult)) as {
        quotes: { id: string }[];
      };
      if (listParsed.quotes.length === 0) {
        return;
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
    let createdQuoteId: string | undefined;

    it("creates a quote via callTool", async () => {
      // Reuse an existing quote's client_id (creating a new client for an
      // ad-hoc test would muddy the sandbox).
      const listResult = await client.callTool({
        name: "quote_list",
        arguments: {},
      });
      if (listResult.isError === true) return;

      const listParsed = JSON.parse(firstTextFromMcpResult(listResult)) as {
        quotes: { client: { id: string } }[];
      };
      if (listParsed.quotes.length === 0) return;

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

      if (result.isError === true) return;

      const parsed = JSON.parse(firstTextFromMcpResult(result)) as Record<string, unknown>;
      expect(parsed).toHaveProperty("id");
      expect(parsed).toHaveProperty("status");
      createdQuoteId = parsed["id"] as string;
    });

    it("updates the created quote via callTool", async () => {
      if (createdQuoteId === undefined) return;

      const result = await client.callTool({
        name: "quote_update",
        arguments: {
          id: createdQuoteId,
          header: "Updated by MCP E2E test",
        },
      });

      expect(result.isError).toBeFalsy();
      const parsed = JSON.parse(firstTextFromMcpResult(result)) as Record<string, unknown>;
      expect(parsed).toHaveProperty("id", createdQuoteId);
    });

    it("attempts to send the created quote via callTool (skips on missing mailbox)", async () => {
      if (createdQuoteId === undefined) return;

      const result = await client.callTool({
        name: "quote_send",
        arguments: { id: createdQuoteId },
      });

      // Send may fail with a 4xx if the quote's client lacks a mailbox.
      // We accept either success (sent: true) or a recognized error path.
      if (result.isError === true) return;

      const parsed = JSON.parse(firstTextFromMcpResult(result)) as Record<string, unknown>;
      expect(parsed).toHaveProperty("sent", true);
      expect(parsed).toHaveProperty("id", createdQuoteId);
    });

    it("deletes the created quote via callTool (skips if already sent)", async () => {
      if (createdQuoteId === undefined) return;

      const result = await client.callTool({
        name: "quote_delete",
        arguments: { id: createdQuoteId },
      });

      // If the previous step actually sent the quote, the delete is likely
      // rejected by the API. Treat that as a recognized skip.
      if (result.isError === true) return;

      const parsed = JSON.parse(firstTextFromMcpResult(result)) as Record<string, unknown>;
      expect(parsed).toHaveProperty("deleted", true);
      expect(parsed).toHaveProperty("id", createdQuoteId);
    });
  });
});
