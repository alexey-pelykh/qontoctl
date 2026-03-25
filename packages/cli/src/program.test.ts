// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import type { Command } from "commander";
import { describe, it, expect } from "vitest";
import { createProgram } from "./program.js";

/**
 * Find a subcommand by name, throwing if absent so tests fail with a clear message.
 */
function findCommand(parent: Command, name: string): Command {
  const cmd = parent.commands.find((c) => c.name() === name);
  if (cmd === undefined) {
    throw new Error(`Expected command "${name}" not found among: ${parent.commands.map((c) => c.name()).join(", ")}`);
  }
  return cmd;
}

/**
 * Parse global options without requiring a subcommand.
 * Commander shows help and exits when no subcommand is provided,
 * so we use exitOverride() and catch the resulting error.
 * The options are still parsed before Commander looks for subcommands.
 */
function parseGlobalOptions(args: string[]) {
  const program = createProgram();
  program.exitOverride();
  try {
    program.parse(args, { from: "user" });
  } catch {
    // Commander throws when no subcommand is provided
  }
  return program;
}

describe("createProgram", () => {
  it("returns a Commander program with name 'qontoctl'", () => {
    const program = createProgram();
    expect(program.name()).toBe("qontoctl");
  });

  describe("command tree registration", () => {
    it("registers all expected top-level commands", () => {
      const program = createProgram();
      const names = program.commands.map((c) => c.name());

      expect(names).toContain("completion");
      expect(names).toContain("beneficiary");
      expect(names).toContain("card");
      expect(names).toContain("einvoicing");
      expect(names).toContain("auth");
      expect(names).toContain("transaction");
      expect(names).toContain("bulk-transfer");
      expect(names).toContain("recurring-transfer");
      expect(names).toContain("org");
      expect(names).toContain("account");
      expect(names).toContain("supplier-invoice");
      expect(names).toContain("team");
      expect(names).toContain("insurance");
      expect(names).toContain("intl");
      expect(names).toContain("payment-link");
      expect(names).toContain("profile");
      expect(program.commands).toHaveLength(16);
    });

    it("commands have descriptions", () => {
      const program = createProgram();

      for (const cmd of program.commands) {
        expect(cmd.description(), `Command "${cmd.name()}" should have a description`).toBeTruthy();
      }
    });

    it("registers expected completion subcommands", () => {
      const program = createProgram();
      const completion = findCommand(program, "completion");
      const names = completion.commands.map((c) => c.name());

      expect(names).toContain("bash");
      expect(names).toContain("zsh");
      expect(names).toContain("fish");
      expect(completion.commands).toHaveLength(3);
    });

    it("registers expected beneficiary subcommands", () => {
      const program = createProgram();
      const beneficiary = findCommand(program, "beneficiary");
      const names = beneficiary.commands.map((c) => c.name());

      expect(names).toContain("list");
      expect(names).toContain("show");
      expect(names).toContain("add");
      expect(names).toContain("update");
      expect(names).toContain("trust");
      expect(names).toContain("untrust");
      expect(beneficiary.commands).toHaveLength(6);
    });

    it("registers expected card subcommands", () => {
      const program = createProgram();
      const card = findCommand(program, "card");
      const names = card.commands.map((c) => c.name());

      expect(names).toContain("list");
      expect(names).toContain("create");
      expect(names).toContain("bulk-create");
      expect(names).toContain("lock");
      expect(names).toContain("unlock");
      expect(names).toContain("report-lost");
      expect(names).toContain("report-stolen");
      expect(names).toContain("discard");
      expect(names).toContain("update-limits");
      expect(names).toContain("update-nickname");
      expect(names).toContain("update-options");
      expect(names).toContain("update-restrictions");
      expect(names).toContain("iframe-url");
      expect(names).toContain("appearances");
      expect(card.commands).toHaveLength(14);
    });

    it("registers expected einvoicing subcommands", () => {
      const program = createProgram();
      const einvoicing = findCommand(program, "einvoicing");
      const names = einvoicing.commands.map((c) => c.name());

      expect(names).toContain("settings");
      expect(einvoicing.commands).toHaveLength(1);
    });

    it("registers expected auth subcommands", () => {
      const program = createProgram();
      const auth = findCommand(program, "auth");
      const names = auth.commands.map((c) => c.name());

      expect(names).toContain("setup");
      expect(names).toContain("login");
      expect(names).toContain("refresh");
      expect(names).toContain("status");
      expect(names).toContain("revoke");
      expect(auth.commands).toHaveLength(5);
    });

    it("registers expected transaction subcommands", () => {
      const program = createProgram();
      const transaction = findCommand(program, "transaction");
      const names = transaction.commands.map((c) => c.name());

      expect(names).toContain("list");
      expect(names).toContain("show");
      expect(names).toContain("attachment");
      expect(transaction.commands).toHaveLength(3);
    });

    it("registers expected transaction attachment subcommands", () => {
      const program = createProgram();
      const transaction = findCommand(program, "transaction");
      const attachment = findCommand(transaction, "attachment");
      const names = attachment.commands.map((c) => c.name());

      expect(names).toContain("list");
      expect(names).toContain("add");
      expect(names).toContain("remove");
      expect(attachment.commands).toHaveLength(3);
    });

    it("registers expected bulk-transfer subcommands", () => {
      const program = createProgram();
      const bulkTransfer = findCommand(program, "bulk-transfer");
      const names = bulkTransfer.commands.map((c) => c.name());

      expect(names).toContain("create");
      expect(names).toContain("list");
      expect(names).toContain("show");
      expect(bulkTransfer.commands).toHaveLength(3);
    });

    it("registers expected recurring-transfer subcommands", () => {
      const program = createProgram();
      const recurringTransfer = findCommand(program, "recurring-transfer");
      const names = recurringTransfer.commands.map((c) => c.name());

      expect(names).toContain("cancel");
      expect(names).toContain("create");
      expect(names).toContain("list");
      expect(names).toContain("show");
      expect(recurringTransfer.commands).toHaveLength(4);
    });

    it("registers expected org subcommands", () => {
      const program = createProgram();
      const org = findCommand(program, "org");
      const names = org.commands.map((c) => c.name());

      expect(names).toContain("show");
      expect(org.commands).toHaveLength(1);
    });

    it("registers expected account subcommands", () => {
      const program = createProgram();
      const account = findCommand(program, "account");
      const names = account.commands.map((c) => c.name());

      expect(names).toContain("list");
      expect(names).toContain("show");
      expect(names).toContain("iban-certificate");
      expect(names).toContain("create");
      expect(names).toContain("update");
      expect(names).toContain("close");
      expect(account.commands).toHaveLength(6);
    });

    it("registers expected supplier-invoice subcommands", () => {
      const program = createProgram();
      const supplierInvoice = findCommand(program, "supplier-invoice");
      const names = supplierInvoice.commands.map((c) => c.name());

      expect(names).toContain("list");
      expect(names).toContain("show");
      expect(names).toContain("bulk-create");
      expect(supplierInvoice.commands).toHaveLength(3);
    });

    it("registers expected team subcommands", () => {
      const program = createProgram();
      const team = findCommand(program, "team");
      const names = team.commands.map((c) => c.name());

      expect(names).toContain("list");
      expect(names).toContain("create");
      expect(team.commands).toHaveLength(2);
    });

    it("registers expected profile subcommands", () => {
      const program = createProgram();
      const profile = findCommand(program, "profile");
      const names = profile.commands.map((c) => c.name());

      expect(names).toContain("list");
      expect(names).toContain("show");
      expect(names).toContain("add");
      expect(names).toContain("remove");
      expect(names).toContain("test");
      expect(profile.commands).toHaveLength(5);
    });

    it("subcommands have descriptions", () => {
      const program = createProgram();

      for (const cmd of program.commands) {
        for (const sub of cmd.commands) {
          expect(sub.description(), `Subcommand "${cmd.name()} ${sub.name()}" should have a description`).toBeTruthy();
        }
      }
    });
  });

  describe("global options", () => {
    it("parses --profile option", () => {
      const program = parseGlobalOptions(["--profile", "work"]);
      expect(program.opts()["profile"]).toBe("work");
    });

    it("parses --output option with valid format", () => {
      const program = parseGlobalOptions(["--output", "json"]);
      expect(program.opts()["output"]).toBe("json");
    });

    it("defaults --output to table", () => {
      const program = parseGlobalOptions([]);
      expect(program.opts()["output"]).toBe("table");
    });

    it("rejects invalid --output format", () => {
      const program = createProgram();
      program.exitOverride();
      expect(() => program.parse(["--output", "xml"], { from: "user" })).toThrow();
    });

    it("parses --verbose flag", () => {
      const program = parseGlobalOptions(["--verbose"]);
      expect(program.opts()["verbose"]).toBe(true);
    });

    it("parses --debug flag", () => {
      const program = parseGlobalOptions(["--debug"]);
      expect(program.opts()["debug"]).toBe(true);
    });

    it("parses short -p alias for --profile", () => {
      const program = parseGlobalOptions(["-p", "staging"]);
      expect(program.opts()["profile"]).toBe("staging");
    });

    it("parses short -o alias for --output", () => {
      const program = parseGlobalOptions(["-o", "yaml"]);
      expect(program.opts()["output"]).toBe("yaml");
    });
  });

  describe("pagination options", () => {
    it("parses --page option", () => {
      const program = parseGlobalOptions(["--page", "3"]);
      expect(program.opts()["page"]).toBe(3);
    });

    it("parses --per-page option", () => {
      const program = parseGlobalOptions(["--per-page", "50"]);
      expect(program.opts()["perPage"]).toBe(50);
    });

    it("defaults paginate to true", () => {
      const program = parseGlobalOptions([]);
      expect(program.opts()["paginate"]).toBe(true);
    });

    it("parses --no-paginate flag", () => {
      const program = parseGlobalOptions(["--no-paginate"]);
      expect(program.opts()["paginate"]).toBe(false);
    });

    it("rejects non-integer --page value", () => {
      const program = createProgram();
      program.exitOverride();
      expect(() => program.parse(["--page", "abc"], { from: "user" })).toThrow();
    });

    it("rejects zero --page value", () => {
      const program = createProgram();
      program.exitOverride();
      expect(() => program.parse(["--page", "0"], { from: "user" })).toThrow();
    });

    it("rejects negative --per-page value", () => {
      const program = createProgram();
      program.exitOverride();
      expect(() => program.parse(["--per-page", "-5"], { from: "user" })).toThrow();
    });
  });
});
