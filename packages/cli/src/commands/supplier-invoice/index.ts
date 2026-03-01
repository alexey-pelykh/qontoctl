// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import type { Command } from "commander";
import { registerSupplierInvoiceListCommand } from "./list.js";
import { registerSupplierInvoiceShowCommand } from "./show.js";
import { registerSupplierInvoiceBulkCreateCommand } from "./bulk-create.js";

/**
 * Register the `supplier-invoice` command group with list, show, and bulk-create subcommands.
 */
export function registerSupplierInvoiceCommands(program: Command): void {
  const supplierInvoice = program.command("supplier-invoice").description("Manage supplier invoices");

  registerSupplierInvoiceListCommand(supplierInvoice);
  registerSupplierInvoiceShowCommand(supplierInvoice);
  registerSupplierInvoiceBulkCreateCommand(supplierInvoice);
}
