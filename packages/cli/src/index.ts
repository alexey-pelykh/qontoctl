// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

export { createProgram } from "./program.js";

export { registerProfileCommands } from "./commands/profile/index.js";

export {
  OUTPUT_FORMATS,
  type GlobalOptions,
  type OutputFormat,
  type PaginationOptions,
} from "./options.js";

export {
  formatOutput,
  formatCsv,
  formatJson,
  formatTable,
  formatYaml,
} from "./formatters/index.js";

export {
  fetchPage,
  fetchAllPages,
  fetchPaginated,
  type Page,
  type PaginatedResult,
  type PaginationMeta,
} from "./pagination.js";

export { createClient } from "./client.js";

export {
  createLabelCommand,
  createMembershipCommand,
} from "./commands/index.js";

export { registerStatementCommands } from "./commands/index.js";
