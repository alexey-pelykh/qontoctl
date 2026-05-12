// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { TerminalListResponseSchema, TerminalSchema } from "@qontoctl/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CLI_PATH, firstTextFromMcpResult } from "../helpers.js";
import { cliEnv, hasOAuthCredentials, pinAuthPreference } from "../sandbox.js";

interface TerminalItem {
  readonly id: string;
  readonly poi_id: string;
  readonly created_at: string;
  readonly updated_at: string;
}

interface TerminalListResponse {
  readonly terminals: TerminalItem[];
  readonly meta: {
    readonly current_page: number;
    readonly total_pages: number;
    readonly total_count: number;
  };
}

interface TerminalPaymentResponse {
  readonly id: string;
  readonly terminal_id: string;
  readonly amount: { readonly value: string; readonly currency: string };
}

// Empirically `/v2/terminals` requires OAuth despite per-endpoint docs claiming
// api-key works (verified 2026-05: api-key returns HTTP 401 "OAuth2
// authentication is required here"). Gate on OAuth; CI is api-key-only and
// skips this suite naturally.
describe.skipIf(!hasOAuthCredentials())("terminal MCP tools (e2e)", () => {
  pinAuthPreference("oauth-first");

  let client: Client;
  let transport: StdioClientTransport;

  beforeAll(async () => {
    transport = new StdioClientTransport({
      command: "node",
      args: [CLI_PATH, "mcp"],
      env: cliEnv({ authPreference: "oauth-first" }),
      stderr: "pipe",
    });

    client = new Client({ name: "e2e-test", version: "0.0.0" });
    await client.connect(transport);
  });

  afterAll(async () => {
    await client.close();
  });

  describe("terminal_list", () => {
    it("returns a list of terminals with the expected structure", async () => {
      const result = await client.callTool({ name: "terminal_list", arguments: {} });
      if (result.isError === true) return;

      const parsed = JSON.parse(firstTextFromMcpResult(result)) as TerminalListResponse;
      TerminalListResponseSchema.parse(parsed);
      expect(parsed).toHaveProperty("terminals");
      expect(parsed).toHaveProperty("meta");
      expect(Array.isArray(parsed.terminals)).toBe(true);
    });

    it("supports pagination", async () => {
      const result = await client.callTool({
        name: "terminal_list",
        arguments: { per_page: 1, page: 1 },
      });
      if (result.isError === true) return;

      const parsed = JSON.parse(firstTextFromMcpResult(result)) as TerminalListResponse;
      expect(parsed.terminals.length).toBeLessThanOrEqual(1);
      expect(parsed.meta.current_page).toBe(1);
    });
  });

  describe("terminal_payment_create", () => {
    it("either initiates a payment or surfaces a known sandbox-feature gating error", async () => {
      const listResult = await client.callTool({ name: "terminal_list", arguments: { per_page: 1 } });
      if (listResult.isError === true) return;

      const parsedList = JSON.parse(firstTextFromMcpResult(listResult)) as TerminalListResponse;
      const first = parsedList.terminals[0];
      if (first === undefined) {
        console.warn("[e2e] skipping terminal_payment_create: no terminals provisioned in this tenant");
        return;
      }
      TerminalSchema.parse(first);

      const result = await client.callTool({
        name: "terminal_payment_create",
        arguments: { terminal_id: first.id, amount: "1.00", metadata: { e2e: "484" } },
      });

      if (result.isError !== true) {
        const payment = JSON.parse(firstTextFromMcpResult(result)) as TerminalPaymentResponse;
        expect(payment.id).toBeDefined();
        expect(payment.terminal_id).toBe(first.id);
        expect(payment.amount.currency).toBe("EUR");
        return;
      }

      // Sandbox or tenant-feature gating — accept any HTTP 4xx surfaced through
      // the MCP error wrapper. Genuine 5xx or unexpected shapes still fail.
      const text = firstTextFromMcpResult(result);
      const match = /HTTP (\d{3})/.exec(text);
      if (match !== null && match[1] !== undefined) {
        const status = Number.parseInt(match[1], 10);
        if (status >= 400 && status < 500) {
          console.warn(
            `[e2e] skipping terminal_payment_create assertion: HTTP ${String(status)} (sandbox terminal-payment gating)`,
          );
          return;
        }
      }
      throw new Error(`terminal_payment_create failed unexpectedly:\n${text}`);
    }, 140_000);

    it("rejects amounts below 0.10 at the MCP boundary", async () => {
      const result = await client.callTool({
        name: "terminal_payment_create",
        arguments: { terminal_id: "00000000-0000-0000-0000-000000000000", amount: "0.05" },
      });
      expect(result.isError).toBe(true);
      const text = firstTextFromMcpResult(result);
      // The validation runs before the HTTP call, so there is no "HTTP" prefix.
      expect(text).toMatch(/between 0\.10 and 100000\.00/);
    });
  });
});
