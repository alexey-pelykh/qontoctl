// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { stringify } from "yaml";

/**
 * Format data as YAML.
 */
export function formatYaml(data: unknown): string {
  return stringify(data, { lineWidth: 0 });
}
