// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createProgram } from "../../program.js";

function jsonResponse(body: unknown): Promise<Response> {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

describe("transaction show command", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;
  let writtenOutput: string[];

  beforeEach(() => {
    fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    writtenOutput = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk: string | Uint8Array): boolean => {
      writtenOutput.push(String(chunk));
      return true;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function runCommand(...args: string[]) {
    vi.stubEnv("QONTOCTL_ORGANIZATION_SLUG", "test-org");
    vi.stubEnv("QONTOCTL_SECRET_KEY", "test-secret");

    const program = createProgram();
    program.exitOverride();
    await program.parseAsync(["node", "qontoctl", "transaction", "show", ...args]);
  }

  it("registers transaction show command", () => {
    const program = createProgram();
    const txn = program.commands.find((c) => c.name() === "transaction");
    expect(txn).toBeDefined();
    const show = txn?.commands.find((c) => c.name() === "show");
    expect(show).toBeDefined();
  });

  it("fetches a transaction by ID", async () => {
    const txn = {
      id: "txn-123",
      transaction_id: "txn-123",
      amount: 4.5,
      amount_cents: 450,
      settled_balance: null,
      settled_balance_cents: null,
      local_amount: 4.5,
      local_amount_cents: 450,
      side: "debit",
      operation_type: "card",
      currency: "EUR",
      local_currency: "EUR",
      label: "Coffee Shop",
      clean_counterparty_name: "Coffee Shop",
      settled_at: "2026-03-01T00:00:00.000Z",
      emitted_at: "2026-03-01T00:00:00.000Z",
      created_at: "2026-03-01T00:00:00.000Z",
      updated_at: "2026-03-01T00:00:00.000Z",
      status: "completed",
      note: null,
      reference: null,
      vat_amount: null,
      vat_amount_cents: null,
      vat_rate: null,
      initiator_id: null,
      label_ids: [],
      attachment_ids: [],
      attachment_lost: false,
      attachment_required: false,
      card_last_digits: null,
      category: "other_expense",
      subject_type: "card",
      bank_account_id: "ba-1",
      is_external_transaction: false,
    };
    fetchSpy.mockReturnValue(jsonResponse({ transaction: txn }));

    await runCommand("txn-123", "--output", "json");

    expect(fetchSpy).toHaveBeenCalled();
    const [url] = fetchSpy.mock.calls[0] as [URL];
    expect(url.pathname).toBe("/v2/transactions/txn-123");

    const parsed = JSON.parse(writtenOutput.join(""));
    expect(parsed).toEqual(txn);
  });

  it("passes includes as query params", async () => {
    fetchSpy.mockReturnValue(
      jsonResponse({
        transaction: {
          id: "txn-1",
          transaction_id: "txn-1",
          amount: 10,
          amount_cents: 1000,
          settled_balance: null,
          settled_balance_cents: null,
          local_amount: 10,
          local_amount_cents: 1000,
          side: "debit",
          operation_type: "card",
          currency: "EUR",
          local_currency: "EUR",
          label: "Test",
          clean_counterparty_name: "Test",
          settled_at: null,
          emitted_at: "2026-03-01T00:00:00.000Z",
          created_at: "2026-03-01T00:00:00.000Z",
          updated_at: "2026-03-01T00:00:00.000Z",
          status: "completed",
          note: null,
          reference: null,
          vat_amount: null,
          vat_amount_cents: null,
          vat_rate: null,
          initiator_id: null,
          label_ids: [],
          attachment_ids: [],
          attachment_lost: false,
          attachment_required: false,
          card_last_digits: null,
          category: "other_expense",
          subject_type: "card",
          bank_account_id: "ba-1",
          is_external_transaction: false,
        },
      }),
    );

    await runCommand("txn-1", "--include", "labels", "attachments");

    const [url] = fetchSpy.mock.calls[0] as [URL];
    expect(url.searchParams.getAll("includes[]")).toEqual(["labels", "attachments"]);
  });

  it("outputs yaml format for single transaction", async () => {
    const txn = {
      id: "txn-1",
      transaction_id: "txn-1",
      amount: 1500,
      amount_cents: 150000,
      settled_balance: null,
      settled_balance_cents: null,
      local_amount: 1500,
      local_amount_cents: 150000,
      side: "debit",
      operation_type: "transfer",
      currency: "EUR",
      local_currency: "EUR",
      label: "Office Rent",
      clean_counterparty_name: "Landlord Inc",
      settled_at: "2026-03-01T00:00:00.000Z",
      emitted_at: "2026-03-01T00:00:00.000Z",
      created_at: "2026-03-01T00:00:00.000Z",
      updated_at: "2026-03-01T00:00:00.000Z",
      status: "completed",
      note: null,
      reference: null,
      vat_amount: null,
      vat_amount_cents: null,
      vat_rate: null,
      initiator_id: null,
      label_ids: [],
      attachment_ids: [],
      attachment_lost: false,
      attachment_required: false,
      card_last_digits: null,
      category: "other_expense",
      subject_type: "transfer",
      bank_account_id: "ba-1",
      is_external_transaction: false,
    };
    fetchSpy.mockReturnValue(jsonResponse({ transaction: txn }));

    await runCommand("txn-1", "--output", "yaml");

    const output = writtenOutput.join("");
    expect(output).toContain("Office Rent");
    expect(output).toContain("1500");
  });
});
