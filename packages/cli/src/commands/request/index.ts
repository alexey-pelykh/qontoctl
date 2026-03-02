// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import type { Command } from "commander";
import { registerRequestListCommand } from "./list.js";
import { registerRequestApproveCommand } from "./approve.js";
import { registerRequestDeclineCommand } from "./decline.js";
import { registerRequestCreateFlashCardCommand } from "./create-flash-card.js";
import { registerRequestCreateVirtualCardCommand } from "./create-virtual-card.js";
import { registerRequestCreateMultiTransferCommand } from "./create-multi-transfer.js";

export function registerRequestCommands(program: Command): void {
  const request = program.command("request").description("Manage requests");

  registerRequestListCommand(request);
  registerRequestApproveCommand(request);
  registerRequestDeclineCommand(request);
  registerRequestCreateFlashCardCommand(request);
  registerRequestCreateVirtualCardCommand(request);
  registerRequestCreateMultiTransferCommand(request);
}
