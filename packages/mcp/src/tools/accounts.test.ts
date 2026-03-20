// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { binaryResponse, jsonResponse } from "@qontoctl/core/testing";
import { connectInMemory } from "../testing/mcp-helpers.js";

function makeBankAccount(overrides: Record<string, unknown> = {}) {
  return {
    id: "acc-1",
    name: "Main",
    status: "active",
    main: true,
    organization_id: "org-1",
    iban: "FR7630001007941234567890185",
    bic: "BNPAFRPP",
    currency: "EUR",
    balance: 1000,
    balance_cents: 100000,
    authorized_balance: 1000,
    authorized_balance_cents: 100000,
    slug: "test-org-main",
    ...overrides,
  };
}

describe("account MCP tools", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;
  let mcpClient: Client;

  beforeEach(async () => {
    fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    ({ mcpClient } = await connectInMemory(fetchSpy));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("account_list", () => {
    it("returns accounts from API", async () => {
      fetchSpy.mockReturnValue(
        jsonResponse({
          bank_accounts: [makeBankAccount()],
        }),
      );

      const result = await mcpClient.callTool({
        name: "account_list",
        arguments: {},
      });

      const content = result.content as { type: string; text: string }[];
      expect(content).toHaveLength(1);
      const parsed = JSON.parse((content[0] as { type: string; text: string }).text) as { id: string }[];
      expect(parsed).toHaveLength(1);
      expect(parsed[0]?.id).toBe("acc-1");
    });

    it("calls the correct API endpoint", async () => {
      fetchSpy.mockReturnValue(jsonResponse({ bank_accounts: [] }));

      await mcpClient.callTool({
        name: "account_list",
        arguments: {},
      });

      const [url] = fetchSpy.mock.calls[0] as [URL];
      expect(url.pathname).toBe("/v2/bank_accounts");
    });
  });

  describe("account_show", () => {
    it("returns a single account", async () => {
      fetchSpy.mockReturnValue(
        jsonResponse({
          bank_account: makeBankAccount(),
        }),
      );

      const result = await mcpClient.callTool({
        name: "account_show",
        arguments: { id: "acc-1" },
      });

      const content = result.content as { type: string; text: string }[];
      expect(content).toHaveLength(1);
      const parsed = JSON.parse((content[0] as { type: string; text: string }).text) as { id: string };
      expect(parsed.id).toBe("acc-1");
    });

    it("calls the correct API endpoint", async () => {
      fetchSpy.mockReturnValue(
        jsonResponse({
          bank_account: makeBankAccount(),
        }),
      );

      await mcpClient.callTool({
        name: "account_show",
        arguments: { id: "acc-1" },
      });

      const [url] = fetchSpy.mock.calls[0] as [URL];
      expect(url.pathname).toBe("/v2/bank_accounts/acc-1");
    });
  });

  describe("account_iban_certificate", () => {
    it("returns PDF as base64-encoded embedded resource", async () => {
      const pdfData = Buffer.from("%PDF-1.4 test content");
      fetchSpy.mockReturnValue(binaryResponse(pdfData));

      const result = await mcpClient.callTool({
        name: "account_iban_certificate",
        arguments: { id: "acc-1" },
      });

      expect(result.isError).not.toBe(true);
      const content = result.content as { type: string; resource?: { blob: string; mimeType: string } }[];
      expect(content).toHaveLength(1);
      expect((content[0] as { type: string }).type).toBe("resource");
      const resource = (content[0] as { resource: { blob: string; mimeType: string } }).resource;
      expect(resource.mimeType).toBe("application/pdf");
      expect(Buffer.from(resource.blob, "base64").toString()).toBe("%PDF-1.4 test content");
    });

    it("calls the correct API endpoint", async () => {
      fetchSpy.mockReturnValue(binaryResponse(Buffer.from("data")));

      await mcpClient.callTool({
        name: "account_iban_certificate",
        arguments: { id: "acc-1" },
      });

      const [url] = fetchSpy.mock.calls[0] as [URL];
      expect(url.pathname).toBe("/v2/bank_accounts/acc-1/iban_certificate");
    });
  });

  describe("account_create", () => {
    it("creates an account and returns the result", async () => {
      fetchSpy.mockReturnValue(
        jsonResponse({
          bank_account: makeBankAccount({ id: "acc-new", name: "New Account" }),
        }),
      );

      const result = await mcpClient.callTool({
        name: "account_create",
        arguments: { name: "New Account" },
      });

      const content = result.content as { type: string; text: string }[];
      expect(content).toHaveLength(1);
      const parsed = JSON.parse((content[0] as { type: string; text: string }).text) as {
        id: string;
        name: string;
      };
      expect(parsed.id).toBe("acc-new");
      expect(parsed.name).toBe("New Account");
    });

    it("sends POST with wrapped body to the correct endpoint", async () => {
      fetchSpy.mockReturnValue(
        jsonResponse({
          bank_account: makeBankAccount({ id: "acc-new", name: "New Account" }),
        }),
      );

      await mcpClient.callTool({
        name: "account_create",
        arguments: { name: "New Account" },
      });

      const [url, opts] = fetchSpy.mock.calls[0] as [URL, RequestInit];
      expect(url.pathname).toBe("/v2/bank_accounts");
      expect(opts.method).toBe("POST");
      const body = JSON.parse(opts.body as string) as { bank_account: { name: string } };
      expect(body.bank_account.name).toBe("New Account");
    });
  });

  describe("account_update", () => {
    it("updates an account and returns the result", async () => {
      fetchSpy.mockReturnValue(
        jsonResponse({
          bank_account: makeBankAccount({ name: "Updated Name" }),
        }),
      );

      const result = await mcpClient.callTool({
        name: "account_update",
        arguments: { id: "acc-1", name: "Updated Name" },
      });

      const content = result.content as { type: string; text: string }[];
      expect(content).toHaveLength(1);
      const parsed = JSON.parse((content[0] as { type: string; text: string }).text) as {
        id: string;
        name: string;
      };
      expect(parsed.id).toBe("acc-1");
      expect(parsed.name).toBe("Updated Name");
    });

    it("sends PUT with wrapped body to the correct endpoint", async () => {
      fetchSpy.mockReturnValue(
        jsonResponse({
          bank_account: makeBankAccount({ name: "Updated Name" }),
        }),
      );

      await mcpClient.callTool({
        name: "account_update",
        arguments: { id: "acc-1", name: "Updated Name" },
      });

      const [url, opts] = fetchSpy.mock.calls[0] as [URL, RequestInit];
      expect(url.pathname).toBe("/v2/bank_accounts/acc-1");
      expect(opts.method).toBe("PUT");
      const body = JSON.parse(opts.body as string) as { bank_account: { name: string } };
      expect(body.bank_account.name).toBe("Updated Name");
    });
  });

  describe("account_close", () => {
    it("closes an account and returns confirmation", async () => {
      fetchSpy.mockReturnValue(new Response(null, { status: 204 }));

      const result = await mcpClient.callTool({
        name: "account_close",
        arguments: { id: "acc-1" },
      });

      const content = result.content as { type: string; text: string }[];
      expect(content).toHaveLength(1);
      const parsed = JSON.parse((content[0] as { type: string; text: string }).text) as {
        closed: boolean;
        id: string;
      };
      expect(parsed.closed).toBe(true);
      expect(parsed.id).toBe("acc-1");
    });

    it("sends POST to the correct close endpoint", async () => {
      fetchSpy.mockReturnValue(new Response(null, { status: 204 }));

      await mcpClient.callTool({
        name: "account_close",
        arguments: { id: "acc-1" },
      });

      const [url, opts] = fetchSpy.mock.calls[0] as [URL, RequestInit];
      expect(url.pathname).toBe("/v2/bank_accounts/acc-1/close");
      expect(opts.method).toBe("POST");
    });
  });
});
