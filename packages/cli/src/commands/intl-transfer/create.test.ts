// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Command } from "commander";
import { registerIntlTransferCommands } from "./index.js";

vi.mock("../../client.js", () => ({
  createClient: vi.fn(),
}));

vi.mock("@qontoctl/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@qontoctl/core")>();
  return {
    ...actual,
    createIntlTransfer: vi.fn(),
  };
});

vi.mock("../../sca.js", () => ({
  executeWithCliSca: vi.fn((_client: unknown, operation: (scaSessionToken?: string) => Promise<unknown>) =>
    operation(undefined),
  ),
}));

const { createClient } = await import("../../client.js");
const createClientMock = vi.mocked(createClient);

const { createIntlTransfer } = await import("@qontoctl/core");
const createIntlTransferMock = vi.mocked(createIntlTransfer);

const sampleTransfer = {
  id: "intl-txfr-1",
  beneficiary_id: "intl-ben-1",
  quote_id: "quote-1",
  status: "processing",
};

describe("intl transfer create command", () => {
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
    createIntlTransferMock.mockResolvedValue(sampleTransfer);

    const program = new Command();
    program.option("-o, --output <format>", "", "table");
    registerIntlTransferCommands(program);

    await program.parseAsync(["intl", "transfer", "create", "--beneficiary", "intl-ben-1", "--quote", "quote-1"], {
      from: "user",
    });

    expect(stdoutSpy).toHaveBeenCalled();
    const output = stdoutSpy.mock.calls[0]?.[0] as string;
    expect(output).toContain("intl-txfr-1");
  });

  it("creates a transfer in json format", async () => {
    createIntlTransferMock.mockResolvedValue(sampleTransfer);

    const program = new Command();
    program.option("-o, --output <format>", "", "json");
    registerIntlTransferCommands(program);

    await program.parseAsync(["intl", "transfer", "create", "--beneficiary", "intl-ben-1", "--quote", "quote-1"], {
      from: "user",
    });

    expect(stdoutSpy).toHaveBeenCalled();
    const output = stdoutSpy.mock.calls[0]?.[0] as string;
    const parsed = JSON.parse(output) as typeof sampleTransfer;
    expect(parsed.id).toBe("intl-txfr-1");
  });

  it("passes beneficiary_id, quote_id, and extra fields to createIntlTransfer", async () => {
    createIntlTransferMock.mockResolvedValue(sampleTransfer);

    const program = new Command();
    program.option("-o, --output <format>", "", "table");
    registerIntlTransferCommands(program);

    await program.parseAsync(
      [
        "intl",
        "transfer",
        "create",
        "--beneficiary",
        "intl-ben-1",
        "--quote",
        "quote-1",
        "--field",
        "reference=INV-42",
        "--field",
        "purpose_of_payment=invoice",
      ],
      { from: "user" },
    );

    expect(createIntlTransferMock).toHaveBeenCalledWith(
      expect.anything(),
      {
        beneficiary_id: "intl-ben-1",
        quote_id: "quote-1",
        reference: "INV-42",
        purpose_of_payment: "invoice",
      },
      expect.anything(),
    );
  });
});
