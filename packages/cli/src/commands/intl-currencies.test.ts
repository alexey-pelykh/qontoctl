// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Command } from "commander";
import { registerIntlCurrenciesCommand } from "./intl-currencies.js";

vi.mock("../client.js", () => ({
  createClient: vi.fn(),
}));

vi.mock("@qontoctl/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@qontoctl/core")>();
  return {
    ...actual,
    listIntlCurrencies: vi.fn(),
  };
});

const { createClient } = await import("../client.js");
const createClientMock = vi.mocked(createClient);

const { listIntlCurrencies } = await import("@qontoctl/core");
const listIntlCurrenciesMock = vi.mocked(listIntlCurrencies);

const sampleCurrencies = [
  { code: "USD", name: "US Dollar", min_amount: 1, max_amount: 100000 },
  { code: "GBP", name: "British Pound", min_amount: 1, max_amount: 50000 },
  { code: "JPY", name: "Japanese Yen", min_amount: 100, max_amount: 10000000 },
];

describe("intl currencies command", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let stdoutSpy: any;

  beforeEach(() => {
    stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation((() => true) as never);
    createClientMock.mockResolvedValue({} as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("lists currencies in table format", async () => {
    listIntlCurrenciesMock.mockResolvedValue(sampleCurrencies);

    const program = new Command();
    program.option("-o, --output <format>", "", "table");
    registerIntlCurrenciesCommand(program);

    await program.parseAsync(["intl", "currencies"], { from: "user" });

    expect(listIntlCurrenciesMock).toHaveBeenCalled();
    expect(stdoutSpy).toHaveBeenCalled();
    const output = stdoutSpy.mock.calls[0]?.[0] as string;
    expect(output).toContain("USD");
    expect(output).toContain("GBP");
  });

  it("lists currencies in json format", async () => {
    listIntlCurrenciesMock.mockResolvedValue(sampleCurrencies);

    const program = new Command();
    program.option("-o, --output <format>", "", "json");
    registerIntlCurrenciesCommand(program);

    await program.parseAsync(["intl", "currencies"], { from: "user" });

    expect(stdoutSpy).toHaveBeenCalled();
    const output = stdoutSpy.mock.calls[0]?.[0] as string;
    const parsed = JSON.parse(output) as typeof sampleCurrencies;
    expect(parsed).toHaveLength(3);
    expect(parsed[0]?.code).toBe("USD");
  });

  it("filters currencies by search term", async () => {
    listIntlCurrenciesMock.mockResolvedValue(sampleCurrencies);

    const program = new Command();
    program.option("-o, --output <format>", "", "json");
    registerIntlCurrenciesCommand(program);

    await program.parseAsync(["intl", "currencies", "--search", "dollar"], { from: "user" });

    expect(stdoutSpy).toHaveBeenCalled();
    const output = stdoutSpy.mock.calls[0]?.[0] as string;
    const parsed = JSON.parse(output) as typeof sampleCurrencies;
    expect(parsed).toHaveLength(1);
    expect(parsed[0]?.code).toBe("USD");
  });
});
