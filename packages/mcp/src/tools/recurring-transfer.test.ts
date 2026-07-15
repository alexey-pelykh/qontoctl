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

function makeRecurringTransfer(overrides: Record<string, unknown> = {}) {
  return {
    id: "rt-1",
    initiator_id: "user-1",
    bank_account_id: "acc-1",
    amount: 100,
    amount_cents: 10000,
    amount_currency: "EUR",
    beneficiary_id: "ben-1",
    reference: "Monthly rent",
    note: "",
    first_execution_date: "2026-01-01",
    last_execution_date: null,
    next_execution_date: "2026-02-01",
    frequency: "monthly",
    status: "active",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("recurring-transfer MCP tools", () => {
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

  describe("recurring_transfer_list", () => {
    it("returns recurring transfers from API", async () => {
      fetchSpy.mockReturnValue(
        jsonResponse({
          recurring_transfers: [makeRecurringTransfer()],
          meta: makeMeta(),
        }),
      );

      const result = await mcpClient.callTool({
        name: "recurring_transfer_list",
        arguments: {},
      });

      const content = result.content as { type: string; text: string }[];
      expect(content).toHaveLength(1);
      const parsed = JSON.parse((content[0] as { type: string; text: string }).text) as {
        recurring_transfers: { id: string }[];
      };
      expect(parsed.recurring_transfers).toHaveLength(1);
      expect(parsed.recurring_transfers[0]?.id).toBe("rt-1");
    });

    it("calls the correct API endpoint", async () => {
      fetchSpy.mockReturnValue(
        jsonResponse({
          recurring_transfers: [],
          meta: makeMeta({ total_count: 0 }),
        }),
      );

      await mcpClient.callTool({
        name: "recurring_transfer_list",
        arguments: {},
      });

      const [url] = fetchSpy.mock.calls[0] as [URL];
      expect(url.pathname).toBe("/v2/sepa/recurring_transfers");
    });

    it("passes pagination parameters", async () => {
      fetchSpy.mockReturnValue(
        jsonResponse({
          recurring_transfers: [],
          meta: makeMeta({ current_page: 2, total_pages: 3, total_count: 10 }),
        }),
      );

      await mcpClient.callTool({
        name: "recurring_transfer_list",
        arguments: { page: 2, per_page: 5 },
      });

      const [url] = fetchSpy.mock.calls[0] as [URL];
      expect(url.searchParams.get("page")).toBe("2");
      expect(url.searchParams.get("per_page")).toBe("5");
    });
  });

  describe("recurring_transfer_create", () => {
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
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-01-01T00:00:00.000Z",
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
        if (input.pathname === "/v2/sepa/recurring_transfers" && init.method === "POST") {
          return jsonResponse({ recurring_transfer: makeRecurringTransfer() });
        }
        return jsonResponse({});
      });
    }

    it("creates a recurring transfer and serializes amount as a string", async () => {
      mockForAutoResolve("MATCH_RESULT_MATCH");

      const result = await mcpClient.callTool({
        name: "recurring_transfer_create",
        arguments: {
          beneficiary_id: "ben-1",
          bank_account_id: "acc-1",
          amount: 100,
          currency: "EUR",
          reference: "Monthly rent",
          first_execution_date: "2026-01-01",
          frequency: "monthly",
        },
      });

      const content = result.content as { type: string; text: string }[];
      expect(content).toHaveLength(1);
      const parsed = JSON.parse((content[0] as { type: string; text: string }).text) as { id: string };
      expect(parsed.id).toBe("rt-1");

      const calls = fetchSpy.mock.calls as [URL, RequestInit][];
      const createCall = calls.find(
        (c) => c[0].pathname === "/v2/sepa/recurring_transfers" && c[1].method === "POST",
      ) as [URL, RequestInit] | undefined;
      expect(createCall).toBeDefined();
      const body = JSON.parse((createCall as [URL, RequestInit])[1].body as string) as {
        recurring_transfer: { amount: unknown };
      };
      expect(typeof body.recurring_transfer.amount).toBe("string");
      expect(body.recurring_transfer.amount).toBe("100.00");
    });

    it("accepts amount as a decimal string and passes it through unchanged", async () => {
      mockForAutoResolve("MATCH_RESULT_MATCH");

      await mcpClient.callTool({
        name: "recurring_transfer_create",
        arguments: {
          beneficiary_id: "ben-1",
          bank_account_id: "acc-1",
          amount: "42.50",
          currency: "EUR",
          reference: "Monthly rent",
          first_execution_date: "2026-01-01",
          frequency: "monthly",
        },
      });

      const calls = fetchSpy.mock.calls as [URL, RequestInit][];
      const createCall = calls.find(
        (c) => c[0].pathname === "/v2/sepa/recurring_transfers" && c[1].method === "POST",
      ) as [URL, RequestInit] | undefined;
      expect(createCall).toBeDefined();
      const body = JSON.parse((createCall as [URL, RequestInit])[1].body as string) as {
        recurring_transfer: { amount: unknown };
      };
      expect(body.recurring_transfer.amount).toBe("42.50");
    });

    it("uses provided vop_proof_token directly without auto-resolve", async () => {
      fetchSpy.mockImplementation((input: URL, init: RequestInit) => {
        if (input.pathname === "/v2/sepa/recurring_transfers" && init.method === "POST") {
          return jsonResponse({ recurring_transfer: makeRecurringTransfer() });
        }
        return jsonResponse({});
      });

      const result = await mcpClient.callTool({
        name: "recurring_transfer_create",
        arguments: {
          beneficiary_id: "ben-1",
          bank_account_id: "acc-1",
          amount: 100,
          currency: "EUR",
          reference: "Monthly rent",
          first_execution_date: "2026-01-01",
          frequency: "monthly",
          vop_proof_token: "explicit-token",
        },
      });

      const content = result.content as { type: string; text: string }[];
      expect(content).toHaveLength(1);

      // Should NOT have called beneficiary or verify_payee endpoints.
      const calls = fetchSpy.mock.calls as [URL, RequestInit][];
      const benCall = calls.find((c) => c[0].pathname.includes("/beneficiaries/"));
      const vopCall = calls.find((c) => c[0].pathname.includes("/verify_payee"));
      expect(benCall).toBeUndefined();
      expect(vopCall).toBeUndefined();

      // Should have sent the explicit token at the top level (sibling to envelope).
      const createCall = calls.find(
        (c) => c[0].pathname === "/v2/sepa/recurring_transfers" && c[1].method === "POST",
      ) as [URL, RequestInit] | undefined;
      expect(createCall).toBeDefined();
      const body = JSON.parse((createCall as [URL, RequestInit])[1].body as string) as {
        vop_proof_token: string;
        recurring_transfer: Record<string, unknown>;
      };
      expect(body.vop_proof_token).toBe("explicit-token");
      expect(body.recurring_transfer).not.toHaveProperty("vop_proof_token");
    });

    it("auto-resolves vop_proof_token via getBeneficiary + verifyPayee on match", async () => {
      mockForAutoResolve("MATCH_RESULT_MATCH");

      const result = await mcpClient.callTool({
        name: "recurring_transfer_create",
        arguments: {
          beneficiary_id: "ben-1",
          bank_account_id: "acc-1",
          amount: 100,
          currency: "EUR",
          reference: "Monthly rent",
          first_execution_date: "2026-01-01",
          frequency: "monthly",
        },
      });

      // Should return only the recurring transfer (no VoP status block on match).
      const content = result.content as { type: string; text: string }[];
      expect(content).toHaveLength(1);
      const parsed = JSON.parse((content[0] as { type: string; text: string }).text) as { id: string };
      expect(parsed.id).toBe("rt-1");

      // Should have called beneficiary, verify_payee, then recurring_transfers.
      const calls = fetchSpy.mock.calls as [URL, RequestInit][];
      const benCall = calls.find((c) => c[0].pathname === "/v2/sepa/beneficiaries/ben-1");
      const vopCall = calls.find((c) => c[0].pathname === "/v2/sepa/verify_payee");
      const createCall = calls.find((c) => c[0].pathname === "/v2/sepa/recurring_transfers");
      expect(benCall).toBeDefined();
      expect(vopCall).toBeDefined();
      expect(createCall).toBeDefined();

      // Should have used the auto-resolved token.
      const body = JSON.parse((createCall as [URL, RequestInit])[1].body as string) as {
        vop_proof_token: string;
      };
      expect(body.vop_proof_token).toBe("auto-token-123");
    });

    it("includes VoP status in response on no_match", async () => {
      mockForAutoResolve("MATCH_RESULT_NO_MATCH");

      const result = await mcpClient.callTool({
        name: "recurring_transfer_create",
        arguments: {
          beneficiary_id: "ben-1",
          bank_account_id: "acc-1",
          amount: 100,
          currency: "EUR",
          reference: "Monthly rent",
          first_execution_date: "2026-01-01",
          frequency: "monthly",
        },
      });

      const content = result.content as { type: string; text: string }[];
      expect(content).toHaveLength(2);
      expect((content[1] as { type: string; text: string }).text).toBe(
        "VoP verification result: MATCH_RESULT_NO_MATCH",
      );
    });

    it("includes VoP status in response on close_match", async () => {
      mockForAutoResolve("MATCH_RESULT_CLOSE_MATCH");

      const result = await mcpClient.callTool({
        name: "recurring_transfer_create",
        arguments: {
          beneficiary_id: "ben-1",
          bank_account_id: "acc-1",
          amount: 100,
          currency: "EUR",
          reference: "Monthly rent",
          first_execution_date: "2026-01-01",
          frequency: "monthly",
        },
      });

      const content = result.content as { type: string; text: string }[];
      expect(content).toHaveLength(2);
      expect((content[1] as { type: string; text: string }).text).toBe(
        "VoP verification result: MATCH_RESULT_CLOSE_MATCH",
      );
    });

    it("rejects sca_session_token retry without an explicit vop_proof_token", async () => {
      const result = await mcpClient.callTool({
        name: "recurring_transfer_create",
        arguments: {
          beneficiary_id: "ben-1",
          bank_account_id: "acc-1",
          amount: 100,
          currency: "EUR",
          reference: "Monthly rent",
          first_execution_date: "2026-01-01",
          frequency: "monthly",
          sca_session_token: "sca-tok",
        },
      });

      expect(result.isError).toBe(true);
      const content = result.content as { type: string; text: string }[];
      expect((content[0] as { type: string; text: string }).text).toMatch(
        /vop_proof_token is required when retrying with sca_session_token/,
      );

      // Auto-resolution must NOT have been attempted on retry path.
      const calls = fetchSpy.mock.calls as [URL, RequestInit][];
      expect(calls.find((c) => c[0].pathname.includes("/beneficiaries/"))).toBeUndefined();
      expect(calls.find((c) => c[0].pathname.includes("/verify_payee"))).toBeUndefined();
    });
  });

  describe("recurring_transfer_cancel", () => {
    it("cancels a recurring transfer", async () => {
      fetchSpy.mockReturnValue(jsonResponse({}));

      const result = await mcpClient.callTool({
        name: "recurring_transfer_cancel",
        arguments: { id: "rt-1" },
      });

      const content = result.content as { type: string; text: string }[];
      expect(content).toHaveLength(1);
      expect((content[0] as { type: string; text: string }).text).toContain("rt-1");
    });

    describe("SCA continuation", () => {
      const SCA_TOKEN = "sca-tok-mcp-recurring-transfer-cancel";

      it("returns structured pending response on 428 with wait=0 (pure two-step)", async () => {
        let postCount = 0;
        let scaPollCount = 0;
        fetchSpy.mockImplementation((input: URL, init: RequestInit) => {
          if (input.pathname === "/v2/sepa/recurring_transfers/rt-1/cancel" && init.method === "POST") {
            postCount++;
            return new Response(JSON.stringify({ sca_session_token: SCA_TOKEN }), {
              status: 428,
              headers: { "content-type": "application/json" },
            });
          }
          if (input.pathname.startsWith("/v2/sca_sessions/")) {
            scaPollCount++;
          }
          return jsonResponse({});
        });

        const result = await mcpClient.callTool({
          name: "recurring_transfer_cancel",
          arguments: { id: "rt-1", wait: 0 },
        });

        expect(result.isError).toBe(false);
        const text = (result.content as { type: string; text: string }[])[0]?.text ?? "";
        expect(text).toContain("SCA required");
        expect(text).toContain(SCA_TOKEN);
        expect(text).toContain("sca_session_show");
        expect(text).toContain("sca_session_token");
        // The dead-end formatter is NOT used.
        expect(text).not.toContain("Poll GET");
        expect(text).not.toContain("/v2/sca_sessions/");
        // Pure two-step: cancel POST hit once, no SCA polling, no retry.
        expect(postCount).toBe(1);
        expect(scaPollCount).toBe(0);
      });

      it("retries the operation with the supplied sca_session_token (no polling)", async () => {
        let postCount = 0;
        let scaPollCount = 0;
        const observedScaTokens: (string | null)[] = [];

        fetchSpy.mockImplementation((input: URL, init: RequestInit) => {
          if (input.pathname === "/v2/sepa/recurring_transfers/rt-1/cancel" && init.method === "POST") {
            const headers = init.headers as Record<string, string> | undefined;
            observedScaTokens.push(headers?.["X-Qonto-Sca-Session-Token"] ?? null);
            postCount++;
            return new Response(null, { status: 204 });
          }
          if (input.pathname.startsWith("/v2/sca_sessions/")) {
            scaPollCount++;
          }
          return jsonResponse({});
        });

        const result = await mcpClient.callTool({
          name: "recurring_transfer_cancel",
          arguments: { id: "rt-1", sca_session_token: SCA_TOKEN },
        });

        expect(postCount).toBe(1);
        // Caller supplied the SCA token directly: no polling round-trip.
        expect(scaPollCount).toBe(0);
        expect(observedScaTokens[0]).toBe(SCA_TOKEN);

        const text = (result.content as { type: string; text: string }[])[0]?.text ?? "";
        const parsed = JSON.parse(text) as { canceled: boolean; id: string };
        expect(parsed.canceled).toBe(true);
        expect(parsed.id).toBe("rt-1");
      });

      it("preserves a stable idempotency key across the initial 428 + post-poll retry", async () => {
        let postCount = 0;
        const observedIdempotencyKeys: (string | null)[] = [];

        fetchSpy.mockImplementation((input: URL, init: RequestInit) => {
          const headers = init.headers as Record<string, string> | undefined;

          if (input.pathname === "/v2/sepa/recurring_transfers/rt-1/cancel" && init.method === "POST") {
            postCount++;
            observedIdempotencyKeys.push(headers?.["X-Qonto-Idempotency-Key"] ?? null);
            if (postCount === 1) {
              // First attempt: 428 SCA required. Real Qonto API returns top-level fields,
              // not an `errors[]` array — see docs/security/sca-token-binding.md.
              return new Response(
                JSON.stringify({
                  action_type: "transfer.recurring.cancel",
                  code: "sca_required",
                  message: "SCA required",
                  sca_session_token: SCA_TOKEN,
                }),
                {
                  status: 428,
                  headers: { "content-type": "application/json", "X-Qonto-Sca-Session-Token": SCA_TOKEN },
                },
              );
            }
            return new Response(null, { status: 204 });
          }
          if (input.pathname.startsWith("/v2/sca_sessions/")) {
            return jsonResponse({ result: "allow" });
          }
          return jsonResponse({});
        });

        const result = await mcpClient.callTool({
          name: "recurring_transfer_cancel",
          arguments: { id: "rt-1", wait: 5 },
        });

        expect(postCount).toBe(2);
        expect(observedIdempotencyKeys[0]).toBeTruthy();
        expect(observedIdempotencyKeys[0]).toBe(observedIdempotencyKeys[1]);

        const text = (result.content as { type: string; text: string }[])[0]?.text ?? "";
        const parsed = JSON.parse(text) as { canceled: boolean; id: string };
        expect(parsed.canceled).toBe(true);
        expect(parsed.id).toBe("rt-1");
      });

      it("accepts wait=false in the input schema (pure two-step)", async () => {
        fetchSpy.mockImplementation((input: URL, init: RequestInit) => {
          if (input.pathname === "/v2/sepa/recurring_transfers/rt-1/cancel" && init.method === "POST") {
            return new Response(JSON.stringify({ sca_session_token: SCA_TOKEN }), {
              status: 428,
              headers: { "content-type": "application/json" },
            });
          }
          return jsonResponse({});
        });

        const result = await mcpClient.callTool({
          name: "recurring_transfer_cancel",
          arguments: { id: "rt-1", wait: false },
        });

        expect(result.isError).toBe(false);
        const text = (result.content as { type: string; text: string }[])[0]?.text ?? "";
        expect(text).toContain(SCA_TOKEN);
      });
    });
  });

  describe("recurring_transfer_show", () => {
    it("returns a single recurring transfer", async () => {
      fetchSpy.mockReturnValue(
        jsonResponse({
          recurring_transfer: makeRecurringTransfer(),
        }),
      );

      const result = await mcpClient.callTool({
        name: "recurring_transfer_show",
        arguments: { id: "rt-1" },
      });

      const content = result.content as { type: string; text: string }[];
      expect(content).toHaveLength(1);
      const parsed = JSON.parse((content[0] as { type: string; text: string }).text) as { id: string };
      expect(parsed.id).toBe("rt-1");
    });

    it("calls the correct API endpoint", async () => {
      fetchSpy.mockReturnValue(
        jsonResponse({
          recurring_transfer: makeRecurringTransfer(),
        }),
      );

      await mcpClient.callTool({
        name: "recurring_transfer_show",
        arguments: { id: "rt-1" },
      });

      const [url] = fetchSpy.mock.calls[0] as [URL];
      expect(url.pathname).toBe("/v2/sepa/recurring_transfers/rt-1");
    });
  });
});
