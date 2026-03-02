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
    cancelTransfer: vi.fn(),
  };
});

vi.mock("../../sca.js", () => ({
  executeWithCliSca: vi.fn((_client: unknown, operation: (scaSessionToken?: string) => Promise<unknown>) =>
    operation(undefined),
  ),
}));

const { createClient } = await import("../../client.js");
const createClientMock = vi.mocked(createClient);

const { cancelTransfer } = await import("@qontoctl/core");
const cancelTransferMock = vi.mocked(cancelTransfer);

describe("transfer cancel command", () => {
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

  it("cancels a transfer with --yes flag", async () => {
    cancelTransferMock.mockResolvedValue(undefined);

    const program = new Command();
    program.option("-o, --output <format>", "", "table");
    registerTransferCommands(program);

    await program.parseAsync(["transfer", "cancel", "txfr-1", "--yes"], { from: "user" });

    expect(cancelTransferMock).toHaveBeenCalledWith(expect.anything(), "txfr-1", expect.anything());
    expect(stdoutSpy).toHaveBeenCalled();
    const output = stdoutSpy.mock.calls[0]?.[0] as string;
    expect(output).toContain("Transfer txfr-1 canceled.");
  });

  it("cancels a transfer in json format", async () => {
    cancelTransferMock.mockResolvedValue(undefined);

    const program = new Command();
    program.option("-o, --output <format>", "", "json");
    registerTransferCommands(program);

    await program.parseAsync(["transfer", "cancel", "txfr-1", "--yes"], { from: "user" });

    expect(stdoutSpy).toHaveBeenCalled();
    const output = stdoutSpy.mock.calls[0]?.[0] as string;
    const parsed = JSON.parse(output) as { canceled: boolean; id: string };
    expect(parsed.canceled).toBe(true);
    expect(parsed.id).toBe("txfr-1");
  });

  it("exits with error when --yes is not provided", async () => {
    const program = new Command();
    program.option("-o, --output <format>", "", "table");
    registerTransferCommands(program);

    await program.parseAsync(["transfer", "cancel", "txfr-1"], { from: "user" });

    expect(stderrSpy).toHaveBeenCalled();
    const errorOutput = stderrSpy.mock.calls[0]?.[0] as string;
    expect(errorOutput).toContain("About to cancel transfer txfr-1");
    expect(errorOutput).toContain("--yes");
    expect(process.exitCode).toBe(1);
  });
});
