// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { jsonResponse } from "@qontoctl/core/testing";
import { connectInMemory } from "../testing/mcp-helpers.js";

const sampleContract = {
  id: "ic-1",
  insurance_type: "professional_liability",
  status: "active",
  provider_name: "AXA",
  contract_number: "CNT-12345",
  start_date: "2026-01-01",
  end_date: "2027-01-01",
  created_at: "2026-01-01T10:00:00Z",
  updated_at: "2026-01-01T10:00:00Z",
};

const sampleDocument = {
  id: "doc-1",
  file_name: "policy.pdf",
  file_size: "54321",
  file_content_type: "application/pdf",
  url: "https://example.com/documents/doc-1",
  created_at: "2026-01-01T10:00:00Z",
};

describe("insurance MCP tools", () => {
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

  describe("insurance_show", () => {
    it("returns an insurance contract by ID", async () => {
      fetchSpy.mockReturnValue(jsonResponse({ insurance_contract: sampleContract }));

      const result = await mcpClient.callTool({
        name: "insurance_show",
        arguments: { id: "ic-1" },
      });

      const content = result.content as { type: string; text: string }[];
      expect(content).toHaveLength(1);
      const parsed = JSON.parse((content[0] as { type: string; text: string }).text) as { id: string };
      expect(parsed.id).toBe("ic-1");
    });

    it("calls the correct API endpoint", async () => {
      fetchSpy.mockReturnValue(jsonResponse({ insurance_contract: sampleContract }));

      await mcpClient.callTool({
        name: "insurance_show",
        arguments: { id: "ic-1" },
      });

      const [url, opts] = fetchSpy.mock.calls[0] as [URL, RequestInit];
      expect(url.pathname).toBe("/v2/insurance_contracts/ic-1");
      expect(opts.method).toBe("GET");
    });
  });

  describe("insurance_create", () => {
    it("creates an insurance contract", async () => {
      fetchSpy.mockReturnValue(jsonResponse({ insurance_contract: sampleContract }));

      const result = await mcpClient.callTool({
        name: "insurance_create",
        arguments: {
          insurance_type: "professional_liability",
          provider_name: "AXA",
          start_date: "2026-01-01",
        },
      });

      const content = result.content as { type: string; text: string }[];
      expect(content).toHaveLength(1);
      const parsed = JSON.parse((content[0] as { type: string; text: string }).text) as { id: string };
      expect(parsed.id).toBe("ic-1");
    });

    it("sends POST to the correct endpoint with body", async () => {
      fetchSpy.mockReturnValue(jsonResponse({ insurance_contract: sampleContract }));

      await mcpClient.callTool({
        name: "insurance_create",
        arguments: {
          insurance_type: "professional_liability",
          provider_name: "AXA",
          start_date: "2026-01-01",
          contract_number: "CNT-12345",
        },
      });

      const [url, opts] = fetchSpy.mock.calls[0] as [URL, RequestInit];
      expect(url.pathname).toBe("/v2/insurance_contracts");
      expect(opts.method).toBe("POST");

      const body = JSON.parse(opts.body as string) as Record<string, unknown>;
      expect(body).toEqual({
        insurance_contract: {
          insurance_type: "professional_liability",
          provider_name: "AXA",
          start_date: "2026-01-01",
          contract_number: "CNT-12345",
        },
      });
    });
  });

  describe("insurance_update", () => {
    it("updates an insurance contract", async () => {
      fetchSpy.mockReturnValue(jsonResponse({ insurance_contract: sampleContract }));

      const result = await mcpClient.callTool({
        name: "insurance_update",
        arguments: {
          id: "ic-1",
          provider_name: "Allianz",
        },
      });

      const content = result.content as { type: string; text: string }[];
      expect(content).toHaveLength(1);
      const parsed = JSON.parse((content[0] as { type: string; text: string }).text) as { id: string };
      expect(parsed.id).toBe("ic-1");

      const [url, opts] = fetchSpy.mock.calls[0] as [URL, RequestInit];
      expect(url.pathname).toBe("/v2/insurance_contracts/ic-1");
      expect(opts.method).toBe("PUT");
    });

    it("omits undefined optional fields from the request body", async () => {
      fetchSpy.mockReturnValue(jsonResponse({ insurance_contract: sampleContract }));

      await mcpClient.callTool({
        name: "insurance_update",
        arguments: {
          id: "ic-1",
          provider_name: "Allianz",
        },
      });

      const [, opts] = fetchSpy.mock.calls[0] as [URL, RequestInit];
      const body = JSON.parse(opts.body as string) as Record<string, unknown>;
      expect(body).toEqual({
        insurance_contract: {
          provider_name: "Allianz",
        },
      });
    });
  });

  describe("insurance_upload_document", () => {
    it("uploads a document to an insurance contract", async () => {
      fetchSpy.mockReturnValue(jsonResponse({ insurance_document: sampleDocument }));

      const result = await mcpClient.callTool({
        name: "insurance_upload_document",
        arguments: {
          contract_id: "ic-1",
          file_path: "package.json",
        },
      });

      const content = result.content as { type: string; text: string }[];
      expect(content).toHaveLength(1);
      const parsed = JSON.parse((content[0] as { type: string; text: string }).text) as { id: string };
      expect(parsed.id).toBe("doc-1");

      const [url, opts] = fetchSpy.mock.calls[0] as [URL, RequestInit];
      expect(url.pathname).toBe("/v2/insurance_contracts/ic-1/documents");
      expect(opts.method).toBe("POST");
      expect(opts.body).toBeInstanceOf(FormData);
    });
  });

  describe("insurance_remove_document", () => {
    it("removes a document from an insurance contract", async () => {
      fetchSpy.mockReturnValue(Promise.resolve(new Response(null, { status: 204 })));

      const result = await mcpClient.callTool({
        name: "insurance_remove_document",
        arguments: {
          contract_id: "ic-1",
          document_id: "doc-1",
        },
      });

      const content = result.content as { type: string; text: string }[];
      expect(content).toHaveLength(1);
      expect((content[0] as { type: string; text: string }).text).toContain("doc-1");
      expect((content[0] as { type: string; text: string }).text).toContain("removed");

      const [url, opts] = fetchSpy.mock.calls[0] as [URL, RequestInit];
      expect(url.pathname).toBe("/v2/insurance_contracts/ic-1/documents/doc-1");
      expect(opts.method).toBe("DELETE");
    });
  });
});
