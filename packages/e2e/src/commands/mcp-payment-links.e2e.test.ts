// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { PaymentLinkConnectionSchema, PaymentLinkListResponseSchema, PaymentLinkSchema } from "@qontoctl/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CLI_PATH, firstTextFromMcpResult, skipMissingFixture } from "../helpers.js";
import { cliEnv, hasOAuthCredentials, pinAuthPreference } from "../sandbox.js";

/**
 * Best-effort detection of "feature unavailable" errors surfaced by MCP
 * tools. The MCP server marks tool results as `isError: true` and embeds a
 * stringified error payload in the first `text` content. The bundled CLI's
 * core HTTP client throws `QontoApiError` with `status: 404` on missing
 * features, which the MCP error wrapper preserves verbatim — we look for
 * that signal and treat the result as a soft skip.
 */
function isFeatureUnavailable(result: { isError?: boolean | undefined; content: unknown }): boolean {
  if (result.isError !== true) return false;
  const content = result.content as { type: string; text?: string }[];
  const text = content[0]?.text ?? "";
  // Match either the stringified `QontoApiError` payload (`status: 404`) or
  // the human-readable "HTTP 404" prefix used by the CLI's error handler.
  return /\b(status[":\s]*404|HTTP 404)\b/.test(text);
}

describe.skipIf(!hasOAuthCredentials())("MCP payment link tools (e2e)", () => {
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

  describe("payment_link_list", () => {
    it("returns a list of payment links with expected structure", async () => {
      const result = await client.callTool({
        name: "payment_link_list",
        arguments: {},
      });
      if (isFeatureUnavailable(result)) {
        console.warn("[e2e] skipping payment_link_list: payment-link feature unavailable in sandbox (#490)");
        return;
      }

      const parsed = JSON.parse(firstTextFromMcpResult(result)) as {
        payment_links: unknown[];
        meta: Record<string, unknown>;
      };
      PaymentLinkListResponseSchema.parse(parsed);
      expect(parsed).toHaveProperty("payment_links");
      expect(parsed).toHaveProperty("meta");
      expect(Array.isArray(parsed.payment_links)).toBe(true);
    });
  });

  describe("payment_link_show", () => {
    it("returns details for a specific payment link", async (ctx) => {
      const listResult = await client.callTool({
        name: "payment_link_list",
        arguments: {},
      });
      if (isFeatureUnavailable(listResult)) return;

      const listParsed = JSON.parse(firstTextFromMcpResult(listResult)) as {
        payment_links: { id: string }[];
      };
      if (listParsed.payment_links.length === 0) {
        skipMissingFixture(ctx, "no payment links in sandbox to resolve an id for payment_link_show");
      }

      const firstLink = listParsed.payment_links[0] as { id: string };
      const result = await client.callTool({
        name: "payment_link_show",
        arguments: { id: firstLink.id },
      });

      const parsed = JSON.parse(firstTextFromMcpResult(result)) as Record<string, unknown>;
      PaymentLinkSchema.parse(parsed);
      expect(parsed).toHaveProperty("id", firstLink.id);
      expect(parsed).toHaveProperty("status");
      expect(parsed).toHaveProperty("url");
    });
  });

  describe("payment_link_payments", () => {
    it("returns payments for a payment link", async (ctx) => {
      const listResult = await client.callTool({
        name: "payment_link_list",
        arguments: {},
      });
      if (isFeatureUnavailable(listResult)) return;

      const listParsed = JSON.parse(firstTextFromMcpResult(listResult)) as {
        payment_links: { id: string }[];
      };
      if (listParsed.payment_links.length === 0) {
        skipMissingFixture(ctx, "no payment links in sandbox to resolve an id for payment_link_payments");
      }

      const firstLink = listParsed.payment_links[0] as { id: string };
      const result = await client.callTool({
        name: "payment_link_payments",
        arguments: { id: firstLink.id },
      });

      const parsed = JSON.parse(firstTextFromMcpResult(result)) as {
        payments: unknown[];
        meta: Record<string, unknown>;
      };
      expect(parsed).toHaveProperty("payments");
      expect(parsed).toHaveProperty("meta");
      expect(Array.isArray(parsed.payments)).toBe(true);
    });
  });

  describe("payment_link_methods", () => {
    it("returns available payment methods", async () => {
      const result = await client.callTool({
        name: "payment_link_methods",
        arguments: {},
      });

      const parsed = JSON.parse(firstTextFromMcpResult(result)) as { name: string; enabled: boolean }[];
      expect(Array.isArray(parsed)).toBe(true);
      for (const method of parsed) {
        expect(method).toHaveProperty("name");
        expect(method).toHaveProperty("enabled");
      }
    });
  });

  describe("payment_link_connection_status", () => {
    it("returns connection status", async () => {
      const result = await client.callTool({
        name: "payment_link_connection_status",
        arguments: {},
      });
      if (isFeatureUnavailable(result)) {
        console.warn("[e2e] skipping payment_link_connection_status: no payment-link connection configured (#490)");
        return;
      }

      const parsed = JSON.parse(firstTextFromMcpResult(result)) as Record<string, unknown>;
      expect(parsed).toBeDefined();
    });
  });

  // MCP lifecycle round-trip for `payment_link_connect` / `payment_link_create`
  // / `payment_link_deactivate` — closes the audit gap from umbrella #449
  // (Group 7). Mirrors the CLI suite's idempotent-setup → create → deactivate
  // shape but exercises the operations through `callTool` so the MCP wrapper
  // contract is asserted on top of the underlying API contract.
  describe("payment link CRUD lifecycle (MCP)", () => {
    let createdPaymentLinkId: string | undefined;
    let lifecycleSkipped = false;

    it("ensures a payment-link connection exists (idempotent setup)", async () => {
      // 1. Probe current state. `payment_link_connection_status` surfaces the
      // sandbox-feature-gating 404 as a tool error; treat it as a soft skip.
      const statusResult = await client.callTool({
        name: "payment_link_connection_status",
        arguments: {},
      });
      if (isFeatureUnavailable(statusResult)) {
        console.warn("[e2e] skipping payment-link CRUD lifecycle: feature unavailable in sandbox (#490)");
        lifecycleSkipped = true;
        return;
      }

      // 2. Connection record present — idempotent path.
      if (statusResult.isError !== true) {
        const current = JSON.parse(firstTextFromMcpResult(statusResult)) as { status?: string };
        if (typeof current.status === "string" && current.status.length > 0) {
          console.warn(`[e2e] payment-link connection already present (status=${current.status}); skipping connect`);
          return;
        }
      }

      // 3. No connection yet — establish one. The connection partner is the
      // first available bank account, discovered through the MCP `account_list`
      // tool so the suite stays self-contained on the MCP surface (no CLI
      // shell-out). 4xx from `account_list` surfaces as `isError: true`; treat
      // it as a soft skip like the lifecycle's other auth-shaped gates.
      const accountListResult = await client.callTool({
        name: "account_list",
        arguments: {},
      });
      if (accountListResult.isError === true) {
        console.warn(
          `[e2e] skipping payment-link CRUD lifecycle (MCP): account_list ${firstTextFromMcpResult(accountListResult)}`,
        );
        lifecycleSkipped = true;
        return;
      }
      const accounts = JSON.parse(firstTextFromMcpResult(accountListResult)) as { id: string }[];
      const bankAccountId = accounts[0]?.id;
      if (bankAccountId === undefined) {
        console.warn("[e2e] skipping payment-link CRUD lifecycle (MCP): no bank account available");
        lifecycleSkipped = true;
        return;
      }

      const connectResult = await client.callTool({
        name: "payment_link_connect",
        arguments: {
          partner_callback_url: "https://example.com/qontoctl-e2e-459",
          user_bank_account_id: bankAccountId,
          user_phone_number: "+33612345678",
          user_website_url: "https://example.com/qontoctl-e2e-459",
          business_description:
            "QontoCtl E2E test for payment-link write paths — issue #459. This is an automated test fixture and not a real business.",
        },
      });

      // The MCP tool wrapper surfaces a 4xx from Qonto as `isError: true`
      // with the error payload in text content. Sandbox tenants without the
      // Payment Links subscription, or with the connection already in a
      // transitional state, both surface here; treat both as soft skips.
      if (connectResult.isError === true) {
        console.warn(
          `[e2e] skipping payment-link connect (MCP): ${firstTextFromMcpResult(connectResult)} (sandbox-feature gating or already connected)`,
        );
        lifecycleSkipped = true;
        return;
      }

      const parsed = JSON.parse(firstTextFromMcpResult(connectResult)) as Record<string, unknown>;
      PaymentLinkConnectionSchema.parse(parsed);
      expect(parsed).toHaveProperty("status");
      expect(parsed).toHaveProperty("bank_account_id");
    });

    it("creates a basket payment link via callTool", async () => {
      if (lifecycleSkipped) return;

      // Discover an enabled payment method; fall back to `card` when sandbox
      // reports none — Qonto validates the chosen method server-side.
      const methodsResult = await client.callTool({
        name: "payment_link_methods",
        arguments: {},
      });
      const methods =
        methodsResult.isError === true
          ? []
          : (JSON.parse(firstTextFromMcpResult(methodsResult)) as { name: string; enabled: boolean }[]);
      const enabled = methods.filter((m) => m.enabled).map((m) => m.name);
      const potentialMethods = enabled.length > 0 ? enabled.slice(0, 1) : ["card"];

      const createResult = await client.callTool({
        name: "payment_link_create",
        arguments: {
          payment_link: {
            potential_payment_methods: potentialMethods,
            reusable: false,
            items: [
              {
                title: "QontoCtl E2E #459 (MCP)",
                quantity: 1,
                unit_price: { value: "1.00", currency: "EUR" },
                vat_rate: "0.0",
              },
            ],
          },
        },
      });

      if (createResult.isError === true) {
        console.warn(
          `[e2e] skipping payment-link create (MCP): ${firstTextFromMcpResult(createResult)} (sandbox-feature gating or connection not yet active)`,
        );
        lifecycleSkipped = true;
        return;
      }

      const parsed = JSON.parse(firstTextFromMcpResult(createResult)) as Record<string, unknown>;
      PaymentLinkSchema.parse(parsed);
      expect(parsed).toHaveProperty("id");
      expect(parsed).toHaveProperty("url");
      expect(parsed).toHaveProperty("status");
      createdPaymentLinkId = parsed["id"] as string;
    });

    it("deactivates the created payment link via callTool", async () => {
      if (lifecycleSkipped || createdPaymentLinkId === undefined) return;

      const result = await client.callTool({
        name: "payment_link_deactivate",
        arguments: { id: createdPaymentLinkId },
      });

      expect(result.isError).toBeFalsy();
      const parsed = JSON.parse(firstTextFromMcpResult(result)) as Record<string, unknown>;
      PaymentLinkSchema.parse(parsed);
      expect(parsed).toHaveProperty("id", createdPaymentLinkId);
      expect(parsed["status"]).not.toBe("open");
    });
  });
});
