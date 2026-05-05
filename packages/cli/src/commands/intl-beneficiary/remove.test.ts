// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Command } from "commander";
import { registerIntlBeneficiaryCommands } from "./index.js";

vi.mock("../../client.js", () => ({
  createClient: vi.fn(),
}));

vi.mock("@qontoctl/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@qontoctl/core")>();
  return {
    ...actual,
    removeIntlBeneficiary: vi.fn(),
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

const { removeIntlBeneficiary } = await import("@qontoctl/core");
const removeIntlBeneficiaryMock = vi.mocked(removeIntlBeneficiary);

describe("intl beneficiary remove command", () => {
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

  it("removes an intl beneficiary with --yes flag", async () => {
    removeIntlBeneficiaryMock.mockResolvedValue(undefined);

    const program = new Command();
    program.option("-o, --output <format>", "", "table");
    registerIntlBeneficiaryCommands(program);

    await program.parseAsync(["intl", "beneficiary", "remove", "intl-ben-1", "--yes"], { from: "user" });

    expect(removeIntlBeneficiaryMock).toHaveBeenCalledWith(expect.anything(), "intl-ben-1", expect.anything());
    expect(stdoutSpy).toHaveBeenCalled();
    const output = stdoutSpy.mock.calls[0]?.[0] as string;
    expect(output).toContain("International beneficiary intl-ben-1 removed.");
  });

  it("removes an intl beneficiary in json format", async () => {
    removeIntlBeneficiaryMock.mockResolvedValue(undefined);

    const program = new Command();
    program.option("-o, --output <format>", "", "json");
    registerIntlBeneficiaryCommands(program);

    await program.parseAsync(["intl", "beneficiary", "remove", "intl-ben-1", "--yes"], { from: "user" });

    expect(stdoutSpy).toHaveBeenCalled();
    const output = stdoutSpy.mock.calls[0]?.[0] as string;
    const parsed = JSON.parse(output) as { removed: boolean; id: string };
    expect(parsed.removed).toBe(true);
    expect(parsed.id).toBe("intl-ben-1");
  });

  it("exits with error when --yes is not provided", async () => {
    const program = new Command();
    program.option("-o, --output <format>", "", "table");
    registerIntlBeneficiaryCommands(program);

    await program.parseAsync(["intl", "beneficiary", "remove", "intl-ben-1"], { from: "user" });

    expect(stderrSpy).toHaveBeenCalled();
    const errorOutput = stderrSpy.mock.calls[0]?.[0] as string;
    expect(errorOutput).toContain("About to remove international beneficiary intl-ben-1");
    expect(errorOutput).toContain("--yes");
    expect(process.exitCode).toBe(1);
  });
});
