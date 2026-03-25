// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import type { Command } from "commander";
import { describe, expect, it } from "vitest";
import {
  createAttachmentCommand,
  createClientCommand,
  createClientInvoiceCommand,
  createCreditNoteCommand,
  createInternalTransferCommand,
  createLabelCommand,
  createMembershipCommand,
  createProgram,
  createQuoteCommand,
  createWebhookCommand,
  registerRequestCommands,
  registerStatementCommands,
  registerTransferCommands,
} from "@qontoctl/cli";

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
 * Build the full umbrella program with all commands registered,
 * mirroring packages/qontoctl/src/cli.ts without the parse/action wiring.
 */
function createUmbrellaProgram() {
  const program = createProgram();

  program.addCommand(createAttachmentCommand());
  program.addCommand(createClientCommand());
  program.addCommand(createClientInvoiceCommand());
  program.addCommand(createCreditNoteCommand());
  program.addCommand(createInternalTransferCommand());
  program.addCommand(createLabelCommand());
  program.addCommand(createMembershipCommand());
  program.addCommand(createQuoteCommand());
  program.addCommand(createWebhookCommand());
  registerRequestCommands(program);
  registerStatementCommands(program);
  registerTransferCommands(program);

  program.command("mcp").description("Start MCP server on stdio (for Claude Desktop, Cursor, etc.)");

  return program;
}

