// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const CLI_PATH = resolve(import.meta.dirname, "../../../qontoctl/dist/cli.js");

function hasBash(): boolean {
  try {
    execFileSync("bash", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

describe.skipIf(!hasBash())("bash completion (e2e)", () => {
  let tempDir: string;
  let completionScript: string;
  let scriptPath: string;

  beforeAll(() => {
    completionScript = execFileSync("node", [CLI_PATH, "completion", "bash"], {
      encoding: "utf-8",
    });
    tempDir = mkdtempSync(join(tmpdir(), "qontoctl-bash-e2e-"));
    scriptPath = join(tempDir, "completion.bash");
    writeFileSync(scriptPath, completionScript);
  });

  afterAll(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  /**
   * Simulate bash completion by setting COMP_WORDS and COMP_CWORD,
   * calling the _qontoctl function, and returning COMPREPLY entries.
   */
  function complete(words: string[]): string[] {
    const compWords = words.map((w) => `"${w}"`).join(" ");
    const cword = words.length - 1;
    const testScript = [
      `source "${scriptPath}"`,
      `COMP_WORDS=(${compWords})`,
      `COMP_CWORD=${String(cword)}`,
      "_qontoctl",
      'printf "%s\\n" "${COMPREPLY[@]}"',
    ].join("\n");

    const result = execFileSync("bash", ["-c", testScript], {
      encoding: "utf-8",
    });
    return result.trim().split("\n").filter(Boolean);
  }

  it("generates a sourceable script without errors", () => {
    execFileSync("bash", ["-c", `source "${scriptPath}"`], {
      encoding: "utf-8",
    });
  });

  it("completes top-level commands when no input given", () => {
    const completions = complete(["qontoctl", ""]);
    expect(completions).toContain("completion");
    expect(completions).toContain("org");
    expect(completions).toContain("account");
    expect(completions).toContain("transaction");
    expect(completions).toContain("profile");
  });

  it("completes top-level options when dash prefix typed", () => {
    const completions = complete(["qontoctl", "-"]);
    expect(completions).toContain("--output");
    expect(completions).toContain("--verbose");
    expect(completions).toContain("--help");
    expect(completions).toContain("--version");
  });

  it("completes subcommands for a command", () => {
    const completions = complete(["qontoctl", "completion", ""]);
    expect(completions).toContain("bash");
    expect(completions).toContain("zsh");
    expect(completions).toContain("fish");
  });

  it("completes option choices for --output", () => {
    const completions = complete(["qontoctl", "--output", ""]);
    expect(completions).toContain("json");
    expect(completions).toContain("table");
    expect(completions).toContain("yaml");
    expect(completions).toContain("csv");
  });
});
