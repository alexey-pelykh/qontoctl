// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Command } from "commander";
import { registerTransferCommands } from "./index.js";

vi.mock("../../client.js", () => ({
  createClient: vi.fn(),
}));

vi.mock("@qontoctl/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@qontoctl/core")>();
  return {
    ...actual,
    createTransfer: vi.fn(),
  };
});

vi.mock("../../sca.js", () => ({
  executeWithCliSca: vi.fn((_client: unknown, operation: (scaSessionToken?: string) => Promise<unknown>) =>
    operation(undefined),
  ),
}));

const { createClient } = await import("../../client.js");
const createClientMock = vi.mocked(createClient);

const { createTransfer } = await import("@qontoctl/core");
const createTransferMock = vi.mocked(createTransfer);

const sampleTransfer = {
  id: "txfr-new",
  initiator_id: "user-1",
  bank_account_id: "acc-1",
  beneficiary_id: "ben-1",
  amount: 500,
  amount_cents: 50000,
  amount_currency: "EUR",
  status: "pending" as const,
  reference: "Test Payment",
  note: null,
  scheduled_date: "2026-03-02",
  created_at: "2026-03-02T00:00:00.000Z",
  updated_at: "2026-03-02T00:00:00.000Z",
  processed_at: null,
  completed_at: null,
  transaction_id: null,
  recurring_transfer_id: null,
  declined_reason: null,
};

describe("transfer create command", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let stdoutSpy: any;

  beforeEach(() => {
    stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation((() => true) as never);
    createClientMock.mockResolvedValue({} as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("creates a transfer in table format", async () => {
    createTransferMock.mockResolvedValue(sampleTransfer);

    const program = new Command();
    program.option("-o, --output <format>", "", "table");
    registerTransferCommands(program);

    await program.parseAsync(
      [
        "transfer",
        "create",
        "--beneficiary",
        "ben-1",
        "--debit-account",
        "acc-1",
        "--reference",
        "Test Payment",
        "--amount",
        "500",
      ],
      { from: "user" },
    );

    expect(stdoutSpy).toHaveBeenCalled();
    const output = stdoutSpy.mock.calls[0]?.[0] as string;
    expect(output).toContain("txfr-new");
    expect(output).toContain("Test Payment");
  });

  it("creates a transfer in json format", async () => {
    createTransferMock.mockResolvedValue(sampleTransfer);

    const program = new Command();
    program.option("-o, --output <format>", "", "json");
    registerTransferCommands(program);

    await program.parseAsync(
      [
        "transfer",
        "create",
        "--beneficiary",
        "ben-1",
        "--debit-account",
        "acc-1",
        "--reference",
        "Test Payment",
        "--amount",
        "500",
      ],
      { from: "user" },
    );

    expect(stdoutSpy).toHaveBeenCalled();
    const output = stdoutSpy.mock.calls[0]?.[0] as string;
    const parsed = JSON.parse(output) as typeof sampleTransfer;
    expect(parsed.id).toBe("txfr-new");
    expect(parsed.amount).toBe(500);
  });

  it("passes parsed amount and optional fields to createTransfer", async () => {
    createTransferMock.mockResolvedValue(sampleTransfer);

    const program = new Command();
    program.option("-o, --output <format>", "", "table");
    registerTransferCommands(program);

    await program.parseAsync(
      [
        "transfer",
        "create",
        "--beneficiary",
        "ben-1",
        "--debit-account",
        "acc-1",
        "--reference",
        "Invoice 42",
        "--amount",
        "1234.56",
        "--note",
        "Monthly fee",
        "--scheduled-date",
        "2026-04-01",
      ],
      { from: "user" },
    );

    expect(createTransferMock).toHaveBeenCalledWith(
      expect.anything(),
      {
        beneficiary_id: "ben-1",
        debit_account_id: "acc-1",
        reference: "Invoice 42",
        amount: 1234.56,
        currency: "EUR",
        note: "Monthly fee",
        scheduled_date: "2026-04-01",
      },
      expect.anything(),
    );
  });
});
