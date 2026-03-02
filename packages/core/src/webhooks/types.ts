// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

/**
 * Parameters for creating a webhook subscription.
 */
export interface CreateWebhookParams {
  readonly url: string;
  readonly event_types: readonly string[];
}

/**
 * Parameters for updating a webhook subscription.
 */
export interface UpdateWebhookParams {
  readonly url?: string;
  readonly event_types?: readonly string[];
}
