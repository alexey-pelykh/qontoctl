// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, it, expect } from "vitest";
import { createProgram } from "./program.js";

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

    it("parses --sandbox flag", () => {
      const program = parseGlobalOptions(["--sandbox"]);
      expect(program.opts()["sandbox"]).toBe(true);
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
