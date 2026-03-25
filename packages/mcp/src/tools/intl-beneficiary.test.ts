// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { jsonResponse } from "@qontoctl/core/testing";
import { connectInMemory } from "../testing/mcp-helpers.js";

describe("intl-beneficiary MCP tools", () => {
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

  describe("intl_beneficiary_list", () => {
    it("returns international beneficiaries from API", async () => {
      const international_beneficiaries = [
        {
          id: "intl-ben-1",
          name: "Global Corp",
          country: "US",
          currency: "USD",
          created_at: "2025-01-01T00:00:00.000Z",
          updated_at: "2025-01-01T00:00:00.000Z",
        },
        {
          id: "intl-ben-2",
          name: "Tokyo Inc",
          country: "JP",
          currency: "JPY",
          created_at: "2025-02-01T00:00:00.000Z",
          updated_at: "2025-02-01T00:00:00.000Z",
        },
      ];
      fetchSpy.mockReturnValue(
        jsonResponse({
          international_beneficiaries,
          meta: {
            current_page: 1,
            next_page: null,
            prev_page: null,
            total_pages: 1,
            total_count: 2,
            per_page: 100,
          },
        }),
      );

      const result = await mcpClient.callTool({
        name: "intl_beneficiary_list",
        arguments: {},
      });

      const content = result.content as { type: string; text: string }[];
      expect(content).toHaveLength(1);
      const first = content[0] as { type: string; text: string };
      const parsed = JSON.parse(first.text) as { international_beneficiaries: unknown[] };
      expect(parsed.international_beneficiaries).toHaveLength(2);
    });

    it("passes pagination params to API", async () => {
      fetchSpy.mockReturnValue(
        jsonResponse({
          international_beneficiaries: [],
          meta: {
            current_page: 2,
            next_page: null,
            prev_page: 1,
            total_pages: 2,
            total_count: 0,
            per_page: 10,
          },
        }),
      );

      await mcpClient.callTool({
        name: "intl_beneficiary_list",
        arguments: { page: 2, per_page: 10 },
      });

      const [url] = fetchSpy.mock.calls[0] as [URL];
      expect(url.searchParams.get("page")).toBe("2");
      expect(url.searchParams.get("per_page")).toBe("10");
    });
  });

  describe("intl_beneficiary_requirements", () => {
    it("returns requirements for a beneficiary corridor", async () => {
      const requirements = {
        fields: [
          {
            key: "account_number",
            name: "Account Number",
            type: "text",
            example: "123456789",
            validation_regexp: "^[0-9]+$",
            min_length: 5,
            max_length: 20,
          },
          {
            key: "bank_code",
            name: "Bank Code",
            type: "text",
          },
        ],
      };
      fetchSpy.mockReturnValue(jsonResponse({ requirements }));

      const result = await mcpClient.callTool({
        name: "intl_beneficiary_requirements",
        arguments: { id: "intl-ben-1" },
      });

      const content = result.content as { type: string; text: string }[];
      expect(content).toHaveLength(1);
      const first = content[0] as { type: string; text: string };
      const parsed = JSON.parse(first.text) as { fields: unknown[] };
      expect(parsed.fields).toHaveLength(2);
    });

    it("calls the correct API endpoint", async () => {
      fetchSpy.mockReturnValue(
        jsonResponse({
          requirements: { fields: [] },
        }),
      );

      await mcpClient.callTool({
        name: "intl_beneficiary_requirements",
        arguments: { id: "intl-ben-1" },
      });

      const [url] = fetchSpy.mock.calls[0] as [URL];
      expect(url.pathname).toBe("/v2/international/beneficiaries/intl-ben-1/requirements");
    });
  });

  describe("intl_beneficiary_add", () => {
    const createdBeneficiary = {
      id: "intl-ben-new",
      name: "New Global Corp",
      country: "US",
      currency: "USD",
      created_at: "2026-03-01T00:00:00.000Z",
      updated_at: "2026-03-01T00:00:00.000Z",
    };

    it("creates an international beneficiary and returns the result", async () => {
      fetchSpy.mockReturnValue(jsonResponse({ international_beneficiary: createdBeneficiary }));

      const result = await mcpClient.callTool({
        name: "intl_beneficiary_add",
        arguments: { country: "US", currency: "USD", fields: { name: "New Global Corp" } },
      });

      const content = result.content as { type: string; text: string }[];
      expect(content).toHaveLength(1);
      const first = content[0] as { type: string; text: string };
      const parsed = JSON.parse(first.text) as { id: string; name: string };
      expect(parsed.id).toBe("intl-ben-new");
      expect(parsed.name).toBe("New Global Corp");
    });

    it("sends POST with body to the correct endpoint", async () => {
      fetchSpy.mockReturnValue(jsonResponse({ international_beneficiary: createdBeneficiary }));

      await mcpClient.callTool({
        name: "intl_beneficiary_add",
        arguments: { country: "US", currency: "USD", fields: { name: "New Global Corp" } },
      });

      const [url, opts] = fetchSpy.mock.calls[0] as [URL, RequestInit];
      expect(url.pathname).toBe("/v2/international/beneficiaries");
      expect(opts.method).toBe("POST");
      const body = JSON.parse(opts.body as string) as Record<string, unknown>;
      expect(body).toEqual({
        international_beneficiary: {
          country: "US",
          currency: "USD",
          name: "New Global Corp",
        },
      });
    });
  });

  describe("intl_beneficiary_update", () => {
    const updatedBeneficiary = {
      id: "intl-ben-1",
      name: "Updated Global Corp",
      country: "US",
      currency: "USD",
      created_at: "2025-01-01T00:00:00.000Z",
      updated_at: "2026-03-01T00:00:00.000Z",
    };

    it("updates an international beneficiary and returns the result", async () => {
      fetchSpy.mockReturnValue(jsonResponse({ international_beneficiary: updatedBeneficiary }));

      const result = await mcpClient.callTool({
        name: "intl_beneficiary_update",
        arguments: { id: "intl-ben-1", fields: { name: "Updated Global Corp" } },
      });

      const content = result.content as { type: string; text: string }[];
      expect(content).toHaveLength(1);
      const first = content[0] as { type: string; text: string };
      const parsed = JSON.parse(first.text) as { id: string; name: string };
      expect(parsed.id).toBe("intl-ben-1");
      expect(parsed.name).toBe("Updated Global Corp");
    });

    it("sends PATCH with body to the correct endpoint", async () => {
      fetchSpy.mockReturnValue(jsonResponse({ international_beneficiary: updatedBeneficiary }));

      await mcpClient.callTool({
        name: "intl_beneficiary_update",
        arguments: { id: "intl-ben-1", fields: { name: "Updated Global Corp" } },
      });

      const [url, opts] = fetchSpy.mock.calls[0] as [URL, RequestInit];
      expect(url.pathname).toBe("/v2/international/beneficiaries/intl-ben-1");
      expect(opts.method).toBe("PATCH");
      const body = JSON.parse(opts.body as string) as Record<string, unknown>;
      expect(body).toEqual({
        international_beneficiary: {
          name: "Updated Global Corp",
        },
      });
    });
  });

  describe("intl_beneficiary_remove", () => {
    it("removes an international beneficiary and returns confirmation", async () => {
      fetchSpy.mockReturnValue(new Response(null, { status: 204 }));

      const result = await mcpClient.callTool({
        name: "intl_beneficiary_remove",
        arguments: { id: "intl-ben-1" },
      });

      const content = result.content as { type: string; text: string }[];
      expect(content).toHaveLength(1);
      const first = content[0] as { type: string; text: string };
      const parsed = JSON.parse(first.text) as { removed: boolean; id: string };
      expect(parsed.removed).toBe(true);
      expect(parsed.id).toBe("intl-ben-1");
    });

    it("sends DELETE to the correct endpoint", async () => {
      fetchSpy.mockReturnValue(new Response(null, { status: 204 }));

      await mcpClient.callTool({
        name: "intl_beneficiary_remove",
        arguments: { id: "intl-ben-1" },
      });

      const [url, opts] = fetchSpy.mock.calls[0] as [URL, RequestInit];
      expect(url.pathname).toBe("/v2/international/beneficiaries/intl-ben-1");
      expect(opts.method).toBe("DELETE");
    });
  });
});
