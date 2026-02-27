// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, it, expect } from "vitest";
import { createProgram } from "./program.js";

describe("createProgram", () => {
  it("returns a Commander program with name 'qontoctl'", () => {
    const program = createProgram();
    expect(program.name()).toBe("qontoctl");
  });

  describe("global options", () => {
    it("parses --profile option", () => {
      const program = createProgram();
      program.parse(["--profile", "work"], { from: "user" });
      expect(program.opts()["profile"]).toBe("work");
    });

    it("parses --output option with valid format", () => {
      const program = createProgram();
      program.parse(["--output", "json"], { from: "user" });
      expect(program.opts()["output"]).toBe("json");
    });

    it("defaults --output to table", () => {
      const program = createProgram();
      program.parse([], { from: "user" });
      expect(program.opts()["output"]).toBe("table");
    });

    it("rejects invalid --output format", () => {
      const program = createProgram();
      program.exitOverride();
      expect(() => program.parse(["--output", "xml"], { from: "user" })).toThrow();
    });

    it("parses --sandbox flag", () => {
      const program = createProgram();
      program.parse(["--sandbox"], { from: "user" });
      expect(program.opts()["sandbox"]).toBe(true);
    });

    it("parses --verbose flag", () => {
      const program = createProgram();
      program.parse(["--verbose"], { from: "user" });
      expect(program.opts()["verbose"]).toBe(true);
    });

    it("parses --debug flag", () => {
      const program = createProgram();
      program.parse(["--debug"], { from: "user" });
      expect(program.opts()["debug"]).toBe(true);
    });

    it("parses short -p alias for --profile", () => {
      const program = createProgram();
      program.parse(["-p", "staging"], { from: "user" });
      expect(program.opts()["profile"]).toBe("staging");
    });

    it("parses short -o alias for --output", () => {
      const program = createProgram();
      program.parse(["-o", "yaml"], { from: "user" });
      expect(program.opts()["output"]).toBe("yaml");
    });
  });

  describe("pagination options", () => {
    it("parses --page option", () => {
      const program = createProgram();
      program.parse(["--page", "3"], { from: "user" });
      expect(program.opts()["page"]).toBe(3);
    });

    it("parses --per-page option", () => {
      const program = createProgram();
      program.parse(["--per-page", "50"], { from: "user" });
      expect(program.opts()["perPage"]).toBe(50);
    });

    it("defaults paginate to true", () => {
      const program = createProgram();
      program.parse([], { from: "user" });
      expect(program.opts()["paginate"]).toBe(true);
    });

    it("parses --no-paginate flag", () => {
      const program = createProgram();
      program.parse(["--no-paginate"], { from: "user" });
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
