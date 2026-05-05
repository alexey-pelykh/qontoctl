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
    createIntlBeneficiary: vi.fn(),
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

const { createIntlBeneficiary } = await import("@qontoctl/core");
const createIntlBeneficiaryMock = vi.mocked(createIntlBeneficiary);

const sampleBeneficiary = {
  id: "intl-ben-1",
  name: "Global Corp",
  country: "US",
  currency: "USD",
};

describe("intl beneficiary add command", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let stdoutSpy: any;

  beforeEach(() => {
    stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation((() => true) as never);
    createClientMock.mockResolvedValue({} as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("creates an intl beneficiary in table format", async () => {
    createIntlBeneficiaryMock.mockResolvedValue(sampleBeneficiary);

    const program = new Command();
    program.option("-o, --output <format>", "", "table");
    registerIntlBeneficiaryCommands(program);

    await program.parseAsync(["intl", "beneficiary", "add", "--country", "US", "--currency", "USD"], {
      from: "user",
    });

    expect(stdoutSpy).toHaveBeenCalled();
    const output = stdoutSpy.mock.calls[0]?.[0] as string;
    expect(output).toContain("intl-ben-1");
    expect(output).toContain("Global Corp");
  });

  it("creates an intl beneficiary in json format", async () => {
    createIntlBeneficiaryMock.mockResolvedValue(sampleBeneficiary);

    const program = new Command();
    program.option("-o, --output <format>", "", "json");
    registerIntlBeneficiaryCommands(program);

    await program.parseAsync(["intl", "beneficiary", "add", "--country", "US", "--currency", "USD"], {
      from: "user",
    });

    expect(stdoutSpy).toHaveBeenCalled();
    const output = stdoutSpy.mock.calls[0]?.[0] as string;
    const parsed = JSON.parse(output) as typeof sampleBeneficiary;
    expect(parsed).toEqual(sampleBeneficiary);
  });

  it("passes country, currency, and extra fields to createIntlBeneficiary", async () => {
    createIntlBeneficiaryMock.mockResolvedValue(sampleBeneficiary);

    const program = new Command();
    program.option("-o, --output <format>", "", "table");
    registerIntlBeneficiaryCommands(program);

    await program.parseAsync(
      [
        "intl",
        "beneficiary",
        "add",
        "--country",
        "US",
        "--currency",
        "USD",
        "--field",
        "account_number=123456",
        "--field",
        "routing_number=021000021",
      ],
      { from: "user" },
    );

    expect(createIntlBeneficiaryMock).toHaveBeenCalledWith(
      expect.anything(),
      {
        country: "US",
        currency: "USD",
        account_number: "123456",
        routing_number: "021000021",
      },
      expect.anything(),
    );
  });

  it("throws on invalid field format", async () => {
    const program = new Command();
    program.option("-o, --output <format>", "", "table");
    registerIntlBeneficiaryCommands(program);

    await expect(
      program.parseAsync(
        ["intl", "beneficiary", "add", "--country", "US", "--currency", "USD", "--field", "badfield"],
        { from: "user" },
      ),
    ).rejects.toThrow('Invalid field format: "badfield". Expected key=value.');
  });
});
