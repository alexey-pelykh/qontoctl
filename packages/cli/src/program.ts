// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { Command } from "commander";

export function createProgram(): Command {
  const program = new Command();

  program
    .name("qontoctl")
    .description("The complete CLI & MCP for Qonto")
    .version("0.0.0");

  return program;
}
