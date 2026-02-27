// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const CLI_PATH = resolve(import.meta.dirname, "../../../qontoctl/dist/cli.js");

function hasZsh(): boolean {
  try {
    execFileSync("zsh", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

describe.skipIf(!hasZsh())("zsh completion (e2e)", () => {
  let tempDir: string;
  let completionScript: string;
  let scriptPath: string;

  beforeAll(() => {
    completionScript = execFileSync("node", [CLI_PATH, "completion", "zsh"], {
      encoding: "utf-8",
    });
    tempDir = mkdtempSync(join(tmpdir(), "qontoctl-zsh-e2e-"));
    scriptPath = join(tempDir, "_qontoctl");
    writeFileSync(scriptPath, completionScript);
  });

  afterAll(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("generates a sourceable script without errors", () => {
    // zsh -f disables all user startup files; source the completion script
    // and verify it loads without syntax errors
    execFileSync(
      "zsh",
      [
        "-f",
        "-c",
        ["autoload -Uz compinit", `fpath=("${tempDir}" $fpath)`, "compinit -u", `source "${scriptPath}"`].join("; "),
      ],
      { encoding: "utf-8" },
    );
  });

  it("defines the _qontoctl completion function", () => {
    const result = execFileSync(
      "zsh",
      [
        "-f",
        "-c",
        [
          "autoload -Uz compinit",
          `fpath=("${tempDir}" $fpath)`,
          "compinit -u",
          `source "${scriptPath}"`,
          'whence -w _qontoctl | grep "function"',
        ].join("; "),
      ],
      { encoding: "utf-8" },
    );
    expect(result).toContain("function");
  });

  it("starts with the #compdef directive", () => {
    expect(completionScript).toMatch(/^#compdef qontoctl/);
  });

  it("registers compdef for qontoctl", () => {
    expect(completionScript).toContain("compdef _qontoctl qontoctl");
  });

  it("includes top-level command descriptions", () => {
    expect(completionScript).toContain("completion:");
    expect(completionScript).toContain("org:");
    expect(completionScript).toContain("account:");
    expect(completionScript).toContain("transaction:");
    expect(completionScript).toContain("profile:");
  });

  it("includes option definitions for output format", () => {
    expect(completionScript).toContain("--output");
    expect(completionScript).toContain("--verbose");
  });
});
