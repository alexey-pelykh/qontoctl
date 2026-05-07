// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Command } from "commander";
import { registerRecurringTransferCommands } from "./index.js";

vi.mock("../../client.js", () => ({
  createClient: vi.fn(),
}));

vi.mock("@qontoctl/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@qontoctl/core")>();
  return {
    ...actual,
    createRecurringTransfer: vi.fn(),
    getBeneficiary: vi.fn(),
    verifyPayee: vi.fn(),
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

const { createRecurringTransfer, getBeneficiary, verifyPayee } = await import("@qontoctl/core");
const createRecurringTransferMock = vi.mocked(createRecurringTransfer);
const getBeneficiaryMock = vi.mocked(getBeneficiary);
const verifyPayeeMock = vi.mocked(verifyPayee);

const sampleBeneficiary = {
  id: "ben-1",
  name: "Acme Corp",
  iban: "FR7612345000010009876543210",
  bic: "BNPAFRPP",
  email: null,
  activity_tag: null,
  status: "validated" as const,
  trusted: true,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};

const sampleRecurringTransfer = {
  id: "rt-1",
  initiator_id: "user-1",
  bank_account_id: "acc-1",
  amount: 200,
  amount_cents: 20000,
  amount_currency: "EUR",
  beneficiary_id: "ben-1",
  reference: "Monthly rent",
  note: "",
  first_execution_date: "2026-04-01",
  last_execution_date: null,
  next_execution_date: "2026-04-01",
  frequency: "monthly" as const,
  status: "active",
  created_at: "2026-03-25T00:00:00.000Z",
  updated_at: "2026-03-25T00:00:00.000Z",
};

describe("recurring-transfer create command", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let stdoutSpy: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let stderrSpy: any;

  beforeEach(() => {
    vi.clearAllMocks();
    stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation((() => true) as never);
    stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation((() => true) as never);
    createClientMock.mockResolvedValue({} as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("creates a recurring transfer in table format", async () => {
    createRecurringTransferMock.mockResolvedValue(sampleRecurringTransfer);

    const program = new Command();
    program.option("-o, --output <format>", "", "table");
    registerRecurringTransferCommands(program);

    await program.parseAsync(
      [
        "recurring-transfer",
        "create",
        "--beneficiary",
        "ben-1",
        "--debit-account",
        "acc-1",
        "--amount",
        "200",
        "--reference",
        "Monthly rent",
        "--start-date",
        "2026-04-01",
        "--schedule",
        "monthly",
        "--vop-proof-token",
        "tok_abc123",
      ],
      { from: "user" },
    );

    expect(stdoutSpy).toHaveBeenCalled();
    const output = stdoutSpy.mock.calls[0]?.[0] as string;
    expect(output).toContain("rt-1");
    expect(output).toContain("monthly");
  });

  it("creates a recurring transfer in json format", async () => {
    createRecurringTransferMock.mockResolvedValue(sampleRecurringTransfer);

    const program = new Command();
    program.option("-o, --output <format>", "", "json");
    registerRecurringTransferCommands(program);

    await program.parseAsync(
      [
        "recurring-transfer",
        "create",
        "--beneficiary",
        "ben-1",
        "--debit-account",
        "acc-1",
        "--amount",
        "200",
        "--reference",
        "Monthly rent",
        "--start-date",
        "2026-04-01",
        "--schedule",
        "monthly",
        "--vop-proof-token",
        "tok_abc123",
      ],
      { from: "user" },
    );

    expect(stdoutSpy).toHaveBeenCalled();
    const output = stdoutSpy.mock.calls[0]?.[0] as string;
    const parsed = JSON.parse(output) as typeof sampleRecurringTransfer;
    expect(parsed.id).toBe("rt-1");
    expect(parsed.amount).toBe(200);
    expect(parsed.frequency).toBe("monthly");
  });

  it("passes parsed parameters to createRecurringTransfer", async () => {
    createRecurringTransferMock.mockResolvedValue(sampleRecurringTransfer);

    const program = new Command();
    program.option("-o, --output <format>", "", "table");
    registerRecurringTransferCommands(program);

    await program.parseAsync(
      [
        "recurring-transfer",
        "create",
        "--beneficiary",
        "ben-1",
        "--debit-account",
        "acc-1",
        "--amount",
        "500",
        "--currency",
        "USD",
        "--reference",
        "Quarterly fee",
        "--note",
        "Service contract",
        "--start-date",
        "2026-07-01",
        "--schedule",
        "quarterly",
        "--vop-proof-token",
        "tok_abc123",
      ],
      { from: "user" },
    );

    expect(createRecurringTransferMock).toHaveBeenCalledWith(
      expect.anything(),
      {
        beneficiary_id: "ben-1",
        bank_account_id: "acc-1",
        amount: "500",
        currency: "USD",
        reference: "Quarterly fee",
        note: "Service contract",
        first_execution_date: "2026-07-01",
        frequency: "quarterly",
        vop_proof_token: "tok_abc123",
      },
      expect.anything(),
    );
  });

  it("defaults currency to EUR when not specified", async () => {
    createRecurringTransferMock.mockResolvedValue(sampleRecurringTransfer);

    const program = new Command();
    program.option("-o, --output <format>", "", "table");
    registerRecurringTransferCommands(program);

    await program.parseAsync(
      [
        "recurring-transfer",
        "create",
        "--beneficiary",
        "ben-1",
        "--debit-account",
        "acc-1",
        "--amount",
        "100",
        "--reference",
        "Test",
        "--start-date",
        "2026-04-01",
        "--schedule",
        "weekly",
        "--vop-proof-token",
        "tok_abc123",
      ],
      { from: "user" },
    );

    expect(createRecurringTransferMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ currency: "EUR" }),
      expect.anything(),
    );
  });

  it("omits note when not provided", async () => {
    createRecurringTransferMock.mockResolvedValue(sampleRecurringTransfer);

    const program = new Command();
    program.option("-o, --output <format>", "", "table");
    registerRecurringTransferCommands(program);

    await program.parseAsync(
      [
        "recurring-transfer",
        "create",
        "--beneficiary",
        "ben-1",
        "--debit-account",
        "acc-1",
        "--amount",
        "100",
        "--reference",
        "Test",
        "--start-date",
        "2026-04-01",
        "--schedule",
        "monthly",
        "--vop-proof-token",
        "tok_abc123",
      ],
      { from: "user" },
    );

    const callArgs = createRecurringTransferMock.mock.calls[0]?.[1];
    expect(callArgs).not.toHaveProperty("note");
  });

  it("skips auto-verify when --vop-proof-token is provided", async () => {
    createRecurringTransferMock.mockResolvedValue(sampleRecurringTransfer);

    const program = new Command();
    program.option("-o, --output <format>", "", "table");
    registerRecurringTransferCommands(program);

    await program.parseAsync(
      [
        "recurring-transfer",
        "create",
        "--beneficiary",
        "ben-1",
        "--debit-account",
        "acc-1",
        "--amount",
        "100",
        "--reference",
        "Test",
        "--start-date",
        "2026-04-01",
        "--schedule",
        "monthly",
        "--vop-proof-token",
        "tok_explicit",
      ],
      { from: "user" },
    );

    expect(getBeneficiaryMock).not.toHaveBeenCalled();
    expect(verifyPayeeMock).not.toHaveBeenCalled();
    expect(createRecurringTransferMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ vop_proof_token: "tok_explicit" }),
      expect.anything(),
    );
  });

  it("auto-resolves vop_proof_token via getBeneficiary + verifyPayee on match", async () => {
    getBeneficiaryMock.mockResolvedValue(sampleBeneficiary);
    verifyPayeeMock.mockResolvedValue({
      match_result: "MATCH_RESULT_MATCH",
      matched_name: sampleBeneficiary.name,
      proof_token: { token: "tok_auto_match" },
    });
    createRecurringTransferMock.mockResolvedValue(sampleRecurringTransfer);

    const program = new Command();
    program.option("-o, --output <format>", "", "table");
    registerRecurringTransferCommands(program);

    await program.parseAsync(
      [
        "recurring-transfer",
        "create",
        "--beneficiary",
        "ben-1",
        "--debit-account",
        "acc-1",
        "--amount",
        "100",
        "--reference",
        "Test",
        "--start-date",
        "2026-04-01",
        "--schedule",
        "monthly",
      ],
      { from: "user" },
    );

    expect(getBeneficiaryMock).toHaveBeenCalledWith(expect.anything(), "ben-1");
    expect(verifyPayeeMock).toHaveBeenCalledWith(expect.anything(), {
      iban: sampleBeneficiary.iban,
      beneficiary_name: sampleBeneficiary.name,
    });
    expect(createRecurringTransferMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ vop_proof_token: "tok_auto_match" }),
      expect.anything(),
    );
    expect(stderrSpy).not.toHaveBeenCalled();
  });

  it("auto-resolves vop_proof_token on no_match result with warning", async () => {
    getBeneficiaryMock.mockResolvedValue(sampleBeneficiary);
    verifyPayeeMock.mockResolvedValue({
      match_result: "MATCH_RESULT_NO_MATCH",
      matched_name: sampleBeneficiary.name,
      proof_token: { token: "tok_auto_no_match" },
    });
    createRecurringTransferMock.mockResolvedValue(sampleRecurringTransfer);

    const program = new Command();
    program.option("-o, --output <format>", "", "table");
    registerRecurringTransferCommands(program);

    await program.parseAsync(
      [
        "recurring-transfer",
        "create",
        "--beneficiary",
        "ben-1",
        "--debit-account",
        "acc-1",
        "--amount",
        "100",
        "--reference",
        "Test",
        "--start-date",
        "2026-04-01",
        "--schedule",
        "monthly",
      ],
      { from: "user" },
    );

    expect(createRecurringTransferMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ vop_proof_token: "tok_auto_no_match" }),
      expect.anything(),
    );
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining("no match"));
  });
});
