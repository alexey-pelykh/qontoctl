// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Command } from "commander";
import { registerOrgCommands } from "./org.js";

vi.mock("../client.js", () => ({
  createClient: vi.fn(),
}));

vi.mock("@qontoctl/core", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@qontoctl/core")>();
  return {
    ...actual,
    getOrganization: vi.fn(),
  };
});

const { createClient } = await import("../client.js");
const createClientMock = vi.mocked(createClient);

const { getOrganization } = await import("@qontoctl/core");
const getOrganizationMock = vi.mocked(getOrganization);

describe("registerOrgCommands", () => {
  let stdoutSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    stdoutSpy = vi
      .spyOn(process.stdout, "write")
      .mockReturnValue(true);
    createClientMock.mockResolvedValue({} as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("registers an org command group", () => {
    const program = new Command();
    registerOrgCommands(program);

    const orgCommand = program.commands.find((c) => c.name() === "org");
    expect(orgCommand).toBeDefined();
  });

  it("registers the show subcommand under org", () => {
    const program = new Command();
    registerOrgCommands(program);

    const orgCommand = program.commands.find((c) => c.name() === "org");
    const showCommand = orgCommand?.commands.find(
      (c) => c.name() === "show",
    );
    expect(showCommand).toBeDefined();
    expect(showCommand?.description()).toBe("Show organization details");
  });

  describe("org show", () => {
    it("shows organization details in table format", async () => {
      const org = {
        slug: "acme-corp",
        legal_name: "ACME Corporation",
        bank_accounts: [
          { id: "acc-1", name: "Main", iban: "FR76", bic: "BNPA", currency: "EUR", balance: 1000, balance_cents: 100000, authorized_balance: 900, authorized_balance_cents: 90000, status: "active", main: true, organization_id: "org-1", slug: "main" },
          { id: "acc-2", name: "Savings", iban: "FR77", bic: "BNPA", currency: "EUR", balance: 5000, balance_cents: 500000, authorized_balance: 4900, authorized_balance_cents: 490000, status: "active", main: false, organization_id: "org-1", slug: "savings" },
        ],
      };
      getOrganizationMock.mockResolvedValue(org);

      const program = new Command();
      program.option("-o, --output <format>", "", "table");
      registerOrgCommands(program);

      await program.parseAsync(["org", "show"], { from: "user" });

      expect(stdoutSpy).toHaveBeenCalled();
      const output = stdoutSpy.mock.calls[0]?.[0] as string;
      expect(output).toContain("acme-corp");
      expect(output).toContain("ACME Corporation");
      expect(output).toContain("2");
    });

    it("shows organization details in json format", async () => {
      const org = {
        slug: "acme-corp",
        legal_name: "ACME Corporation",
        bank_accounts: [],
      };
      getOrganizationMock.mockResolvedValue(org);

      const program = new Command();
      program.option("-o, --output <format>", "", "json");
      registerOrgCommands(program);

      await program.parseAsync(["org", "show"], { from: "user" });

      expect(stdoutSpy).toHaveBeenCalled();
      const output = stdoutSpy.mock.calls[0]?.[0] as string;
      const parsed = JSON.parse(output) as typeof org;
      expect(parsed.slug).toBe("acme-corp");
      expect(parsed.legal_name).toBe("ACME Corporation");
      expect(parsed.bank_accounts).toEqual([]);
    });

    it("shows organization details in yaml format", async () => {
      const org = {
        slug: "acme-corp",
        legal_name: "ACME Corporation",
        bank_accounts: [],
      };
      getOrganizationMock.mockResolvedValue(org);

      const program = new Command();
      program.option("-o, --output <format>", "", "yaml");
      registerOrgCommands(program);

      await program.parseAsync(["org", "show"], { from: "user" });

      expect(stdoutSpy).toHaveBeenCalled();
      const output = stdoutSpy.mock.calls[0]?.[0] as string;
      expect(output).toContain("slug: acme-corp");
      expect(output).toContain("legal_name: ACME Corporation");
    });
  });
});
