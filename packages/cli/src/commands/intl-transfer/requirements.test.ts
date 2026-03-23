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
    getIntlTransferRequirements: vi.fn(),
  };
});

const { createClient } = await import("../../client.js");
const createClientMock = vi.mocked(createClient);

const { getIntlTransferRequirements } = await import("@qontoctl/core");
const getIntlTransferRequirementsMock = vi.mocked(getIntlTransferRequirements);

const sampleRequirements = {
  fields: [
    { key: "reference", name: "Reference", type: "text", example: "INV-001" },
    { key: "purpose_of_payment", name: "Purpose of payment", type: "text" },
  ],
};

describe("intl transfer requirements command", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let stdoutSpy: any;

  beforeEach(() => {
    stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation((() => true) as never);
    createClientMock.mockResolvedValue({} as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("fetches requirements in table format", async () => {
    getIntlTransferRequirementsMock.mockResolvedValue(sampleRequirements);

    const program = new Command();
    program.option("-o, --output <format>", "", "table");
    registerIntlTransferCommands(program);

    await program.parseAsync(["intl", "transfer", "requirements", "intl-ben-1"], { from: "user" });

    expect(getIntlTransferRequirementsMock).toHaveBeenCalledWith(expect.anything(), "intl-ben-1");
    expect(stdoutSpy).toHaveBeenCalled();
    const output = stdoutSpy.mock.calls[0]?.[0] as string;
    expect(output).toContain("reference");
    expect(output).toContain("purpose_of_payment");
  });

  it("fetches requirements in json format", async () => {
    getIntlTransferRequirementsMock.mockResolvedValue(sampleRequirements);

    const program = new Command();
    program.option("-o, --output <format>", "", "json");
    registerIntlTransferCommands(program);

    await program.parseAsync(["intl", "transfer", "requirements", "intl-ben-1"], { from: "user" });

    expect(stdoutSpy).toHaveBeenCalled();
    const output = stdoutSpy.mock.calls[0]?.[0] as string;
    const parsed = JSON.parse(output) as typeof sampleRequirements;
    expect(parsed.fields).toHaveLength(2);
    expect(parsed.fields[0]?.key).toBe("reference");
  });
});
