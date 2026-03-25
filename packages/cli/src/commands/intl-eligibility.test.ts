// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Command } from "commander";
import { registerIntlEligibilityCommand } from "./intl-eligibility.js";

vi.mock("../client.js", () => ({
  createClient: vi.fn(),
}));

vi.mock("@qontoctl/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@qontoctl/core")>();
  return {
    ...actual,
    getIntlEligibility: vi.fn(),
  };
});

const { createClient } = await import("../client.js");
const createClientMock = vi.mocked(createClient);

const { getIntlEligibility } = await import("@qontoctl/core");
const getIntlEligibilityMock = vi.mocked(getIntlEligibility);

describe("intl eligibility command", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let stdoutSpy: any;

  beforeEach(() => {
    stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation((() => true) as never);
    createClientMock.mockResolvedValue({} as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("displays eligibility in table format", async () => {
    getIntlEligibilityMock.mockResolvedValue({ eligible: true });

    const program = new Command();
    program.option("-o, --output <format>", "", "table");
    registerIntlEligibilityCommand(program);

    await program.parseAsync(["intl", "eligibility"], { from: "user" });

    expect(getIntlEligibilityMock).toHaveBeenCalled();
    expect(stdoutSpy).toHaveBeenCalled();
    const output = stdoutSpy.mock.calls[0]?.[0] as string;
    expect(output).toContain("true");
  });

  it("displays eligibility with reason in json format", async () => {
    getIntlEligibilityMock.mockResolvedValue({ eligible: false, reason: "Not verified" });

    const program = new Command();
    program.option("-o, --output <format>", "", "json");
    registerIntlEligibilityCommand(program);

    await program.parseAsync(["intl", "eligibility"], { from: "user" });

    expect(stdoutSpy).toHaveBeenCalled();
    const output = stdoutSpy.mock.calls[0]?.[0] as string;
    const parsed = JSON.parse(output) as { eligible: boolean; reason: string };
    expect(parsed.eligible).toBe(false);
    expect(parsed.reason).toBe("Not verified");
  });
});
