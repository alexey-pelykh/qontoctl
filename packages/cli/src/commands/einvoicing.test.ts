// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Command } from "commander";
import { registerEInvoicingCommands } from "./einvoicing.js";

vi.mock("../client.js", () => ({
  createClient: vi.fn(),
}));

vi.mock("@qontoctl/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@qontoctl/core")>();
  return {
    ...actual,
    getEInvoicingSettings: vi.fn(),
  };
});

const { createClient } = await import("../client.js");
const createClientMock = vi.mocked(createClient);

const { getEInvoicingSettings } = await import("@qontoctl/core");
const getEInvoicingSettingsMock = vi.mocked(getEInvoicingSettings);

describe("registerEInvoicingCommands", () => {
  let stdoutSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    stdoutSpy = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    createClientMock.mockResolvedValue({} as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("registers an einvoicing command group", () => {
    const program = new Command();
    registerEInvoicingCommands(program);

    const einvoicingCommand = program.commands.find((c) => c.name() === "einvoicing");
    expect(einvoicingCommand).toBeDefined();
  });

  it("registers the settings subcommand under einvoicing", () => {
    const program = new Command();
    registerEInvoicingCommands(program);

    const einvoicingCommand = program.commands.find((c) => c.name() === "einvoicing");
    const settingsCommand = einvoicingCommand?.commands.find((c) => c.name() === "settings");
    expect(settingsCommand).toBeDefined();
    expect(settingsCommand?.description()).toBe("Show e-invoicing settings");
  });

  describe("einvoicing settings", () => {
    it("shows e-invoicing settings in table format", async () => {
      const settings = {
        sending_status: "enabled",
        receiving_status: "enabled",
      };
      getEInvoicingSettingsMock.mockResolvedValue(settings);

      const program = new Command();
      program.option("-o, --output <format>", "", "table");
      registerEInvoicingCommands(program);

      await program.parseAsync(["einvoicing", "settings"], { from: "user" });

      expect(stdoutSpy).toHaveBeenCalled();
      const output = stdoutSpy.mock.calls[0]?.[0] as string;
      expect(output).toContain("enabled");
      expect(output).toContain("sending_status");
      expect(output).toContain("receiving_status");
    });

    it("shows e-invoicing settings in json format", async () => {
      const settings = {
        sending_status: "enabled",
        receiving_status: "disabled",
      };
      getEInvoicingSettingsMock.mockResolvedValue(settings);

      const program = new Command();
      program.option("-o, --output <format>", "", "json");
      registerEInvoicingCommands(program);

      await program.parseAsync(["einvoicing", "settings"], { from: "user" });

      expect(stdoutSpy).toHaveBeenCalled();
      const output = stdoutSpy.mock.calls[0]?.[0] as string;
      const parsed = JSON.parse(output) as typeof settings;
      expect(parsed.sending_status).toBe("enabled");
      expect(parsed.receiving_status).toBe("disabled");
    });

    it("shows e-invoicing settings in yaml format", async () => {
      const settings = {
        sending_status: "enabled",
        receiving_status: "pending_creation",
      };
      getEInvoicingSettingsMock.mockResolvedValue(settings);

      const program = new Command();
      program.option("-o, --output <format>", "", "yaml");
      registerEInvoicingCommands(program);

      await program.parseAsync(["einvoicing", "settings"], { from: "user" });

      expect(stdoutSpy).toHaveBeenCalled();
      const output = stdoutSpy.mock.calls[0]?.[0] as string;
      expect(output).toContain("sending_status: enabled");
      expect(output).toContain("receiving_status: pending_creation");
    });
  });
});
