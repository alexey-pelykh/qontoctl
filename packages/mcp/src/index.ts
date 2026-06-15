#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { buildStandaloneServerOptions } from "./standalone.js";
import { runStdioServer } from "./stdio.js";

// Standalone `qontoctl-mcp` entry point. The server options — the data-tool
// `getClient` factory plus the `resolveOptions` threaded into `diagnose` — are
// assembled once at startup, freezing the config-resolution destination and
// keeping `diagnose` in lockstep with the data tools. See
// `buildStandaloneServerOptions` for the freeze + lockstep rationale (#658, #661).
await runStdioServer(buildStandaloneServerOptions());
