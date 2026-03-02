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
    bulkVerifyPayee: vi.fn(),
  };
});

vi.mock("../../sca.js", () => ({
  executeWithCliSca: vi.fn((_client: unknown, operation: (scaSessionToken?: string) => Promise<unknown>) =>
    operation(undefined),
  ),
}));

vi.mock("node:fs/promises", () => ({
  readFile: vi.fn(),
}));

const { createClient } = await import("../../client.js");
const createClientMock = vi.mocked(createClient);

const { bulkVerifyPayee } = await import("@qontoctl/core");
const bulkVerifyPayeeMock = vi.mocked(bulkVerifyPayee);

const { readFile } = await import("node:fs/promises");
const readFileMock = vi.mocked(readFile);

const sampleResults = [
  { iban: "FR7612345000010009876543210", name: "John Doe", result: "match" as const },
  { iban: "DE89370400440532013000", name: "Jane Smith", result: "mismatch" as const },
];

describe("transfer bulk-verify-payee command", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let stdoutSpy: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let stderrSpy: any;

  beforeEach(() => {
    stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation((() => true) as never);
    stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation((() => true) as never);
    createClientMock.mockResolvedValue({} as never);
    process.exitCode = undefined;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.exitCode = undefined;
  });

  it("reads CSV file and verifies payees in json format", async () => {
    readFileMock.mockResolvedValue(
      "iban,name\nFR7612345000010009876543210,John Doe\nDE89370400440532013000,Jane Smith",
    );
    bulkVerifyPayeeMock.mockResolvedValue(sampleResults);

    const program = new Command();
    program.option("-o, --output <format>", "", "json");
    registerTransferCommands(program);

    await program.parseAsync(["transfer", "bulk-verify-payee", "--file", "payees.csv"], { from: "user" });

    expect(readFileMock).toHaveBeenCalledWith("payees.csv", "utf-8");
    expect(bulkVerifyPayeeMock).toHaveBeenCalledWith(
      expect.anything(),
      [
        { iban: "FR7612345000010009876543210", name: "John Doe" },
        { iban: "DE89370400440532013000", name: "Jane Smith" },
      ],
      expect.anything(),
    );

    expect(stdoutSpy).toHaveBeenCalled();
    const output = stdoutSpy.mock.calls[0]?.[0] as string;
    const parsed = JSON.parse(output) as typeof sampleResults;
    expect(parsed).toHaveLength(2);
    expect(parsed[0]?.result).toBe("match");
  });

  it("reads CSV without header row", async () => {
    readFileMock.mockResolvedValue("FR7612345000010009876543210,John Doe\nDE89370400440532013000,Jane Smith");
    bulkVerifyPayeeMock.mockResolvedValue(sampleResults);

    const program = new Command();
    program.option("-o, --output <format>", "", "table");
    registerTransferCommands(program);

    await program.parseAsync(["transfer", "bulk-verify-payee", "--file", "payees.csv"], { from: "user" });

    expect(bulkVerifyPayeeMock).toHaveBeenCalledWith(
      expect.anything(),
      [
        { iban: "FR7612345000010009876543210", name: "John Doe" },
        { iban: "DE89370400440532013000", name: "Jane Smith" },
      ],
      expect.anything(),
    );
  });

  it("exits with error for empty CSV file", async () => {
    readFileMock.mockResolvedValue("");

    const program = new Command();
    program.option("-o, --output <format>", "", "table");
    registerTransferCommands(program);

    await program.parseAsync(["transfer", "bulk-verify-payee", "--file", "empty.csv"], { from: "user" });

    expect(stderrSpy).toHaveBeenCalled();
    const errorOutput = stderrSpy.mock.calls[0]?.[0] as string;
    expect(errorOutput).toContain("No valid entries found");
    expect(process.exitCode).toBe(1);
  });
});
