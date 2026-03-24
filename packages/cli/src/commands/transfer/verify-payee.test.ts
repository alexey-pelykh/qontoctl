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
    verifyPayee: vi.fn(),
  };
});

vi.mock("../../sca.js", () => ({
  executeWithCliSca: vi.fn((_client: unknown, operation: (scaSessionToken?: string) => Promise<unknown>) =>
    operation(undefined),
  ),
}));

const { createClient } = await import("../../client.js");
const createClientMock = vi.mocked(createClient);

const { verifyPayee } = await import("@qontoctl/core");
const verifyPayeeMock = vi.mocked(verifyPayee);

const sampleResult = {
  match_result: "MATCH_RESULT_MATCH" as const,
  matched_name: "John Doe",
  proof_token: { token: "tok_abc123" },
};

describe("transfer verify-payee command", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let stdoutSpy: any;

  beforeEach(() => {
    stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation((() => true) as never);
    createClientMock.mockResolvedValue({} as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("verifies a payee in table format", async () => {
    verifyPayeeMock.mockResolvedValue(sampleResult);

    const program = new Command();
    program.option("-o, --output <format>", "", "table");
    registerTransferCommands(program);

    await program.parseAsync(
      ["transfer", "verify-payee", "--iban", "FR7612345000010009876543210", "--name", "John Doe"],
      { from: "user" },
    );

    expect(stdoutSpy).toHaveBeenCalled();
    const output = stdoutSpy.mock.calls[0]?.[0] as string;
    expect(output).toContain("MATCH_RESULT_MATCH");
    expect(output).toContain("John Doe");
  });

  it("verifies a payee in json format", async () => {
    verifyPayeeMock.mockResolvedValue(sampleResult);

    const program = new Command();
    program.option("-o, --output <format>", "", "json");
    registerTransferCommands(program);

    await program.parseAsync(
      ["transfer", "verify-payee", "--iban", "FR7612345000010009876543210", "--name", "John Doe"],
      { from: "user" },
    );

    expect(stdoutSpy).toHaveBeenCalled();
    const output = stdoutSpy.mock.calls[0]?.[0] as string;
    const parsed = JSON.parse(output) as typeof sampleResult;
    expect(parsed.match_result).toBe("MATCH_RESULT_MATCH");
    expect(parsed.matched_name).toBe("John Doe");
  });

  it("passes iban and name to verifyPayee", async () => {
    verifyPayeeMock.mockResolvedValue(sampleResult);

    const program = new Command();
    program.option("-o, --output <format>", "", "table");
    registerTransferCommands(program);

    await program.parseAsync(["transfer", "verify-payee", "--iban", "DE89370400440532013000", "--name", "Jane Smith"], {
      from: "user",
    });

    expect(verifyPayeeMock).toHaveBeenCalledWith(
      expect.anything(),
      { iban: "DE89370400440532013000", beneficiary_name: "Jane Smith" },
      expect.anything(),
    );
  });
});
