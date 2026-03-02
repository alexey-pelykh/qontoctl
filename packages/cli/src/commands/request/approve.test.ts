// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

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
    approveRequest: vi.fn(),
  };
});

vi.mock("../../sca.js", () => ({
  executeWithCliSca: vi.fn((_client: unknown, operation: (scaSessionToken?: string) => Promise<unknown>) =>
    operation(undefined),
  ),
}));

const { createClient } = await import("../../client.js");
const createClientMock = vi.mocked(createClient);

const { approveRequest } = await import("@qontoctl/core");
const approveRequestMock = vi.mocked(approveRequest);

describe("request approve command", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let stdoutSpy: any;

  beforeEach(() => {
    stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation((() => true) as never);
    createClientMock.mockResolvedValue({} as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("approves a request with the correct type and id", async () => {
    approveRequestMock.mockResolvedValue(undefined);

    const program = new Command();
    program.option("-o, --output <format>", "", "table");
    registerRequestCommands(program);

    await program.parseAsync(["request", "approve", "req-1", "--type", "transfer"], { from: "user" });

    expect(approveRequestMock).toHaveBeenCalledWith(
      expect.anything(),
      "transfer",
      "req-1",
      undefined,
      expect.anything(),
    );
    expect(stdoutSpy).toHaveBeenCalled();
    const output = stdoutSpy.mock.calls[0]?.[0] as string;
    expect(output).toContain("Request req-1 approved.");
  });

  it("approves a request in json format", async () => {
    approveRequestMock.mockResolvedValue(undefined);

    const program = new Command();
    program.option("-o, --output <format>", "", "json");
    registerRequestCommands(program);

    await program.parseAsync(["request", "approve", "req-1", "--type", "flash_card"], { from: "user" });

    expect(stdoutSpy).toHaveBeenCalled();
    const output = stdoutSpy.mock.calls[0]?.[0] as string;
    const parsed = JSON.parse(output) as { approved: boolean; id: string };
    expect(parsed.approved).toBe(true);
    expect(parsed.id).toBe("req-1");
  });

  it("sends debit_iban when provided", async () => {
    approveRequestMock.mockResolvedValue(undefined);

    const program = new Command();
    program.option("-o, --output <format>", "", "table");
    registerRequestCommands(program);

    await program.parseAsync(
      ["request", "approve", "req-1", "--type", "multi_transfer", "--debit-iban", "FR7612345000010009876543210"],
      { from: "user" },
    );

    expect(approveRequestMock).toHaveBeenCalledWith(
      expect.anything(),
      "multi_transfer",
      "req-1",
      { debit_iban: "FR7612345000010009876543210" },
      expect.anything(),
    );
  });
});
