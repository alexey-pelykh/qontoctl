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
    updateIntlBeneficiary: vi.fn(),
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

const { updateIntlBeneficiary } = await import("@qontoctl/core");
const updateIntlBeneficiaryMock = vi.mocked(updateIntlBeneficiary);

const sampleBeneficiary = {
  id: "intl-ben-1",
  name: "Updated Corp",
  country: "US",
  currency: "USD",
};

describe("intl beneficiary update command", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let stdoutSpy: any;

  beforeEach(() => {
    stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation((() => true) as never);
    createClientMock.mockResolvedValue({} as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("updates an intl beneficiary in table format", async () => {
    updateIntlBeneficiaryMock.mockResolvedValue(sampleBeneficiary);

    const program = new Command();
    program.option("-o, --output <format>", "", "table");
    registerIntlBeneficiaryCommands(program);

    await program.parseAsync(["intl", "beneficiary", "update", "intl-ben-1", "--field", "name=Updated Corp"], {
      from: "user",
    });

    expect(stdoutSpy).toHaveBeenCalled();
    const output = stdoutSpy.mock.calls[0]?.[0] as string;
    expect(output).toContain("intl-ben-1");
    expect(output).toContain("Updated Corp");
  });

  it("updates an intl beneficiary in json format", async () => {
    updateIntlBeneficiaryMock.mockResolvedValue(sampleBeneficiary);

    const program = new Command();
    program.option("-o, --output <format>", "", "json");
    registerIntlBeneficiaryCommands(program);

    await program.parseAsync(["intl", "beneficiary", "update", "intl-ben-1", "--field", "name=Updated Corp"], {
      from: "user",
    });

    expect(stdoutSpy).toHaveBeenCalled();
    const output = stdoutSpy.mock.calls[0]?.[0] as string;
    const parsed = JSON.parse(output) as typeof sampleBeneficiary;
    expect(parsed).toEqual(sampleBeneficiary);
  });

  it("passes id and fields to updateIntlBeneficiary", async () => {
    updateIntlBeneficiaryMock.mockResolvedValue(sampleBeneficiary);

    const program = new Command();
    program.option("-o, --output <format>", "", "table");
    registerIntlBeneficiaryCommands(program);

    await program.parseAsync(
      [
        "intl",
        "beneficiary",
        "update",
        "intl-ben-1",
        "--field",
        "name=Updated Corp",
        "--field",
        "account_number=999999",
      ],
      { from: "user" },
    );

    expect(updateIntlBeneficiaryMock).toHaveBeenCalledWith(
      expect.anything(),
      "intl-ben-1",
      {
        name: "Updated Corp",
        account_number: "999999",
      },
      expect.anything(),
    );
  });

  it("throws on invalid field format", async () => {
    const program = new Command();
    program.option("-o, --output <format>", "", "table");
    registerIntlBeneficiaryCommands(program);

    await expect(
      program.parseAsync(["intl", "beneficiary", "update", "intl-ben-1", "--field", "noequals"], {
        from: "user",
      }),
    ).rejects.toThrow('Invalid field format: "noequals". Expected key=value.');
  });
});
