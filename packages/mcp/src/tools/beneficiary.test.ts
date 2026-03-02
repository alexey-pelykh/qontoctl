// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { jsonResponse } from "@qontoctl/core/testing";
import { connectInMemory } from "../testing/mcp-helpers.js";

describe("beneficiary MCP tools", () => {
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

  describe("beneficiary_list", () => {
    it("returns beneficiaries from API", async () => {
      const beneficiaries = [
        {
          id: "ben-1",
          name: "Acme Corp",
          iban: "FR7630001007941234567890185",
          bic: "BNPAFRPP",
          email: null,
          activity_tag: null,
          status: "validated",
          trusted: true,
          created_at: "2025-01-01T00:00:00.000Z",
          updated_at: "2025-01-01T00:00:00.000Z",
        },
        {
          id: "ben-2",
          name: "Test LLC",
          iban: "DE89370400440532013000",
          bic: "COBADEFFXXX",
          email: "test@example.com",
          activity_tag: "consulting",
          status: "pending",
          trusted: false,
          created_at: "2025-02-01T00:00:00.000Z",
          updated_at: "2025-02-01T00:00:00.000Z",
        },
      ];
      fetchSpy.mockReturnValue(
        jsonResponse({
          beneficiaries,
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
        name: "beneficiary_list",
        arguments: {},
      });

      const content = result.content as { type: string; text: string }[];
      expect(content).toHaveLength(1);
      const first = content[0] as { type: string; text: string };
      const parsed = JSON.parse(first.text) as { beneficiaries: unknown[] };
      expect(parsed.beneficiaries).toHaveLength(2);
    });

    it("passes pagination params to API", async () => {
      fetchSpy.mockReturnValue(
        jsonResponse({
          beneficiaries: [],
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
        name: "beneficiary_list",
        arguments: { current_page: 2, per_page: 10 },
      });

      const [url] = fetchSpy.mock.calls[0] as [URL];
      expect(url.searchParams.get("current_page")).toBe("2");
      expect(url.searchParams.get("per_page")).toBe("10");
    });

    it("passes filter params to API", async () => {
      fetchSpy.mockReturnValue(
        jsonResponse({
          beneficiaries: [],
          meta: {
            current_page: 1,
            next_page: null,
            prev_page: null,
            total_pages: 1,
            total_count: 0,
            per_page: 100,
          },
        }),
      );

      await mcpClient.callTool({
        name: "beneficiary_list",
        arguments: { status: "validated", trusted: true },
      });

      const [url] = fetchSpy.mock.calls[0] as [URL];
      expect(url.searchParams.get("status[]")).toBe("validated");
      expect(url.searchParams.get("trusted")).toBe("true");
    });
  });

  describe("beneficiary_show", () => {
    it("returns a single beneficiary", async () => {
      const beneficiary = {
        id: "ben-1",
        name: "Acme Corp",
        iban: "FR7630001007941234567890185",
        bic: "BNPAFRPP",
        email: null,
        activity_tag: null,
        status: "validated",
        trusted: true,
        created_at: "2025-01-01T00:00:00.000Z",
        updated_at: "2025-01-01T00:00:00.000Z",
      };
      fetchSpy.mockReturnValue(jsonResponse({ beneficiary }));

      const result = await mcpClient.callTool({
        name: "beneficiary_show",
        arguments: { id: "ben-1" },
      });

      const content = result.content as { type: string; text: string }[];
      expect(content).toHaveLength(1);
      const first = content[0] as { type: string; text: string };
      const parsed = JSON.parse(first.text) as { id: string; name: string };
      expect(parsed.id).toBe("ben-1");
      expect(parsed.name).toBe("Acme Corp");
    });

    it("calls the correct API endpoint", async () => {
      fetchSpy.mockReturnValue(
        jsonResponse({
          beneficiary: {
            id: "ben-1",
            name: "Test",
            iban: "FR7630001007941234567890185",
            bic: "BNPAFRPP",
            email: null,
            activity_tag: null,
            status: "validated",
            trusted: false,
            created_at: "2025-01-01T00:00:00.000Z",
            updated_at: "2025-01-01T00:00:00.000Z",
          },
        }),
      );

      await mcpClient.callTool({
        name: "beneficiary_show",
        arguments: { id: "ben-1" },
      });

      const [url] = fetchSpy.mock.calls[0] as [URL];
      expect(url.pathname).toBe("/v2/sepa/beneficiaries/ben-1");
    });
  });

  describe("beneficiary_add", () => {
    const createdBeneficiary = {
      id: "ben-new",
      name: "New Corp",
      iban: "FR7630001007941234567890185",
      bic: "BNPAFRPP",
      email: null,
      activity_tag: null,
      status: "pending",
      trusted: false,
      created_at: "2026-03-01T00:00:00.000Z",
      updated_at: "2026-03-01T00:00:00.000Z",
    };

    it("creates a beneficiary and returns the result", async () => {
      fetchSpy.mockReturnValue(jsonResponse({ beneficiary: createdBeneficiary }));

      const result = await mcpClient.callTool({
        name: "beneficiary_add",
        arguments: { name: "New Corp", iban: "FR7630001007941234567890185" },
      });

      const content = result.content as { type: string; text: string }[];
      expect(content).toHaveLength(1);
      const first = content[0] as { type: string; text: string };
      const parsed = JSON.parse(first.text) as { id: string; name: string };
      expect(parsed.id).toBe("ben-new");
      expect(parsed.name).toBe("New Corp");
    });

    it("sends POST with body to the correct endpoint", async () => {
      fetchSpy.mockReturnValue(jsonResponse({ beneficiary: createdBeneficiary }));

      await mcpClient.callTool({
        name: "beneficiary_add",
        arguments: { name: "New Corp", iban: "FR7630001007941234567890185", bic: "BNPAFRPP" },
      });

      const [url, opts] = fetchSpy.mock.calls[0] as [URL, RequestInit];
      expect(url.pathname).toBe("/v2/sepa/beneficiaries");
      expect(opts.method).toBe("POST");
      const body = JSON.parse(opts.body as string) as Record<string, unknown>;
      expect(body).toHaveProperty("name", "New Corp");
      expect(body).toHaveProperty("iban", "FR7630001007941234567890185");
      expect(body).toHaveProperty("bic", "BNPAFRPP");
    });
  });

  describe("beneficiary_update", () => {
    const updatedBeneficiary = {
      id: "ben-1",
      name: "Updated Corp",
      iban: "FR7630001007941234567890185",
      bic: "BNPAFRPP",
      email: null,
      activity_tag: null,
      status: "validated",
      trusted: true,
      created_at: "2025-01-01T00:00:00.000Z",
      updated_at: "2026-03-01T00:00:00.000Z",
    };

    it("updates a beneficiary and returns the result", async () => {
      fetchSpy.mockReturnValue(jsonResponse({ beneficiary: updatedBeneficiary }));

      const result = await mcpClient.callTool({
        name: "beneficiary_update",
        arguments: { id: "ben-1", name: "Updated Corp" },
      });

      const content = result.content as { type: string; text: string }[];
      expect(content).toHaveLength(1);
      const first = content[0] as { type: string; text: string };
      const parsed = JSON.parse(first.text) as { id: string; name: string };
      expect(parsed.id).toBe("ben-1");
      expect(parsed.name).toBe("Updated Corp");
    });

    it("sends PUT with body to the correct endpoint", async () => {
      fetchSpy.mockReturnValue(jsonResponse({ beneficiary: updatedBeneficiary }));

      await mcpClient.callTool({
        name: "beneficiary_update",
        arguments: { id: "ben-1", name: "Updated Corp" },
      });

      const [url, opts] = fetchSpy.mock.calls[0] as [URL, RequestInit];
      expect(url.pathname).toBe("/v2/sepa/beneficiaries/ben-1");
      expect(opts.method).toBe("PUT");
      const body = JSON.parse(opts.body as string) as Record<string, unknown>;
      expect(body).toHaveProperty("name", "Updated Corp");
    });
  });

  describe("beneficiary_trust", () => {
    it("trusts beneficiaries and returns confirmation", async () => {
      fetchSpy.mockReturnValue(jsonResponse({}));

      const result = await mcpClient.callTool({
        name: "beneficiary_trust",
        arguments: { ids: ["ben-1", "ben-2"] },
      });

      const content = result.content as { type: string; text: string }[];
      expect(content).toHaveLength(1);
      const first = content[0] as { type: string; text: string };
      const parsed = JSON.parse(first.text) as { trusted: boolean; ids: string[] };
      expect(parsed.trusted).toBe(true);
      expect(parsed.ids).toEqual(["ben-1", "ben-2"]);
    });

    it("sends POST with ids to the correct endpoint", async () => {
      fetchSpy.mockReturnValue(jsonResponse({}));

      await mcpClient.callTool({
        name: "beneficiary_trust",
        arguments: { ids: ["ben-1"] },
      });

      const [url, opts] = fetchSpy.mock.calls[0] as [URL, RequestInit];
      expect(url.pathname).toBe("/v2/sepa/beneficiaries/trust");
      expect(opts.method).toBe("POST");
      const body = JSON.parse(opts.body as string) as { ids: string[] };
      expect(body.ids).toEqual(["ben-1"]);
    });
  });

  describe("beneficiary_untrust", () => {
    it("untrusts beneficiaries and returns confirmation", async () => {
      fetchSpy.mockReturnValue(jsonResponse({}));

      const result = await mcpClient.callTool({
        name: "beneficiary_untrust",
        arguments: { ids: ["ben-1", "ben-2"] },
      });

      const content = result.content as { type: string; text: string }[];
      expect(content).toHaveLength(1);
      const first = content[0] as { type: string; text: string };
      const parsed = JSON.parse(first.text) as { untrusted: boolean; ids: string[] };
      expect(parsed.untrusted).toBe(true);
      expect(parsed.ids).toEqual(["ben-1", "ben-2"]);
    });

    it("sends POST with ids to the correct endpoint", async () => {
      fetchSpy.mockReturnValue(jsonResponse({}));

      await mcpClient.callTool({
        name: "beneficiary_untrust",
        arguments: { ids: ["ben-1"] },
      });

      const [url, opts] = fetchSpy.mock.calls[0] as [URL, RequestInit];
      expect(url.pathname).toBe("/v2/sepa/beneficiaries/untrust");
      expect(opts.method).toBe("POST");
      const body = JSON.parse(opts.body as string) as { ids: string[] };
      expect(body.ids).toEqual(["ben-1"]);
    });
  });
});
