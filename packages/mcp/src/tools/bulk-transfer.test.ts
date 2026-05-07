// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { jsonResponse } from "@qontoctl/core/testing";
import { connectInMemory } from "../testing/mcp-helpers.js";

function makeMeta(overrides: Record<string, unknown> = {}) {
  return {
    current_page: 1,
    next_page: null,
    prev_page: null,
    total_pages: 1,
    total_count: 1,
    per_page: 100,
    ...overrides,
  };
}

function makeBulkTransfer(overrides: Record<string, unknown> = {}) {
  return {
    id: "bt-1",
    initiator_id: "init-1",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    total_count: 5,
    completed_count: 3,
    pending_count: 1,
    failed_count: 1,
    results: [],
    ...overrides,
  };
}

describe("bulk-transfer MCP tools", () => {
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

  describe("bulk_transfer_list", () => {
    it("returns bulk transfers from API", async () => {
      fetchSpy.mockReturnValue(
        jsonResponse({
          bulk_transfers: [makeBulkTransfer()],
          meta: makeMeta(),
        }),
      );

      const result = await mcpClient.callTool({
        name: "bulk_transfer_list",
        arguments: {},
      });

      const content = result.content as { type: string; text: string }[];
      expect(content).toHaveLength(1);
      const parsed = JSON.parse((content[0] as { type: string; text: string }).text) as {
        bulk_transfers: { id: string }[];
      };
      expect(parsed.bulk_transfers).toHaveLength(1);
      expect(parsed.bulk_transfers[0]?.id).toBe("bt-1");
    });

    it("calls the correct API endpoint", async () => {
      fetchSpy.mockReturnValue(
        jsonResponse({
          bulk_transfers: [],
          meta: makeMeta({ total_count: 0 }),
        }),
      );

      await mcpClient.callTool({
        name: "bulk_transfer_list",
        arguments: {},
      });

      const [url] = fetchSpy.mock.calls[0] as [URL];
      expect(url.pathname).toBe("/v2/sepa/bulk_transfers");
    });

    it("passes pagination parameters", async () => {
      fetchSpy.mockReturnValue(
        jsonResponse({
          bulk_transfers: [],
          meta: makeMeta({ current_page: 2, total_pages: 3, total_count: 10 }),
        }),
      );

      await mcpClient.callTool({
        name: "bulk_transfer_list",
        arguments: { page: 2, per_page: 5 },
      });

      const [url] = fetchSpy.mock.calls[0] as [URL];
      expect(url.searchParams.get("page")).toBe("2");
      expect(url.searchParams.get("per_page")).toBe("5");
    });
  });

  describe("bulk_transfer_create", () => {
    function mockHappyPath(): void {
      fetchSpy.mockImplementation((url: URL) => {
        const path = url.pathname;
        if (path.startsWith("/v2/sepa/beneficiaries/ben-1")) {
          return jsonResponse({
            beneficiary: {
              id: "ben-1",
              name: "Alice Inc",
              iban: "DE91100000000123456789",
              bic: "DEUTDEDDXXX",
              trusted: true,
              status: "validated",
              created_at: "2026-01-01T00:00:00Z",
              updated_at: "2026-01-01T00:00:00Z",
            },
          });
        }
        if (path === "/v2/sepa/bulk_verify_payee") {
          return jsonResponse({
            proof_token: { token: "tok_bulk" },
            requests: [
              {
                id: "0",
                beneficiary_name: "Alice Inc",
                iban: "DE91100000000123456789",
                response: { match_result: "MATCH_RESULT_MATCH", matched_name: null },
              },
            ],
          });
        }
        if (path === "/v2/sepa/bulk_transfers") {
          return jsonResponse({ bulk_transfer: makeBulkTransfer() });
        }
        throw new Error(`Unexpected URL: ${path}`);
      });
    }

    it("creates a bulk transfer with auto-resolved VoP and flat body shape", async () => {
      mockHappyPath();

      const result = await mcpClient.callTool({
        name: "bulk_transfer_create",
        arguments: {
          bank_account_id: "acct-1",
          bulk_transfers: [
            {
              client_transfer_id: "11111111-1111-4111-8111-111111111111",
              beneficiary_id: "ben-1",
              amount: 100,
              reference: "Pay 1",
            },
          ],
        },
      });

      const content = result.content as { type: string; text: string }[];
      expect(content).toHaveLength(1);
      const parsed = JSON.parse((content[0] as { type: string; text: string }).text) as { id: string };
      expect(parsed.id).toBe("bt-1");

      const createCall = fetchSpy.mock.calls.find(([url]: [URL]) => url.pathname === "/v2/sepa/bulk_transfers") as [
        URL,
        RequestInit,
      ];
      const body = JSON.parse(createCall[1].body as string) as Record<string, unknown>;
      expect(body).toEqual({
        bank_account_id: "acct-1",
        vop_proof_token: "tok_bulk",
        bulk_transfers: [
          {
            client_transfer_id: "11111111-1111-4111-8111-111111111111",
            beneficiary_id: "ben-1",
            amount: "100.00",
            reference: "Pay 1",
          },
        ],
      });
    });

    it("uses caller-supplied vop_proof_token verbatim and skips bulk_verify_payee", async () => {
      fetchSpy.mockImplementation((url: URL) => {
        if (url.pathname === "/v2/sepa/bulk_transfers") {
          return jsonResponse({ bulk_transfer: makeBulkTransfer() });
        }
        throw new Error(`Unexpected URL: ${url.pathname}`);
      });

      await mcpClient.callTool({
        name: "bulk_transfer_create",
        arguments: {
          bank_account_id: "acct-1",
          bulk_transfers: [
            {
              client_transfer_id: "11111111-1111-4111-8111-111111111111",
              beneficiary_id: "ben-1",
              amount: 100,
              reference: "Pay 1",
            },
          ],
          vop_proof_token: "tok_caller",
        },
      });

      const createCall = fetchSpy.mock.calls.find(([url]: [URL]) => url.pathname === "/v2/sepa/bulk_transfers") as [
        URL,
        RequestInit,
      ];
      const body = JSON.parse(createCall[1].body as string) as { vop_proof_token: string };
      expect(body.vop_proof_token).toBe("tok_caller");

      const bulkVopCalled = fetchSpy.mock.calls.some(([url]: [URL]) => url.pathname === "/v2/sepa/bulk_verify_payee");
      expect(bulkVopCalled).toBe(false);
    });

    it("on SCA retry (sca_session_token supplied), errors when vop_proof_token is omitted (PSD2 dynamic linking)", async () => {
      const result = await mcpClient.callTool({
        name: "bulk_transfer_create",
        arguments: {
          bank_account_id: "acct-1",
          bulk_transfers: [
            {
              client_transfer_id: "11111111-1111-4111-8111-111111111111",
              beneficiary_id: "ben-1",
              amount: 100,
              reference: "Pay 1",
            },
          ],
          sca_session_token: "sca-tok",
        },
      });

      expect(result.isError).toBe(true);
      const content = result.content as { type: string; text: string }[];
      expect(content[0]?.text).toContain("vop_proof_token is required when retrying with sca_session_token");

      // Crucially, no auto-resolution attempted on retry path.
      const bulkVopCalled = fetchSpy.mock.calls.some(([url]: [URL]) => url.pathname === "/v2/sepa/bulk_verify_payee");
      expect(bulkVopCalled).toBe(false);
    });

    it("rejects items that specify both beneficiary_id and beneficiary", async () => {
      const result = await mcpClient.callTool({
        name: "bulk_transfer_create",
        arguments: {
          bank_account_id: "acct-1",
          bulk_transfers: [
            {
              client_transfer_id: "22222222-2222-4222-8222-222222222222",
              beneficiary_id: "ben-1",
              beneficiary: { name: "Alice", iban: "DE91100000000123456789" },
              amount: 100,
              reference: "Pay 1",
            },
          ],
        },
      });

      expect(result.isError).toBe(true);
      const content = result.content as { type: string; text: string }[];
      expect(content[0]?.text).toMatch(/exactly one of beneficiary_id or beneficiary/);
    });

    it("rejects items that specify neither beneficiary_id nor beneficiary", async () => {
      const result = await mcpClient.callTool({
        name: "bulk_transfer_create",
        arguments: {
          bank_account_id: "acct-1",
          bulk_transfers: [
            { client_transfer_id: "33333333-3333-4333-8333-333333333333", amount: 100, reference: "Pay 1" },
          ],
        },
      });

      expect(result.isError).toBe(true);
      const content = result.content as { type: string; text: string }[];
      expect(content[0]?.text).toMatch(/either beneficiary_id or beneficiary/);
    });

    it("surfaces non-MATCH per-entry VoP results as a second content block (LLM caller signal)", async () => {
      fetchSpy.mockImplementation((url: URL) => {
        const path = url.pathname;
        if (path.startsWith("/v2/sepa/beneficiaries/ben-1")) {
          return jsonResponse({
            beneficiary: {
              id: "ben-1",
              name: "Alice Inc",
              iban: "DE91100000000123456789",
              bic: "DEUTDEDDXXX",
              trusted: true,
              status: "validated",
              created_at: "2026-01-01T00:00:00Z",
              updated_at: "2026-01-01T00:00:00Z",
            },
          });
        }
        if (path === "/v2/sepa/bulk_verify_payee") {
          return jsonResponse({
            proof_token: { token: "tok_warn" },
            requests: [
              {
                id: "0",
                response: { match_result: "MATCH_RESULT_NO_MATCH", matched_name: null },
              },
            ],
          });
        }
        if (path === "/v2/sepa/bulk_transfers") {
          return jsonResponse({ bulk_transfer: makeBulkTransfer() });
        }
        throw new Error(`Unexpected URL: ${path}`);
      });

      const result = await mcpClient.callTool({
        name: "bulk_transfer_create",
        arguments: {
          bank_account_id: "acct-1",
          bulk_transfers: [
            {
              client_transfer_id: "44444444-4444-4444-8444-444444444444",
              beneficiary_id: "ben-1",
              amount: 100,
              reference: "Pay 1",
            },
          ],
        },
      });

      const content = result.content as { type: string; text: string }[];
      expect(content).toHaveLength(2);
      expect(content[1]?.text).toMatch(/VoP verification warnings/);
      expect(content[1]?.text).toMatch(/no match.*Alice Inc.*DE91100000000123456789/);
    });

    it("does NOT include warnings block when all entries are MATCH", async () => {
      mockHappyPath();

      const result = await mcpClient.callTool({
        name: "bulk_transfer_create",
        arguments: {
          bank_account_id: "acct-1",
          bulk_transfers: [
            {
              client_transfer_id: "55555555-5555-4555-8555-555555555555",
              beneficiary_id: "ben-1",
              amount: 100,
              reference: "Pay 1",
            },
          ],
        },
      });

      const content = result.content as { type: string; text: string }[];
      expect(content).toHaveLength(1);
      expect(content[0]?.text).not.toMatch(/VoP verification warnings/);
    });

    it("auto-generates client_transfer_id when not provided per item", async () => {
      mockHappyPath();

      await mcpClient.callTool({
        name: "bulk_transfer_create",
        arguments: {
          bank_account_id: "acct-1",
          bulk_transfers: [{ beneficiary_id: "ben-1", amount: 100, reference: "Pay 1" }],
        },
      });

      const createCall = fetchSpy.mock.calls.find(([url]: [URL]) => url.pathname === "/v2/sepa/bulk_transfers") as [
        URL,
        RequestInit,
      ];
      const body = JSON.parse(createCall[1].body as string) as {
        bulk_transfers: { client_transfer_id: string }[];
      };
      expect(body.bulk_transfers[0]?.client_transfer_id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
    });
  });

  describe("bulk_transfer_show", () => {
    it("returns a single bulk transfer", async () => {
      fetchSpy.mockReturnValue(
        jsonResponse({
          bulk_transfer: makeBulkTransfer(),
        }),
      );

      const result = await mcpClient.callTool({
        name: "bulk_transfer_show",
        arguments: { id: "bt-1" },
      });

      const content = result.content as { type: string; text: string }[];
      expect(content).toHaveLength(1);
      const parsed = JSON.parse((content[0] as { type: string; text: string }).text) as { id: string };
      expect(parsed.id).toBe("bt-1");
    });

    it("calls the correct API endpoint", async () => {
      fetchSpy.mockReturnValue(
        jsonResponse({
          bulk_transfer: makeBulkTransfer(),
        }),
      );

      await mcpClient.callTool({
        name: "bulk_transfer_show",
        arguments: { id: "bt-1" },
      });

      const [url] = fetchSpy.mock.calls[0] as [URL];
      expect(url.pathname).toBe("/v2/sepa/bulk_transfers/bt-1");
    });
  });
});
