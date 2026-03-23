// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { jsonResponse } from "@qontoctl/core/testing";
import { createInternalTransferCommand } from "./internal-transfer.js";

vi.mock("../client.js", () => ({
  createClient: vi.fn(),
}));

import { createClient } from "../client.js";
import { HttpClient } from "@qontoctl/core";

const sampleInternalTransfer = {
  id: "it-123",
  debit_iban: "FR7630001007941234567890185",
  credit_iban: "FR7630001007949876543210142",
  debit_bank_account_id: "ba-1",
  credit_bank_account_id: "ba-2",
  reference: "Monthly allocation",
  amount: 1000.0,
  amount_cents: 100000,
  currency: "EUR",
  status: "processing",
  created_at: "2026-03-01T10:00:00Z",
};

describe("internal-transfer commands", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;
  let client: HttpClient;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let stdoutSpy: any;

  beforeEach(() => {
    fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    client = new HttpClient({
      baseUrl: "https://thirdparty.qonto.com",
      authorization: "slug:secret",
    });
    vi.mocked(createClient).mockResolvedValue(client);
    stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation((() => true) as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("internal-transfer create", () => {
    it("creates an internal transfer in table format", async () => {
      fetchSpy.mockReturnValue(jsonResponse({ internal_transfer: sampleInternalTransfer }));

      const { createProgram } = await import("../program.js");
      const program = createProgram();
      program.addCommand(createInternalTransferCommand());
      program.exitOverride();

      await program.parseAsync(
        [
          "internal-transfer",
          "create",
          "--debit-iban",
          "FR7630001007941234567890185",
          "--credit-iban",
          "FR7630001007949876543210142",
          "--reference",
          "Monthly allocation",
          "--amount",
          "1000",
        ],
        { from: "user" },
      );

      expect(stdoutSpy).toHaveBeenCalled();
      const output = stdoutSpy.mock.calls[0]?.[0] as string;
      expect(output).toContain("it-123");
      expect(output).toContain("Monthly allocation");
    });

    it("creates an internal transfer in json format", async () => {
      fetchSpy.mockReturnValue(jsonResponse({ internal_transfer: sampleInternalTransfer }));

      const { createProgram } = await import("../program.js");
      const program = createProgram();
      program.addCommand(createInternalTransferCommand());
      program.exitOverride();

      await program.parseAsync(
        [
          "--output",
          "json",
          "internal-transfer",
          "create",
          "--debit-iban",
          "FR7630001007941234567890185",
          "--credit-iban",
          "FR7630001007949876543210142",
          "--reference",
          "Monthly allocation",
          "--amount",
          "1000",
        ],
        { from: "user" },
      );

      expect(stdoutSpy).toHaveBeenCalled();
      const output = stdoutSpy.mock.calls[0]?.[0] as string;
      const parsed = JSON.parse(output) as Record<string, unknown>;
      expect(parsed).toHaveProperty("id", "it-123");
      expect(parsed).toHaveProperty("debit_iban", "FR7630001007941234567890185");
      expect(parsed).toHaveProperty("credit_iban", "FR7630001007949876543210142");
      expect(parsed).toHaveProperty("reference", "Monthly allocation");
      expect(parsed).toHaveProperty("amount", 1000.0);
      expect(parsed).toHaveProperty("currency", "EUR");
    });

    it("sends POST to the correct API endpoint with body", async () => {
      fetchSpy.mockReturnValue(jsonResponse({ internal_transfer: sampleInternalTransfer }));

      const { createProgram } = await import("../program.js");
      const program = createProgram();
      program.addCommand(createInternalTransferCommand());
      program.exitOverride();

      await program.parseAsync(
        [
          "internal-transfer",
          "create",
          "--debit-iban",
          "FR7630001007941234567890185",
          "--credit-iban",
          "FR7630001007949876543210142",
          "--reference",
          "Monthly allocation",
          "--amount",
          "1000",
        ],
        { from: "user" },
      );

      const [url, opts] = fetchSpy.mock.calls[0] as [URL, RequestInit];
      expect(url.pathname).toBe("/v2/internal_transfers");
      expect(opts.method).toBe("POST");
      const body = JSON.parse(opts.body as string) as Record<string, unknown>;
      expect(body).toEqual({
        internal_transfer: {
          debit_iban: "FR7630001007941234567890185",
          credit_iban: "FR7630001007949876543210142",
          reference: "Monthly allocation",
          amount: "1000",
          currency: "EUR",
        },
      });
    });

    it("passes idempotency key when provided", async () => {
      fetchSpy.mockReturnValue(jsonResponse({ internal_transfer: sampleInternalTransfer }));

      const { createProgram } = await import("../program.js");
      const program = createProgram();
      program.addCommand(createInternalTransferCommand());
      program.exitOverride();

      await program.parseAsync(
        [
          "internal-transfer",
          "create",
          "--debit-iban",
          "FR7630001007941234567890185",
          "--credit-iban",
          "FR7630001007949876543210142",
          "--reference",
          "Monthly allocation",
          "--amount",
          "1000",
          "--idempotency-key",
          "key-abc-123",
        ],
        { from: "user" },
      );

      const [, opts] = fetchSpy.mock.calls[0] as [URL, RequestInit];
      const headers = opts.headers as Record<string, string>;
      expect(headers["X-Qonto-Idempotency-Key"]).toBe("key-abc-123");
    });

    it("defaults currency to EUR", async () => {
      fetchSpy.mockReturnValue(jsonResponse({ internal_transfer: sampleInternalTransfer }));

      const { createProgram } = await import("../program.js");
      const program = createProgram();
      program.addCommand(createInternalTransferCommand());
      program.exitOverride();

      await program.parseAsync(
        [
          "internal-transfer",
          "create",
          "--debit-iban",
          "FR76X",
          "--credit-iban",
          "FR76Y",
          "--reference",
          "Test",
          "--amount",
          "50",
        ],
        { from: "user" },
      );

      const [, opts] = fetchSpy.mock.calls[0] as [URL, RequestInit];
      const body = JSON.parse(opts.body as string) as { internal_transfer: { currency: string } };
      expect(body.internal_transfer.currency).toBe("EUR");
    });
  });
});
