// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { jsonResponse } from "@qontoctl/core/testing";
import { connectInMemory } from "../testing/mcp-helpers.js";

const sampleClient = {
  id: "cl-123",
  name: "Acme Corp",
  first_name: null,
  last_name: null,
  kind: "company",
  email: "contact@acme.com",
  address: "123 Main St",
  city: "Paris",
  zip_code: "75001",
  province_code: null,
  country_code: "FR",
  billing_address: null,
  delivery_address: null,
  vat_number: "FR12345678901",
  tax_identification_number: null,
  locale: "fr",
  currency: "EUR",
  created_at: "2026-01-15T10:00:00Z",
  updated_at: "2026-01-15T10:00:00Z",
};

describe("client MCP tools", () => {
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

  describe("client_list", () => {
    it("returns clients from API", async () => {
      fetchSpy.mockReturnValue(
        jsonResponse({
          clients: [sampleClient],
          meta: {
            current_page: 1,
            next_page: null,
            prev_page: null,
            total_pages: 1,
            total_count: 1,
            per_page: 100,
          },
        }),
      );

      const result = await mcpClient.callTool({
        name: "client_list",
        arguments: {},
      });

      const content = result.content as { type: string; text: string }[];
      expect(content).toHaveLength(1);
      const first = content[0] as { type: string; text: string };
      const parsed = JSON.parse(first.text) as { clients: unknown[] };
      expect(parsed.clients).toHaveLength(1);
    });

    it("passes pagination params to API", async () => {
      fetchSpy.mockReturnValue(
        jsonResponse({
          clients: [],
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
        name: "client_list",
        arguments: { page: 2, per_page: 10 },
      });

      const [url] = fetchSpy.mock.calls[0] as [URL];
      expect(url.searchParams.get("page")).toBe("2");
      expect(url.searchParams.get("per_page")).toBe("10");
    });
  });

  describe("client_show", () => {
    it("returns a single client", async () => {
      fetchSpy.mockReturnValue(jsonResponse({ client: sampleClient }));

      const result = await mcpClient.callTool({
        name: "client_show",
        arguments: { id: "cl-123" },
      });

      const content = result.content as { type: string; text: string }[];
      expect(content).toHaveLength(1);
      const first = content[0] as { type: string; text: string };
      const parsed = JSON.parse(first.text) as { id: string; name: string };
      expect(parsed.id).toBe("cl-123");
      expect(parsed.name).toBe("Acme Corp");
    });

    it("calls the correct API endpoint", async () => {
      fetchSpy.mockReturnValue(jsonResponse({ client: sampleClient }));

      await mcpClient.callTool({
        name: "client_show",
        arguments: { id: "cl-123" },
      });

      const [url] = fetchSpy.mock.calls[0] as [URL];
      expect(url.pathname).toBe("/v2/clients/cl-123");
    });
  });

  describe("client_create", () => {
    it("creates a client and returns the result", async () => {
      fetchSpy.mockReturnValue(jsonResponse({ client: sampleClient }));

      const result = await mcpClient.callTool({
        name: "client_create",
        arguments: {
          kind: "company",
          name: "Acme Corp",
          email: "contact@acme.com",
        },
      });

      const content = result.content as { type: string; text: string }[];
      expect(content).toHaveLength(1);
      const first = content[0] as { type: string; text: string };
      const parsed = JSON.parse(first.text) as { id: string };
      expect(parsed.id).toBe("cl-123");
    });

    it("sends POST with flat body to the correct endpoint", async () => {
      fetchSpy.mockReturnValue(jsonResponse({ client: sampleClient }));

      await mcpClient.callTool({
        name: "client_create",
        arguments: {
          kind: "company",
          name: "Acme Corp",
          email: "contact@acme.com",
        },
      });

      const [url, opts] = fetchSpy.mock.calls[0] as [URL, RequestInit];
      expect(url.pathname).toBe("/v2/clients");
      expect(opts.method).toBe("POST");
      const body = JSON.parse(opts.body as string) as Record<string, unknown>;
      expect(body).toHaveProperty("kind", "company");
      expect(body).toHaveProperty("name", "Acme Corp");
      expect(body).toHaveProperty("email", "contact@acme.com");
      expect(body).not.toHaveProperty("client");
    });
  });

  describe("client_update", () => {
    it("updates a client and returns the result", async () => {
      fetchSpy.mockReturnValue(jsonResponse({ client: { ...sampleClient, name: "Acme Inc" } }));

      const result = await mcpClient.callTool({
        name: "client_update",
        arguments: {
          id: "cl-123",
          name: "Acme Inc",
        },
      });

      const content = result.content as { type: string; text: string }[];
      expect(content).toHaveLength(1);
      const first = content[0] as { type: string; text: string };
      const parsed = JSON.parse(first.text) as { id: string; name: string };
      expect(parsed.id).toBe("cl-123");
    });

    it("sends PATCH with flat body to the correct endpoint", async () => {
      fetchSpy.mockReturnValue(jsonResponse({ client: sampleClient }));

      await mcpClient.callTool({
        name: "client_update",
        arguments: {
          id: "cl-123",
          name: "Acme Inc",
        },
      });

      const [url, opts] = fetchSpy.mock.calls[0] as [URL, RequestInit];
      expect(url.pathname).toBe("/v2/clients/cl-123");
      expect(opts.method).toBe("PATCH");
      const body = JSON.parse(opts.body as string) as Record<string, unknown>;
      expect(body).toHaveProperty("name", "Acme Inc");
      expect(body).not.toHaveProperty("client");
    });
  });

  describe("client_delete", () => {
    it("deletes a client and returns confirmation", async () => {
      fetchSpy.mockReturnValue(new Response(null, { status: 204 }));

      const result = await mcpClient.callTool({
        name: "client_delete",
        arguments: { id: "cl-123" },
      });

      const content = result.content as { type: string; text: string }[];
      expect(content).toHaveLength(1);
      const first = content[0] as { type: string; text: string };
      const parsed = JSON.parse(first.text) as { deleted: boolean; id: string };
      expect(parsed.deleted).toBe(true);
      expect(parsed.id).toBe("cl-123");
    });

    it("sends DELETE to the correct endpoint", async () => {
      fetchSpy.mockReturnValue(new Response(null, { status: 204 }));

      await mcpClient.callTool({
        name: "client_delete",
        arguments: { id: "cl-123" },
      });

      const [url, opts] = fetchSpy.mock.calls[0] as [URL, RequestInit];
      expect(url.pathname).toBe("/v2/clients/cl-123");
      expect(opts.method).toBe("DELETE");
    });
  });
});
