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

    function mockForAutoResolve(vopResult: string) {
      fetchSpy.mockImplementation((input: URL, init: RequestInit) => {
        if (input.pathname === "/v2/sepa/beneficiaries/ben-1" && init.method === "GET") {
          return jsonResponse(beneficiaryBody);
        }
        if (input.pathname === "/v2/sepa/verify_payee" && init.method === "POST") {
          return jsonResponse({
            verification: {
              iban: "FR7630001007941234567890185",
              name: "Acme Corp",
              result: vopResult,
              vop_proof_token: "auto-token-123",
            },
          });
        }
        if (input.pathname === "/v2/sepa/transfers" && init.method === "POST") {
          return jsonResponse({ transfer: makeTransfer() });
        }
        return jsonResponse({});
      });
    }

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
      mockForAutoResolve("match");

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
            verification: {
              iban: "DE89370400440532013000",
              name: "Jane Doe",
              result: "match",
              vop_proof_token: "inline-auto-token",
            },
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
        name: string;
      };
      expect(vopBody.iban).toBe("DE89370400440532013000");
      expect(vopBody.name).toBe("Jane Doe");

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

    it("includes VoP status in response on mismatch", async () => {
      mockForAutoResolve("mismatch");

      const result = await mcpClient.callTool({
        name: "transfer_create",
        arguments: createArgs,
      });

      const content = result.content as { type: string; text: string }[];
      expect(content).toHaveLength(2);
      expect((content[1] as { type: string; text: string }).text).toBe("VoP verification result: mismatch");
    });

    it("includes VoP status in response on not_available", async () => {
      mockForAutoResolve("not_available");

      const result = await mcpClient.callTool({
        name: "transfer_create",
        arguments: createArgs,
      });

      const content = result.content as { type: string; text: string }[];
      expect(content).toHaveLength(2);
      expect((content[1] as { type: string; text: string }).text).toBe("VoP verification result: not_available");
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
