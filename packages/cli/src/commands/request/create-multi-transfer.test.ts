// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { writeFile, unlink, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Command } from "commander";
import { registerRequestCommands } from "./index.js";

vi.mock("../../client.js", () => ({
  createClient: vi.fn(),
}));

vi.mock("@qontoctl/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@qontoctl/core")>();
  return {
    ...actual,
    createMultiTransferRequest: vi.fn(),
  };
});

vi.mock("../../sca.js", () => ({
  executeWithCliSca: vi.fn(
    (
      _client: unknown,
      operation: (ctx: { scaSessionToken?: string; idempotencyKey: string }) => Promise<unknown>,
      options?: { idempotencyKey?: string },
    ) => operation({ idempotencyKey: options?.idempotencyKey ?? "test-idempotency-key" }),
  ),
}));

const { createClient } = await import("../../client.js");
const createClientMock = vi.mocked(createClient);

const { createMultiTransferRequest } = await import("@qontoctl/core");
const createMultiTransferRequestMock = vi.mocked(createMultiTransferRequest);

describe("request create-multi-transfer command", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let stdoutSpy: any;
  let tempDir: string;
  let tempFile: string;

  beforeEach(async () => {
    stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation((() => true) as never);
    createClientMock.mockResolvedValue({} as never);
    tempDir = await mkdtemp(join(tmpdir(), "qontoctl-test-"));
    tempFile = join(tempDir, "transfers.json");
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    try {
      await unlink(tempFile);
    } catch {
      // ignore
    }
  });

  it("creates a multi-transfer request from a JSON file", async () => {
    const transfers = [
      {
        amount: "150.00",
        currency: "EUR",
        credit_iban: "FR7612345000010009876543210",
        credit_account_name: "Vendor A",
        credit_account_currency: "EUR",
        reference: "Invoice 001",
      },
    ];
    await writeFile(tempFile, JSON.stringify(transfers));

    const request = {
      id: "req-1",
      request_type: "multi_transfer" as const,
      status: "pending" as const,
      initiator_id: "user-1",
      approver_id: null,
      note: "Monthly payments",
      declined_note: null,
      total_transfers_amount: "150.00",
      total_transfers_amount_currency: "EUR",
      total_transfers_count: 1,
      scheduled_date: "2026-04-01",
      processed_at: null,
      created_at: "2026-03-01T10:00:00.000Z",
    };
    createMultiTransferRequestMock.mockResolvedValue(request);

    const program = new Command();
    program.option("-o, --output <format>", "", "table");
    registerRequestCommands(program);

    await program.parseAsync(["request", "create-multi-transfer", "--note", "Monthly payments", "--file", tempFile], {
      from: "user",
    });

    expect(createMultiTransferRequestMock).toHaveBeenCalledWith(
      expect.anything(),
      { note: "Monthly payments", transfers },
      expect.anything(),
    );
    expect(stdoutSpy).toHaveBeenCalled();
    const output = stdoutSpy.mock.calls[0]?.[0] as string;
    expect(output).toContain("req-1");
    expect(output).toContain("150.00 EUR");
  });

  it("passes optional scheduled-date and debit-iban", async () => {
    const transfers = [
      {
        amount: "100.00",
        currency: "EUR",
        credit_iban: "FR7612345000010009876543210",
        credit_account_name: "Vendor",
        credit_account_currency: "EUR",
        reference: "Inv 001",
      },
    ];
    await writeFile(tempFile, JSON.stringify(transfers));

    const request = {
      id: "req-2",
      request_type: "multi_transfer" as const,
      status: "pending" as const,
      initiator_id: "user-1",
      approver_id: null,
      note: "Payment",
      declined_note: null,
      total_transfers_amount: "100.00",
      total_transfers_amount_currency: "EUR",
      total_transfers_count: 1,
      scheduled_date: "2026-04-01",
      processed_at: null,
      created_at: "2026-03-01T10:00:00.000Z",
    };
    createMultiTransferRequestMock.mockResolvedValue(request);

    const program = new Command();
    program.option("-o, --output <format>", "", "json");
    registerRequestCommands(program);

    await program.parseAsync(
      [
        "request",
        "create-multi-transfer",
        "--note",
        "Payment",
        "--file",
        tempFile,
        "--scheduled-date",
        "2026-04-01",
        "--debit-iban",
        "FR7630001007941234567890185",
      ],
      { from: "user" },
    );

    expect(createMultiTransferRequestMock).toHaveBeenCalledWith(
      expect.anything(),
      {
        note: "Payment",
        transfers,
        scheduled_date: "2026-04-01",
        debit_iban: "FR7630001007941234567890185",
      },
      expect.anything(),
    );

    const output = stdoutSpy.mock.calls[0]?.[0] as string;
    const parsed = JSON.parse(output) as { id: string };
    expect(parsed.id).toBe("req-2");
  });
});
