// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { jsonResponse } from "@qontoctl/core/testing";
import { connectInMemory } from "../testing/mcp-helpers.js";

function makeRequirements(overrides: Record<string, unknown> = {}) {
  return {
    fields: [
      {
        key: "reference",
        name: "Payment reference",
        type: "text",
        example: "INV-001",
        min_length: 1,
        max_length: 140,
      },
      {
        key: "purpose_code",
        name: "Purpose code",
        type: "text",
        validation_regexp: "^[A-Z]{4}$",
      },
    ],
    ...overrides,
  };
}

function makeIntlTransfer(overrides: Record<string, unknown> = {}) {
  return {
    id: "intl-txfr-1",
    beneficiary_id: "intl-ben-1",
    quote_id: "quote-1",
    status: "processing",
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("intl-transfer MCP tools", () => {
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

  describe("intl_transfer_requirements", () => {
    it("returns requirements from API", async () => {
      fetchSpy.mockReturnValue(
        jsonResponse({ requirements: makeRequirements() }),
      );

      const result = await mcpClient.callTool({
        name: "intl_transfer_requirements",
        arguments: { id: "intl-ben-1" },
      });

      const content = result.content as { type: string; text: string }[];
      expect(content).toHaveLength(1);
      const parsed = JSON.parse((content[0] as { type: string; text: string }).text) as {
        fields: { key: string }[];
      };
      expect(parsed.fields).toHaveLength(2);
      expect(parsed.fields[0]?.key).toBe("reference");
      expect(parsed.fields[1]?.key).toBe("purpose_code");
    });

    it("calls the correct API endpoint", async () => {
      fetchSpy.mockReturnValue(
        jsonResponse({ requirements: makeRequirements() }),
      );

      await mcpClient.callTool({
        name: "intl_transfer_requirements",
        arguments: { id: "intl-ben-1" },
      });

      const [url] = fetchSpy.mock.calls[0] as [URL];
      expect(url.pathname).toBe("/v2/international/transfers/intl-ben-1/requirements");
    });
  });

  describe("intl_transfer_create", () => {
    it("creates an international transfer", async () => {
      fetchSpy.mockReturnValue(
        jsonResponse({ international_transfer: makeIntlTransfer() }),
      );

      const result = await mcpClient.callTool({
        name: "intl_transfer_create",
        arguments: {
          beneficiary_id: "intl-ben-1",
          quote_id: "quote-1",
        },
      });

      const content = result.content as { type: string; text: string }[];
      expect(content).toHaveLength(1);
      const parsed = JSON.parse((content[0] as { type: string; text: string }).text) as { id: string };
      expect(parsed.id).toBe("intl-txfr-1");
    });

    it("calls the correct API endpoint with proper body", async () => {
      fetchSpy.mockReturnValue(
        jsonResponse({ international_transfer: makeIntlTransfer() }),
      );

      await mcpClient.callTool({
        name: "intl_transfer_create",
        arguments: {
          beneficiary_id: "intl-ben-1",
          quote_id: "quote-1",
        },
      });

      const [url, init] = fetchSpy.mock.calls[0] as [URL, RequestInit];
      expect(url.pathname).toBe("/v2/international/transfers");
      expect(init.method).toBe("POST");

      const body = JSON.parse(init.body as string) as {
        international_transfer: { beneficiary_id: string; quote_id: string };
      };
      expect(body.international_transfer.beneficiary_id).toBe("intl-ben-1");
      expect(body.international_transfer.quote_id).toBe("quote-1");
    });

    it("passes additional fields in the transfer body", async () => {
      fetchSpy.mockReturnValue(
        jsonResponse({ international_transfer: makeIntlTransfer() }),
      );

      await mcpClient.callTool({
        name: "intl_transfer_create",
        arguments: {
          beneficiary_id: "intl-ben-1",
          quote_id: "quote-1",
          fields: { reference: "INV-001", purpose_code: "SALA" },
        },
      });

      const [, init] = fetchSpy.mock.calls[0] as [URL, RequestInit];
      const body = JSON.parse(init.body as string) as {
        international_transfer: {
          beneficiary_id: string;
          quote_id: string;
          reference: string;
          purpose_code: string;
        };
      };
      expect(body.international_transfer.reference).toBe("INV-001");
      expect(body.international_transfer.purpose_code).toBe("SALA");
    });

    it("creates transfer without optional fields", async () => {
      fetchSpy.mockReturnValue(
        jsonResponse({ international_transfer: makeIntlTransfer() }),
      );

      await mcpClient.callTool({
        name: "intl_transfer_create",
        arguments: {
          beneficiary_id: "intl-ben-1",
          quote_id: "quote-1",
        },
      });

      const [, init] = fetchSpy.mock.calls[0] as [URL, RequestInit];
      const body = JSON.parse(init.body as string) as {
        international_transfer: Record<string, unknown>;
      };
      // Should only have beneficiary_id and quote_id
      expect(body.international_transfer.beneficiary_id).toBe("intl-ben-1");
      expect(body.international_transfer.quote_id).toBe("quote-1");
      expect(Object.keys(body.international_transfer)).toHaveLength(2);
    });
  });
});
