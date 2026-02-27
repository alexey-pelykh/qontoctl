#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { createProgram } from "./program.js";
import { handleCliError } from "./error-handler.js";

const program = createProgram();

try {
  await program.parseAsync();
} catch (error: unknown) {
  handleCliError(error, program.opts()["debug"] === true);
}
