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
    cancelRecurringTransfer: vi.fn(),
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

const { cancelRecurringTransfer } = await import("@qontoctl/core");
const cancelRecurringTransferMock = vi.mocked(cancelRecurringTransfer);

describe("recurring-transfer cancel command", () => {
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

  it("cancels a recurring transfer with --yes flag", async () => {
    cancelRecurringTransferMock.mockResolvedValue(undefined);

    const program = new Command();
    program.option("-o, --output <format>", "", "table");
    registerRecurringTransferCommands(program);

    await program.parseAsync(["recurring-transfer", "cancel", "rt-1", "--yes"], { from: "user" });

    expect(cancelRecurringTransferMock).toHaveBeenCalledWith(expect.anything(), "rt-1", expect.anything());
    expect(stdoutSpy).toHaveBeenCalled();
    const output = stdoutSpy.mock.calls[0]?.[0] as string;
    expect(output).toContain("Recurring transfer rt-1 canceled.");
  });

  it("cancels a recurring transfer in json format", async () => {
    cancelRecurringTransferMock.mockResolvedValue(undefined);

    const program = new Command();
    program.option("-o, --output <format>", "", "json");
    registerRecurringTransferCommands(program);

    await program.parseAsync(["recurring-transfer", "cancel", "rt-1", "--yes"], { from: "user" });

    expect(stdoutSpy).toHaveBeenCalled();
    const output = stdoutSpy.mock.calls[0]?.[0] as string;
    const parsed = JSON.parse(output) as { canceled: boolean; id: string };
    expect(parsed.canceled).toBe(true);
    expect(parsed.id).toBe("rt-1");
  });

  it("exits with error when --yes is not provided", async () => {
    const program = new Command();
    program.option("-o, --output <format>", "", "table");
    registerRecurringTransferCommands(program);

    await program.parseAsync(["recurring-transfer", "cancel", "rt-1"], { from: "user" });

    expect(stderrSpy).toHaveBeenCalled();
    const errorOutput = stderrSpy.mock.calls[0]?.[0] as string;
    expect(errorOutput).toContain("About to cancel recurring transfer rt-1");
    expect(errorOutput).toContain("--yes");
    expect(process.exitCode).toBe(1);
  });
});