describe("qontoctl CLI", () => {
  it("creates program with correct name", () => {
    const program = createUmbrellaProgram();
    expect(program.name()).toBe("qontoctl");
  });

  describe("command tree registration", () => {
    it("registers all expected top-level commands", () => {
      const program = createUmbrellaProgram();
      const names = program.commands.map((c) => c.name());

      // Commands from createProgram()
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
      expect(names).toContain("intl");
      expect(names).toContain("profile");

      // Commands added by umbrella
      expect(names).toContain("attachment");
      expect(names).toContain("client");
      expect(names).toContain("client-invoice");
      expect(names).toContain("credit-note");
      expect(names).toContain("internal-transfer");
      expect(names).toContain("label");
      expect(names).toContain("membership");
      expect(names).toContain("quote");
      expect(names).toContain("webhook");
      expect(names).toContain("request");
      expect(names).toContain("statement");
      expect(names).toContain("transfer");
      expect(names).toContain("insurance");
      expect(names).toContain("mcp");
      expect(program.commands).toHaveLength(28);
    });

    it("commands have descriptions", () => {
      const program = createUmbrellaProgram();

      for (const cmd of program.commands) {
        expect(cmd.description(), `Command "${cmd.name()}" should have a description`).toBeTruthy();
      }
    });

    it("registers expected attachment subcommands", () => {
      const program = createUmbrellaProgram();
      const attachment = findCommand(program, "attachment");
      const names = attachment.commands.map((c) => c.name());

      expect(names).toContain("upload");
      expect(names).toContain("show");
      expect(attachment.commands).toHaveLength(2);
    });

    it("registers expected client subcommands", () => {
      const program = createUmbrellaProgram();
      const client = findCommand(program, "client");
      const names = client.commands.map((c) => c.name());

      expect(names).toContain("list");
      expect(names).toContain("show");
      expect(names).toContain("create");
      expect(names).toContain("update");
      expect(names).toContain("delete");
      expect(client.commands).toHaveLength(5);
    });

    it("registers expected client-invoice subcommands", () => {
      const program = createUmbrellaProgram();
      const clientInvoice = findCommand(program, "client-invoice");
      const names = clientInvoice.commands.map((c) => c.name());

      expect(names).toContain("list");
      expect(names).toContain("show");
      expect(names).toContain("create");
      expect(names).toContain("update");
      expect(names).toContain("delete");
      expect(names).toContain("finalize");
      expect(names).toContain("send");
      expect(names).toContain("mark-paid");
      expect(names).toContain("unmark-paid");
      expect(names).toContain("cancel");
      expect(names).toContain("upload");
      expect(names).toContain("upload-show");
      expect(clientInvoice.commands).toHaveLength(12);
    });

    it("registers expected credit-note subcommands", () => {
      const program = createUmbrellaProgram();
      const creditNote = findCommand(program, "credit-note");
      const names = creditNote.commands.map((c) => c.name());

      expect(names).toContain("list");
      expect(names).toContain("show");
      expect(creditNote.commands).toHaveLength(2);
    });

    it("registers expected internal-transfer subcommands", () => {
      const program = createUmbrellaProgram();
      const internalTransfer = findCommand(program, "internal-transfer");
      const names = internalTransfer.commands.map((c) => c.name());

      expect(names).toContain("create");
      expect(internalTransfer.commands).toHaveLength(1);
    });

    it("registers expected label subcommands", () => {
      const program = createUmbrellaProgram();
      const label = findCommand(program, "label");
      const names = label.commands.map((c) => c.name());

      expect(names).toContain("list");
      expect(names).toContain("show");
      expect(label.commands).toHaveLength(2);
    });

    it("registers expected membership subcommands", () => {
      const program = createUmbrellaProgram();
      const membership = findCommand(program, "membership");
      const names = membership.commands.map((c) => c.name());

      expect(names).toContain("list");
      expect(names).toContain("show");
      expect(names).toContain("invite");
      expect(membership.commands).toHaveLength(3);
    });

    it("registers expected quote subcommands", () => {
      const program = createUmbrellaProgram();
      const quote = findCommand(program, "quote");
      const names = quote.commands.map((c) => c.name());

      expect(names).toContain("list");
      expect(names).toContain("show");
      expect(names).toContain("create");
      expect(names).toContain("update");
      expect(names).toContain("delete");
      expect(names).toContain("send");
      expect(quote.commands).toHaveLength(6);
    });

    it("registers expected webhook subcommands", () => {
      const program = createUmbrellaProgram();
      const webhook = findCommand(program, "webhook");
      const names = webhook.commands.map((c) => c.name());

      expect(names).toContain("list");
      expect(names).toContain("show");
      expect(names).toContain("create");
      expect(names).toContain("update");
      expect(names).toContain("delete");
      expect(webhook.commands).toHaveLength(5);
    });

    it("registers expected request subcommands", () => {
      const program = createUmbrellaProgram();
      const request = findCommand(program, "request");
      const names = request.commands.map((c) => c.name());

      expect(names).toContain("list");
      expect(names).toContain("approve");
      expect(names).toContain("decline");
      expect(names).toContain("create-flash-card");
      expect(names).toContain("create-virtual-card");
      expect(names).toContain("create-multi-transfer");
      expect(request.commands).toHaveLength(6);
    });

    it("registers expected profile subcommands", () => {
      const program = createUmbrellaProgram();
      const profile = findCommand(program, "profile");
      const names = profile.commands.map((c) => c.name());

      expect(names).toContain("list");
      expect(names).toContain("show");
      expect(names).toContain("add");
      expect(names).toContain("remove");
      expect(names).toContain("test");
      expect(profile.commands).toHaveLength(5);
    });

    it("registers expected statement subcommands", () => {
      const program = createUmbrellaProgram();
      const statement = findCommand(program, "statement");
      const names = statement.commands.map((c) => c.name());

      expect(names).toContain("list");
      expect(names).toContain("show");
      expect(names).toContain("download");
      expect(statement.commands).toHaveLength(3);
    });

    it("registers expected transfer subcommands", () => {
      const program = createUmbrellaProgram();
      const transfer = findCommand(program, "transfer");
      const names = transfer.commands.map((c) => c.name());

      expect(names).toContain("list");
      expect(names).toContain("show");
      expect(names).toContain("create");
      expect(names).toContain("cancel");
      expect(names).toContain("proof");
      expect(names).toContain("verify-payee");
      expect(names).toContain("bulk-verify-payee");
      expect(transfer.commands).toHaveLength(7);
    });

    it("registers expected intl subcommands", () => {
      const program = createUmbrellaProgram();
      const intl = findCommand(program, "intl");
      const names = intl.commands.map((c) => c.name());

      expect(names).toContain("beneficiary");
      expect(names).toContain("transfer");
      expect(intl.commands).toHaveLength(2);
    });

    it("subcommands have descriptions", () => {
      const program = createUmbrellaProgram();

      for (const cmd of program.commands) {
        for (const sub of cmd.commands) {
          expect(sub.description(), `Subcommand "${cmd.name()} ${sub.name()}" should have a description`).toBeTruthy();
        }
      }
    });
  });
});
