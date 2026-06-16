#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { buildStandaloneServerOptions } from "./standalone.js";
import { runStdioServer } from "./stdio.js";

// Standalone `qontoctl-mcp` entry point. The server options — the data-tool
// `buildClient` factory plus the `resolveOptions` captured at startup — are
// assembled once, freezing the config-resolution destination. `createServer`
// derives ONE resolver from `resolveOptions` that both the data tools and
// `diagnose` resolve through, keeping them in lockstep. See
// `buildStandaloneServerOptions` for the freeze + lockstep rationale (#658, #661, #663).
await runStdioServer(buildStandaloneServerOptions());
