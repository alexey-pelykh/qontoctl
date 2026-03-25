// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { EInvoicingSettingsSchema } from "@qontoctl/core";
import { describe, expect, it } from "vitest";
import { cliCwd, cliEnv, hasCredentials } from "../sandbox.js";

const CLI_PATH = resolve(import.meta.dirname, "../../../qontoctl/dist/cli.js");

function cli(args: string[]): string {
  return execFileSync("node", [CLI_PATH, ...args], {
    encoding: "utf-8",
    env: cliEnv(),
    cwd: cliCwd(),
  });
}

describe.skipIf(!hasCredentials())("e-invoicing CLI (e2e)", () => {
  it("einvoicing settings displays settings in table format", () => {
    const output = cli(["einvoicing", "settings"]);
    expect(output).toContain("sending_status");
    expect(output).toContain("receiving_status");
  });

  it("einvoicing settings --output json produces valid JSON with expected fields", () => {
    const output = cli(["einvoicing", "settings", "--output", "json"]);
    const settings = JSON.parse(output) as Record<string, unknown>;
    EInvoicingSettingsSchema.parse(settings);
    expect(settings).toHaveProperty("sending_status");
    expect(settings).toHaveProperty("receiving_status");
    expect(typeof settings["sending_status"]).toBe("string");
    expect(typeof settings["receiving_status"]).toBe("string");
  });
});
