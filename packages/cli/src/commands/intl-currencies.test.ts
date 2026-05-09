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
  { country_code: "US", currency_code: "USD", suggestion_priority: 6 },
  { country_code: "GB", currency_code: "GBP", suggestion_priority: 5 },
  { country_code: "JP", currency_code: "JPY" },
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

    expect(listIntlCurrenciesMock).toHaveBeenCalledWith(expect.anything(), "EUR");
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
    expect(parsed[0]?.currency_code).toBe("USD");
  });

  it("passes the --source flag to listIntlCurrencies", async () => {
    listIntlCurrenciesMock.mockResolvedValue(sampleCurrencies);

    const program = new Command();
    program.option("-o, --output <format>", "", "json");
    registerIntlCurrenciesCommand(program);

    await program.parseAsync(["intl", "currencies", "--source", "USD"], { from: "user" });

    expect(listIntlCurrenciesMock).toHaveBeenCalledWith(expect.anything(), "USD");
  });

  it("filters currencies by --search term against currency_code", async () => {
    listIntlCurrenciesMock.mockResolvedValue(sampleCurrencies);

    const program = new Command();
    program.option("-o, --output <format>", "", "json");
    registerIntlCurrenciesCommand(program);

    await program.parseAsync(["intl", "currencies", "--search", "usd"], { from: "user" });

    expect(stdoutSpy).toHaveBeenCalled();
    const output = stdoutSpy.mock.calls[0]?.[0] as string;
    const parsed = JSON.parse(output) as typeof sampleCurrencies;
    expect(parsed).toHaveLength(1);
    expect(parsed[0]?.currency_code).toBe("USD");
  });

  it("filters currencies by --search term against country_code", async () => {
    listIntlCurrenciesMock.mockResolvedValue(sampleCurrencies);

    const program = new Command();
    program.option("-o, --output <format>", "", "json");
    registerIntlCurrenciesCommand(program);

    await program.parseAsync(["intl", "currencies", "--search", "JP"], { from: "user" });

    const output = stdoutSpy.mock.calls[0]?.[0] as string;
    const parsed = JSON.parse(output) as typeof sampleCurrencies;
    expect(parsed).toHaveLength(1);
    expect(parsed[0]?.currency_code).toBe("JPY");
  });
});
