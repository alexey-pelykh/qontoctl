// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Command } from "commander";
import { registerIntlQuoteCommands } from "./index.js";

vi.mock("../../client.js", () => ({
  createClient: vi.fn(),
}));

vi.mock("@qontoctl/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@qontoctl/core")>();
  return {
    ...actual,
    createIntlQuote: vi.fn(),
  };
});

const { createClient } = await import("../../client.js");
const createClientMock = vi.mocked(createClient);

const { createIntlQuote } = await import("@qontoctl/core");
const createIntlQuoteMock = vi.mocked(createIntlQuote);

const sampleQuote = {
  id: "quote-1",
  source_currency: "EUR",
  target_currency: "USD",
  source_amount: 1000,
  target_amount: 1085.5,
  rate: 1.0855,
  fee_amount: 5.0,
  fee_currency: "EUR",
  expires_at: "2026-03-25T12:00:00Z",
};

describe("intl quote create command", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let stdoutSpy: any;

  beforeEach(() => {
    stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation((() => true) as never);
    createClientMock.mockResolvedValue({} as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("creates a quote in table format", async () => {
    createIntlQuoteMock.mockResolvedValue(sampleQuote);

    const program = new Command();
    program.option("-o, --output <format>", "", "table");
    registerIntlQuoteCommands(program);

    await program.parseAsync(["intl", "quote", "create", "--currency", "USD", "--amount", "1000"], { from: "user" });

    expect(createIntlQuoteMock).toHaveBeenCalledWith(expect.anything(), {
      currency: "USD",
      amount: 1000,
      direction: "send",
    });
    expect(stdoutSpy).toHaveBeenCalled();
    const output = stdoutSpy.mock.calls[0]?.[0] as string;
    expect(output).toContain("quote-1");
  });

  it("creates a quote in json format", async () => {
    createIntlQuoteMock.mockResolvedValue(sampleQuote);

    const program = new Command();
    program.option("-o, --output <format>", "", "json");
    registerIntlQuoteCommands(program);

    await program.parseAsync(["intl", "quote", "create", "--currency", "USD", "--amount", "1000"], { from: "user" });

    expect(stdoutSpy).toHaveBeenCalled();
    const output = stdoutSpy.mock.calls[0]?.[0] as string;
    const parsed = JSON.parse(output) as typeof sampleQuote;
    expect(parsed.id).toBe("quote-1");
    expect(parsed.rate).toBe(1.0855);
  });

  it("passes direction option when specified", async () => {
    createIntlQuoteMock.mockResolvedValue(sampleQuote);

    const program = new Command();
    program.option("-o, --output <format>", "", "json");
    registerIntlQuoteCommands(program);

    await program.parseAsync(
      ["intl", "quote", "create", "--currency", "USD", "--amount", "500", "--direction", "receive"],
      { from: "user" },
    );

    expect(createIntlQuoteMock).toHaveBeenCalledWith(expect.anything(), {
      currency: "USD",
      amount: 500,
      direction: "receive",
    });
  });
});
