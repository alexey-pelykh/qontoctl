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

const { createTransfer, getBeneficiary, verifyPayee } = await import("@qontoctl/core");
const createTransferMock = vi.mocked(createTransfer);
const getBeneficiaryMock = vi.mocked(getBeneficiary);
const verifyPayeeMock = vi.mocked(verifyPayee);

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

describe("transfer create command", () => {
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
        "--vop-proof-token",
        "tok_abc123",
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
        "--vop-proof-token",
        "tok_abc123",
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
        "--vop-proof-token",
        "tok_abc123",
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
        bank_account_id: "acc-1",
        reference: "Invoice 42",
        amount: "1234.56",
        vop_proof_token: "tok_abc123",
        note: "Monthly fee",
        scheduled_date: "2026-04-01",
      },
      expect.anything(),
    );
  });

  it("skips auto-verify when --vop-proof-token is provided", async () => {
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
        "--vop-proof-token",
        "tok_explicit",
      ],
      { from: "user" },
    );

    expect(getBeneficiaryMock).not.toHaveBeenCalled();
    expect(verifyPayeeMock).not.toHaveBeenCalled();
    expect(createTransferMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ vop_proof_token: "tok_explicit" }),
      expect.anything(),
    );
  });

  it("auto-resolves vop_proof_token on match result", async () => {
    getBeneficiaryMock.mockResolvedValue(sampleBeneficiary);
    verifyPayeeMock.mockResolvedValue({
      match_result: "MATCH_RESULT_MATCH",
      matched_name: sampleBeneficiary.name,
      proof_token: { token: "tok_auto_match" },
    });
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

    expect(getBeneficiaryMock).toHaveBeenCalledWith(expect.anything(), "ben-1");
    expect(verifyPayeeMock).toHaveBeenCalledWith(expect.anything(), {
      iban: sampleBeneficiary.iban,
      beneficiary_name: sampleBeneficiary.name,
    });
    expect(createTransferMock).toHaveBeenCalledWith(
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

    expect(createTransferMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ vop_proof_token: "tok_auto_no_match" }),
      expect.anything(),
    );
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining("no match"));
  });

  it("creates a transfer with inline beneficiary", async () => {
    verifyPayeeMock.mockResolvedValue({
      match_result: "MATCH_RESULT_MATCH",
      matched_name: "Jane Doe",
      proof_token: { token: "tok_inline_auto" },
    });
    createTransferMock.mockResolvedValue(sampleTransfer);

    const program = new Command();
    program.option("-o, --output <format>", "", "table");
    registerTransferCommands(program);

    await program.parseAsync(
      [
        "transfer",
        "create",
        "--beneficiary-name",
        "Jane Doe",
        "--beneficiary-iban",
        "DE89370400440532013000",
        "--beneficiary-bic",
        "COBADEFFXXX",
        "--debit-account",
        "acc-1",
        "--reference",
        "Inline Payment",
        "--amount",
        "250",
      ],
      { from: "user" },
    );

    expect(getBeneficiaryMock).not.toHaveBeenCalled();
    expect(verifyPayeeMock).toHaveBeenCalledWith(expect.anything(), {
      iban: "DE89370400440532013000",
      beneficiary_name: "Jane Doe",
    });
    expect(createTransferMock).toHaveBeenCalledWith(
      expect.anything(),
      {
        beneficiary: {
          name: "Jane Doe",
          iban: "DE89370400440532013000",
          bic: "COBADEFFXXX",
        },
        bank_account_id: "acc-1",
        reference: "Inline Payment",
        amount: "250",
        vop_proof_token: "tok_inline_auto",
      },
      expect.anything(),
    );
  });

  it("passes attachment_ids when --attachment-id is provided", async () => {
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
        "35000",
        "--vop-proof-token",
        "tok_abc123",
        "--attachment-id",
        "att-1",
        "att-2",
      ],
      { from: "user" },
    );

    expect(createTransferMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ attachment_ids: ["att-1", "att-2"] }),
      expect.anything(),
    );
  });

  it("auto-resolves vop_proof_token on close_match result with warning including matched_name", async () => {
    getBeneficiaryMock.mockResolvedValue(sampleBeneficiary);
    verifyPayeeMock.mockResolvedValue({
      match_result: "MATCH_RESULT_CLOSE_MATCH",
      matched_name: "Acme Corporation",
      proof_token: { token: "tok_auto_close_match" },
    });
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

    expect(createTransferMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ vop_proof_token: "tok_auto_close_match" }),
      expect.anything(),
    );
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining("close match"));
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining("matched name: Acme Corporation"));
  });

  it("auto-resolves vop_proof_token on not_possible result with warning", async () => {
    getBeneficiaryMock.mockResolvedValue(sampleBeneficiary);
    verifyPayeeMock.mockResolvedValue({
      match_result: "MATCH_RESULT_NOT_POSSIBLE",
      matched_name: null,
      proof_token: { token: "tok_auto_not_possible" },
    });
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

    expect(createTransferMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ vop_proof_token: "tok_auto_not_possible" }),
      expect.anything(),
    );
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining("not possible"));
  });
});
