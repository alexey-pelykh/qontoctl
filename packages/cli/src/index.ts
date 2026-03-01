// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

export { createProgram } from "./program.js";

export { registerProfileCommands } from "./commands/profile/index.js";

export {
  OUTPUT_FORMATS,
  type GlobalOptions,
  type OutputFormat,
  type PaginationOptions,
  type WriteOptions,
} from "./options.js";

export { formatOutput, formatCsv, formatJson, formatTable, formatYaml } from "./formatters/index.js";

export { fetchPage, fetchAllPages, fetchPaginated, type Page, type PaginatedResult } from "./pagination.js";

export type { PaginationMeta } from "@qontoctl/core";

export { createClient } from "./client.js";

export { handleCliError } from "./error-handler.js";

export { addInheritableOptions, addWriteOptions, resolveGlobalOptions } from "./inherited-options.js";

export {
  createCreditNoteCommand,
  createInternalTransferCommand,
  createLabelCommand,
  createMembershipCommand,
  createQuoteCommand,
  createRequestCommand,
} from "./commands/index.js";

export { registerStatementCommands } from "./commands/index.js";

export { registerBeneficiaryCommands } from "./commands/beneficiary/index.js";
export { registerTransactionCommands } from "./commands/transaction/index.js";
export { registerOrgCommands } from "./commands/index.js";
export { registerAccountCommands } from "./commands/index.js";
export { registerTransferCommands } from "./commands/index.js";
