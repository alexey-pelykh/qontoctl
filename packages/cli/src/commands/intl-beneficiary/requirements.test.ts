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
    getIntlBeneficiaryRequirements: vi.fn(),
  };
});

const { createClient } = await import("../../client.js");
const createClientMock = vi.mocked(createClient);

const { getIntlBeneficiaryRequirements } = await import("@qontoctl/core");
const getIntlBeneficiaryRequirementsMock = vi.mocked(getIntlBeneficiaryRequirements);

const sampleRequirements = {
  fields: [
    { key: "account_number", name: "Account Number", type: "string", example: "123456789" },
    { key: "routing_number", name: "Routing Number", type: "string" },
  ],
};

describe("intl beneficiary requirements command", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let stdoutSpy: any;

  beforeEach(() => {
    stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation((() => true) as never);
    createClientMock.mockResolvedValue({} as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows requirements in table format", async () => {
    getIntlBeneficiaryRequirementsMock.mockResolvedValue(sampleRequirements);

    const program = new Command();
    program.option("-o, --output <format>", "", "table");
    registerIntlBeneficiaryCommands(program);

    await program.parseAsync(["intl", "beneficiary", "requirements", "corridor-1"], { from: "user" });

    expect(stdoutSpy).toHaveBeenCalled();
    const output = stdoutSpy.mock.calls[0]?.[0] as string;
    expect(output).toContain("account_number");
    expect(output).toContain("Account Number");
    expect(output).toContain("routing_number");
  });

  it("shows requirements in json format", async () => {
    getIntlBeneficiaryRequirementsMock.mockResolvedValue(sampleRequirements);

    const program = new Command();
    program.option("-o, --output <format>", "", "json");
    registerIntlBeneficiaryCommands(program);

    await program.parseAsync(["intl", "beneficiary", "requirements", "corridor-1"], { from: "user" });

    expect(stdoutSpy).toHaveBeenCalled();
    const output = stdoutSpy.mock.calls[0]?.[0] as string;
    const parsed = JSON.parse(output) as typeof sampleRequirements;
    expect(parsed).toEqual(sampleRequirements);
  });

  it("passes the id to getIntlBeneficiaryRequirements", async () => {
    getIntlBeneficiaryRequirementsMock.mockResolvedValue(sampleRequirements);

    const program = new Command();
    program.option("-o, --output <format>", "", "table");
    registerIntlBeneficiaryCommands(program);

    await program.parseAsync(["intl", "beneficiary", "requirements", "corridor-42"], { from: "user" });

    expect(getIntlBeneficiaryRequirementsMock).toHaveBeenCalledWith(expect.anything(), "corridor-42");
  });
});
