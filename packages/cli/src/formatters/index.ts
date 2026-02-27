// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import type { OutputFormat } from "../options.js";
import { formatCsv } from "./csv.js";
import { formatJson } from "./json.js";
import { formatTable } from "./table.js";
import { formatYaml } from "./yaml.js";

export { formatCsv } from "./csv.js";
export { formatJson } from "./json.js";
export { formatTable } from "./table.js";
export { formatYaml } from "./yaml.js";

/**
 * Route output formatting to the appropriate renderer based on the
 * selected output format.
 *
 * For `table` and `csv`, `data` must be an array of plain objects.
 * For `json` and `yaml`, any serializable value is accepted.
 */
export function formatOutput(data: unknown, format: OutputFormat): string {
  switch (format) {
    case "json":
      return formatJson(data);
    case "yaml":
      return formatYaml(data);
    case "csv":
      return formatCsv(data as Record<string, unknown>[]);
    case "table":
      return formatTable(data as Record<string, unknown>[]);
  }
}
