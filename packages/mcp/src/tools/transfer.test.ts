// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { binaryResponse, jsonResponse } from "@qontoctl/core/testing";
import { connectInMemory } from "../testing/mcp-helpers.js";

function makeMeta(overrides: Record<string, unknown> = {}) {
  return {
    current_page: 1,
    next_page: null,
    prev_page: null,
    total_pages: 1,
    total_count: 0,
    per_page: 100,
    ...overrides,
  };
}

function makeTransfer(overrides: Record<string, unknown> = {}) {
  return {
    id: "txfr-1",
    initiator_id: "user-1",
    bank_account_id: "acc-1",
    beneficiary_id: "ben-1",
    amount: 100.5,
    amount_cents: 10050,
    amount_currency: "EUR",
    status: "settled",
    reference: "Invoice 001",
    note: null,
    scheduled_date: "2026-01-15",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    processed_at: "2026-01-15T10:00:00Z",
    completed_at: "2026-01-15T10:00:00Z",
    transaction_id: "txn-1",
    recurring_transfer_id: null,
    declined_reason: null,
    ...overrides,
  };
}

describe("transfer MCP tools", () => {
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

  describe("transfer_list", () => {
    it("returns transfers from API", async () => {
      fetchSpy.mockReturnValue(
        jsonResponse({
          transfers: [
            makeTransfer(),
            makeTransfer({ id: "txfr-2", amount: 200.0, amount_cents: 20000, status: "pending" }),
          ],
          meta: makeMeta({ total_count: 2 }),
        }),
      );

      const result = await mcpClient.callTool({
        name: "transfer_list",
        arguments: {},
      });

      const content = result.content as { type: string; text: string }[];
      expect(content).toHaveLength(1);
      const first = content[0] as { type: string; text: string };
      const parsed = JSON.parse(first.text) as { transfers: unknown[] };
      expect(parsed.transfers).toHaveLength(2);
    });

    it("passes pagination params to API", async () => {
      fetchSpy.mockReturnValue(
        jsonResponse({
          transfers: [],
          meta: makeMeta({ current_page: 2 }),
        }),
      );

      await mcpClient.callTool({
        name: "transfer_list",
        arguments: { page: 2, per_page: 10 },
      });

      const [url] = fetchSpy.mock.calls[0] as [URL];
      expect(url.searchParams.get("page")).toBe("2");
      expect(url.searchParams.get("per_page")).toBe("10");
    });

    it("passes filter params to API", async () => {
      fetchSpy.mockReturnValue(jsonResponse({ transfers: [], meta: makeMeta() }));

      await mcpClient.callTool({
        name: "transfer_list",
        arguments: {
          status: "settled",
          beneficiary_id: "ben-1",
          updated_at_from: "2025-01-01T00:00:00Z",
          sort_by: "updated_at:desc",
        },
      });

      const [url] = fetchSpy.mock.calls[0] as [URL];
      expect(url.searchParams.get("status[]")).toBe("settled");
      expect(url.searchParams.get("beneficiary_ids[]")).toBe("ben-1");
      expect(url.searchParams.get("updated_at_from")).toBe("2025-01-01T00:00:00Z");
      expect(url.searchParams.get("sort_by")).toBe("updated_at:desc");
    });
  });

  describe("transfer_create", () => {
    const createArgs = {
      beneficiary_id: "ben-1",
      bank_account_id: "acc-1",
      reference: "Invoice 001",
      amount: 100.5,
    };

    const beneficiaryBody = {
      beneficiary: {
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
    };

    function mockForAutoResolve(matchResult: string) {
      fetchSpy.mockImplementation((input: URL, init: RequestInit) => {
        if (input.pathname === "/v2/sepa/beneficiaries/ben-1" && init.method === "GET") {
          return jsonResponse(beneficiaryBody);
        }
        if (input.pathname === "/v2/sepa/verify_payee" && init.method === "POST") {
          return jsonResponse({
            match_result: matchResult,
            matched_name: null,
            proof_token: { token: "auto-token-123" },
          });
        }
        if (input.pathname === "/v2/sepa/transfers" && init.method === "POST") {
          return jsonResponse({ transfer: makeTransfer() });
        }
        return jsonResponse({});
      });
    }

    it("returns error when both beneficiary_id and beneficiary are provided", async () => {
      const result = await mcpClient.callTool({
        name: "transfer_create",
        arguments: {
          beneficiary_id: "ben-1",
          beneficiary: { name: "Jane Doe", iban: "DE89370400440532013000" },
          bank_account_id: "acc-1",
          reference: "Test",
          amount: 100,
        },
      });

      expect(result.isError).toBe(true);
      const content = result.content as { type: string; text: string }[];
      expect((content[0] as { type: string; text: string }).text).toBe(
        "Cannot specify both beneficiary_id and beneficiary",
      );
    });

    it("returns error when neither beneficiary_id nor beneficiary is provided", async () => {
      const result = await mcpClient.callTool({
        name: "transfer_create",
        arguments: {
          bank_account_id: "acc-1",
          reference: "Test",
          amount: 100,
        },
      });

      expect(result.isError).toBe(true);
      const content = result.content as { type: string; text: string }[];
      expect((content[0] as { type: string; text: string }).text).toBe(
        "Either beneficiary_id or beneficiary must be provided",
      );
    });

    it("uses provided vop_proof_token directly without auto-resolve", async () => {
      fetchSpy.mockImplementation((input: URL, init: RequestInit) => {
        if (input.pathname === "/v2/sepa/transfers" && init.method === "POST") {
          return jsonResponse({ transfer: makeTransfer() });
        }
        return jsonResponse({});
      });

      const result = await mcpClient.callTool({
        name: "transfer_create",
        arguments: { ...createArgs, vop_proof_token: "explicit-token" },
      });

      const content = result.content as { type: string; text: string }[];
      expect(content).toHaveLength(1);

      // Should NOT have called beneficiary or verify_payee endpoints
      const calls = fetchSpy.mock.calls as [URL, RequestInit][];
      const benCall = calls.find((c) => c[0].pathname.includes("/beneficiaries/"));
      const vopCall = calls.find((c) => c[0].pathname.includes("/verify_payee"));
      expect(benCall).toBeUndefined();
      expect(vopCall).toBeUndefined();

      // Should have sent the explicit token
      const transferCall = calls.find((c) => c[0].pathname === "/v2/sepa/transfers") as [URL, RequestInit] | undefined;
      expect(transferCall).toBeDefined();
      const body = JSON.parse((transferCall as [URL, RequestInit])[1].body as string) as {
        vop_proof_token: string;
      };
      expect(body.vop_proof_token).toBe("explicit-token");
    });

    it("auto-resolves vop_proof_token via getBeneficiary + verifyPayee on match", async () => {
      mockForAutoResolve("MATCH_RESULT_MATCH");

      const result = await mcpClient.callTool({
        name: "transfer_create",
        arguments: createArgs,
      });

      // Should return only the transfer (no VoP status for match)
      const content = result.content as { type: string; text: string }[];
      expect(content).toHaveLength(1);
      const parsed = JSON.parse((content[0] as { type: string; text: string }).text) as { id: string };
      expect(parsed.id).toBe("txfr-1");

      // Should have called beneficiary, verify_payee, then transfers
      const calls = fetchSpy.mock.calls as [URL, RequestInit][];
      const benCall = calls.find((c) => c[0].pathname === "/v2/sepa/beneficiaries/ben-1");
      const vopCall = calls.find((c) => c[0].pathname === "/v2/sepa/verify_payee");
      const transferCall = calls.find((c) => c[0].pathname === "/v2/sepa/transfers");
      expect(benCall).toBeDefined();
      expect(vopCall).toBeDefined();
      expect(transferCall).toBeDefined();

      // Should have used the auto-resolved token
      const body = JSON.parse((transferCall as [URL, RequestInit])[1].body as string) as {
        vop_proof_token: string;
      };
      expect(body.vop_proof_token).toBe("auto-token-123");
    });

    it("creates transfer with inline beneficiary and auto-resolved VoP token", async () => {
      fetchSpy.mockImplementation((input: URL, init: RequestInit) => {
        if (input.pathname === "/v2/sepa/verify_payee" && init.method === "POST") {
          return jsonResponse({
            match_result: "MATCH_RESULT_MATCH",
            matched_name: null,
            proof_token: { token: "inline-auto-token" },
          });
        }
        if (input.pathname === "/v2/sepa/transfers" && init.method === "POST") {
          return jsonResponse({ transfer: makeTransfer() });
        }
        return jsonResponse({});
      });

      const result = await mcpClient.callTool({
        name: "transfer_create",
        arguments: {
          beneficiary: {
            name: "Jane Doe",
            iban: "DE89370400440532013000",
            bic: "COBADEFFXXX",
          },
          bank_account_id: "acc-1",
          reference: "Inline Payment",
          amount: 250,
        },
      });

      const content = result.content as { type: string; text: string }[];
      expect(content).toHaveLength(1);
      const parsed = JSON.parse((content[0] as { type: string; text: string }).text) as { id: string };
      expect(parsed.id).toBe("txfr-1");

      // Should NOT have called beneficiary endpoint
      const calls = fetchSpy.mock.calls as [URL, RequestInit][];
      const benCall = calls.find((c) => c[0].pathname.includes("/beneficiaries/"));
      expect(benCall).toBeUndefined();

      // Should have called verify_payee with inline beneficiary data
      const vopCall = calls.find((c) => c[0].pathname === "/v2/sepa/verify_payee");
      expect(vopCall).toBeDefined();
      const vopBody = JSON.parse((vopCall as [URL, RequestInit])[1].body as string) as {
        iban: string;
        beneficiary_name: string;
      };
      expect(vopBody.iban).toBe("DE89370400440532013000");
      expect(vopBody.beneficiary_name).toBe("Jane Doe");

      // Should have sent inline beneficiary in transfer body
      const transferCall = calls.find((c) => c[0].pathname === "/v2/sepa/transfers" && c[1].method === "POST") as
        | [URL, RequestInit]
        | undefined;
      expect(transferCall).toBeDefined();
      const transferBody = JSON.parse((transferCall as [URL, RequestInit])[1].body as string) as {
        vop_proof_token: string;
        transfer: { beneficiary: { name: string; iban: string; bic: string } };
      };
      expect(transferBody.vop_proof_token).toBe("inline-auto-token");
      expect(transferBody.transfer.beneficiary).toEqual({
        name: "Jane Doe",
        iban: "DE89370400440532013000",
        bic: "COBADEFFXXX",
      });
    });

    it("passes attachment_ids in transfer body", async () => {
      fetchSpy.mockImplementation((input: URL, init: RequestInit) => {
        if (input.pathname === "/v2/sepa/transfers" && init.method === "POST") {
          return jsonResponse({ transfer: makeTransfer() });
        }
        return jsonResponse({});
      });

      await mcpClient.callTool({
        name: "transfer_create",
        arguments: {
          ...createArgs,
          vop_proof_token: "explicit-token",
          attachment_ids: ["att-1", "att-2"],
        },
      });

      const calls = fetchSpy.mock.calls as [URL, RequestInit][];
      const transferCall = calls.find((c) => c[0].pathname === "/v2/sepa/transfers" && c[1].method === "POST") as
        | [URL, RequestInit]
        | undefined;
      expect(transferCall).toBeDefined();
      const body = JSON.parse((transferCall as [URL, RequestInit])[1].body as string) as {
        transfer: { attachment_ids: string[] };
      };
      expect(body.transfer.attachment_ids).toEqual(["att-1", "att-2"]);
    });

    it("includes VoP status in response on no_match", async () => {
      mockForAutoResolve("MATCH_RESULT_NO_MATCH");

      const result = await mcpClient.callTool({
        name: "transfer_create",
        arguments: createArgs,
      });

      const content = result.content as { type: string; text: string }[];
      expect(content).toHaveLength(2);
      expect((content[1] as { type: string; text: string }).text).toBe(
        "VoP verification result: MATCH_RESULT_NO_MATCH",
      );
    });

    it("includes VoP status in response on not_possible", async () => {
      mockForAutoResolve("MATCH_RESULT_NOT_POSSIBLE");

      const result = await mcpClient.callTool({
        name: "transfer_create",
        arguments: createArgs,
      });

      const content = result.content as { type: string; text: string }[];
      expect(content).toHaveLength(2);
      expect((content[1] as { type: string; text: string }).text).toBe(
        "VoP verification result: MATCH_RESULT_NOT_POSSIBLE",
      );
    });
  });

  describe("transfer_verify_payee", () => {
    it("returns VoP result in new format", async () => {
      fetchSpy.mockReturnValue(
        jsonResponse({
          match_result: "MATCH_RESULT_MATCH",
          matched_name: "Acme Corp",
          proof_token: { token: "vop-token-123" },
        }),
      );

      const result = await mcpClient.callTool({
        name: "transfer_verify_payee",
        arguments: { iban: "FR7630001007941234567890185", name: "Acme Corp" },
      });

      const content = result.content as { type: string; text: string }[];
      expect(content).toHaveLength(1);
      const parsed = JSON.parse((content[0] as { type: string; text: string }).text) as {
        match_result: string;
        matched_name: string;
        proof_token: { token: string };
      };
      expect(parsed.match_result).toBe("MATCH_RESULT_MATCH");
      expect(parsed.matched_name).toBe("Acme Corp");
      expect(parsed.proof_token).toEqual({ token: "vop-token-123" });
    });

    it("sends beneficiary_name to API", async () => {
      fetchSpy.mockReturnValue(
        jsonResponse({
          match_result: "MATCH_RESULT_MATCH",
          matched_name: "Acme Corp",
          proof_token: { token: "vop-token-123" },
        }),
      );

      await mcpClient.callTool({
        name: "transfer_verify_payee",
        arguments: { iban: "FR7630001007941234567890185", name: "Acme Corp" },
      });

      const calls = fetchSpy.mock.calls as [URL, RequestInit][];
      const vopCall = calls.find((c) => c[0].pathname === "/v2/sepa/verify_payee");
      expect(vopCall).toBeDefined();
      const body = JSON.parse((vopCall as [URL, RequestInit])[1].body as string) as {
        iban: string;
        beneficiary_name: string;
      };
      expect(body.iban).toBe("FR7630001007941234567890185");
      expect(body.beneficiary_name).toBe("Acme Corp");
    });
  });

  describe("transfer_bulk_verify_payee", () => {
    it("returns per-entry results and shared proof token", async () => {
      fetchSpy.mockReturnValue(
        jsonResponse({
          responses: [
            {
              id: "0",
              beneficiary_name: "Acme Corp",
              iban: "FR7630001007941234567890185",
              response: { match_result: "MATCH_RESULT_MATCH", matched_name: "Acme Corp" },
            },
            {
              id: "1",
              beneficiary_name: "Jane Doe",
              iban: "DE89370400440532013000",
              response: { match_result: "MATCH_RESULT_NO_MATCH", matched_name: null },
            },
          ],
          proof_token: { token: "bulk-token-456" },
        }),
      );

      const result = await mcpClient.callTool({
        name: "transfer_bulk_verify_payee",
        arguments: {
          entries: [
            { iban: "FR7630001007941234567890185", name: "Acme Corp" },
            { iban: "DE89370400440532013000", name: "Jane Doe" },
          ],
        },
      });

      const content = result.content as { type: string; text: string }[];
      expect(content).toHaveLength(1);
      const parsed = JSON.parse((content[0] as { type: string; text: string }).text) as {
        responses: { id: string; response: { match_result: string; matched_name: string | null } }[];
        proof_token: { token: string };
      };
      expect(parsed.responses).toHaveLength(2);
      expect(parsed.responses[0]?.response.match_result).toBe("MATCH_RESULT_MATCH");
      expect(parsed.responses[1]?.response.match_result).toBe("MATCH_RESULT_NO_MATCH");
      expect(parsed.proof_token).toEqual({ token: "bulk-token-456" });
    });

    it("maps input entries to use beneficiary_name", async () => {
      fetchSpy.mockReturnValue(
        jsonResponse({
          responses: [
            {
              id: "0",
              beneficiary_name: "Acme Corp",
              iban: "FR7630001007941234567890185",
              response: { match_result: "MATCH_RESULT_MATCH", matched_name: "Acme Corp" },
            },
          ],
          proof_token: { token: "bulk-token-789" },
        }),
      );

      await mcpClient.callTool({
        name: "transfer_bulk_verify_payee",
        arguments: {
          entries: [{ iban: "FR7630001007941234567890185", name: "Acme Corp" }],
        },
      });

      const calls = fetchSpy.mock.calls as [URL, RequestInit][];
      const bulkCall = calls.find((c) => c[0].pathname === "/v2/sepa/bulk_verify_payee");
      expect(bulkCall).toBeDefined();
      const body = JSON.parse((bulkCall as [URL, RequestInit])[1].body as string) as {
        requests: { id: string; iban: string; beneficiary_name: string }[];
      };
      expect(body.requests[0]?.beneficiary_name).toBe("Acme Corp");
    });
  });

  describe("transfer_cancel", () => {
    it("returns canceled confirmation", async () => {
      fetchSpy.mockReturnValue(jsonResponse({}));

      const result = await mcpClient.callTool({
        name: "transfer_cancel",
        arguments: { id: "txfr-cancel-1" },
      });

      const content = result.content as { type: string; text: string }[];
      expect(content).toHaveLength(1);
      const parsed = JSON.parse((content[0] as { type: string; text: string }).text) as {
        canceled: boolean;
        id: string;
      };
      expect(parsed.canceled).toBe(true);
      expect(parsed.id).toBe("txfr-cancel-1");
    });

    it("calls the correct API endpoint with POST", async () => {
      fetchSpy.mockReturnValue(jsonResponse({}));

      await mcpClient.callTool({
        name: "transfer_cancel",
        arguments: { id: "txfr-cancel-1" },
      });

      const [url, init] = fetchSpy.mock.calls[0] as [URL, RequestInit];
      expect(url.pathname).toBe("/v2/sepa/transfers/txfr-cancel-1/cancel");
      expect(init.method).toBe("POST");
    });
  });

  describe("transfer_proof", () => {
    it("returns PDF as base64-encoded embedded resource", async () => {
      const pdfData = Buffer.from("%PDF-1.4 test proof");
      fetchSpy.mockReturnValue(binaryResponse(pdfData));

      const result = await mcpClient.callTool({
        name: "transfer_proof",
        arguments: { id: "txfr-proof-1" },
      });

      const content = result.content as { type: string; resource: { uri: string; mimeType: string; blob: string } }[];
      expect(content).toHaveLength(1);
      expect((content[0] as { type: string }).type).toBe("resource");
      const resource = (content[0] as { resource: { uri: string; mimeType: string; blob: string } }).resource;
      expect(resource.uri).toBe("transfer-proof://txfr-proof-1");
      expect(resource.mimeType).toBe("application/pdf");
      expect(Buffer.from(resource.blob, "base64").toString()).toBe("%PDF-1.4 test proof");
    });

    it("calls the correct API endpoint", async () => {
      fetchSpy.mockReturnValue(binaryResponse(Buffer.from("data")));

      await mcpClient.callTool({
        name: "transfer_proof",
        arguments: { id: "txfr-proof-1" },
      });

      const [url] = fetchSpy.mock.calls[0] as [URL];
      expect(url.pathname).toBe("/v2/sepa/transfers/txfr-proof-1/proof");
    });
  });

  describe("transfer_show", () => {
    it("returns a single transfer", async () => {
      fetchSpy.mockReturnValue(jsonResponse({ transfer: makeTransfer({ id: "txfr-123" }) }));

      const result = await mcpClient.callTool({
        name: "transfer_show",
        arguments: { id: "txfr-123" },
      });

      const content = result.content as { type: string; text: string }[];
      expect(content).toHaveLength(1);
      const first = content[0] as { type: string; text: string };
      const parsed = JSON.parse(first.text) as { id: string };
      expect(parsed.id).toBe("txfr-123");
    });

    it("calls the correct API endpoint", async () => {
      fetchSpy.mockReturnValue(
        jsonResponse({
          transfer: makeTransfer({ id: "txfr-123" }),
        }),
      );

      await mcpClient.callTool({
        name: "transfer_show",
        arguments: { id: "txfr-123" },
      });

      const [url] = fetchSpy.mock.calls[0] as [URL];
      expect(url.pathname).toBe("/v2/sepa/transfers/txfr-123");
    });
  });
});
