// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

/**
 * Parameters for creating a webhook subscription.
 */
export interface CreateWebhookParams {
  readonly callback_url: string;
  readonly types: readonly string[];
  readonly secret?: string;
  readonly description?: string;
}

/**
 * Parameters for updating a webhook subscription.
 */
export interface UpdateWebhookParams {
  readonly callback_url?: string;
  readonly types?: readonly string[];
  readonly secret?: string;
  readonly description?: string;
}
