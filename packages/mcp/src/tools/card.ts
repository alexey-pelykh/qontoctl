// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type {
  Card,
  CreateCardParams,
  HttpClient,
  PaginationMeta,
  UpdateCardLimitsParams,
  UpdateCardOptionsParams,
  UpdateCardRestrictionsParams,
} from "@qontoctl/core";
import {
  createCard,
  bulkCreateCards,
  lockCard,
  unlockCard,
  reportCardLost,
  reportCardStolen,
  discardCard,
  updateCardLimits,
  updateCardNickname,
  updateCardOptions,
  updateCardRestrictions,
  getCardIframeUrl,
  listCardAppearances,
} from "@qontoctl/core";
import { withClient } from "../errors.js";

interface PaginatedCardsResponse {
  readonly cards: readonly Card[];
  readonly meta: PaginationMeta;
}

interface SingleCardResponse {
  readonly card: Card;
}

export function registerCardTools(server: McpServer, getClient: () => Promise<HttpClient>): void {
  server.registerTool(
    "card_list",
    {
      description: "List cards in the organization",
      inputSchema: {
        query: z.string().optional().describe("Search by name, ID, last digits, etc."),
        holder_ids: z.array(z.string()).optional().describe("Filter by cardholder membership IDs"),
        statuses: z
          .array(
            z.enum([
              "pending",
              "live",
              "paused",
              "stolen",
              "lost",
              "pin_blocked",
              "discarded",
              "expired",
              "shipped_lost",
              "onhold",
              "order_canceled",
              "pre_expired",
              "abusive",
            ]),
          )
          .optional()
          .describe("Filter by card status"),
        bank_account_ids: z.array(z.string()).optional().describe("Filter by bank account IDs"),
        card_levels: z
          .array(z.enum(["standard", "plus", "metal", "virtual", "virtual_partner", "flash", "advertising"]))
          .optional()
          .describe("Filter by card level"),
        sort_by: z.string().optional().describe("Sort order (e.g. status:asc, created_at:desc)"),
        current_page: z.number().int().positive().optional().describe("Page number"),
        per_page: z.number().int().positive().max(100).optional().describe("Items per page (max 100)"),
      },
    },
    async (args) =>
      withClient(getClient, async (client) => {
        const params: Record<string, string | readonly string[]> = {};

        if (args.query !== undefined) params["query"] = args.query;
        if (args.holder_ids !== undefined && args.holder_ids.length > 0) params["holder_ids[]"] = args.holder_ids;
        if (args.statuses !== undefined && args.statuses.length > 0) params["statuses[]"] = args.statuses;
        if (args.bank_account_ids !== undefined && args.bank_account_ids.length > 0)
          params["bank_account_ids[]"] = args.bank_account_ids;
        if (args.card_levels !== undefined && args.card_levels.length > 0) params["card_levels[]"] = args.card_levels;
        if (args.sort_by !== undefined) params["sort_by"] = args.sort_by;
        if (args.current_page !== undefined) params["current_page"] = String(args.current_page);
        if (args.per_page !== undefined) params["per_page"] = String(args.per_page);

        const response = await client.get<PaginatedCardsResponse>(
          "/v2/cards",
          Object.keys(params).length > 0 ? params : undefined,
        );

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ cards: response.cards, meta: response.meta }, null, 2),
            },
          ],
        };
      }),
  );

  server.registerTool(
    "card_show",
    {
      description: "Show details of a specific card",
      inputSchema: {
        id: z.string().describe("Card ID (UUID)"),
      },
    },
    async ({ id }) =>
      withClient(getClient, async (client) => {
        const response = await client.get<SingleCardResponse>(`/v2/cards/${encodeURIComponent(id)}`);

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(response.card, null, 2),
            },
          ],
        };
      }),
  );

  server.registerTool(
    "card_create",
    {
      description: "Create a new card",
      inputSchema: {
        holder_id: z.string().describe("Cardholder membership ID"),
        initiator_id: z.string().describe("Order initiator membership ID"),
        organization_id: z.string().describe("Organization ID"),
        bank_account_id: z.string().describe("Bank account ID"),
        card_level: z
          .enum(["standard", "plus", "metal", "virtual", "virtual_partner", "flash", "advertising"])
          .describe("Card level"),
        ship_to_business: z.boolean().optional().describe("Ship card to organization address"),
        atm_option: z.boolean().optional().describe("Enable ATM withdrawals"),
        nfc_option: z.boolean().optional().describe("Enable contactless payments"),
        foreign_option: z.boolean().optional().describe("Enable international payments"),
        online_option: z.boolean().optional().describe("Enable online payments"),
        atm_monthly_limit: z.number().int().optional().describe("Monthly ATM withdrawal limit (EUR)"),
        atm_daily_limit_option: z.boolean().optional().describe("Enable daily ATM limit"),
        atm_daily_limit: z.number().int().optional().describe("Daily ATM withdrawal limit (EUR)"),
        payment_monthly_limit: z.number().int().optional().describe("Monthly payment limit (EUR)"),
        payment_daily_limit_option: z.boolean().optional().describe("Enable daily payment limit"),
        payment_daily_limit: z.number().int().optional().describe("Daily payment limit (EUR)"),
        payment_transaction_limit_option: z.boolean().optional().describe("Enable per-transaction limit"),
        payment_transaction_limit: z.number().int().optional().describe("Per-transaction limit (EUR)"),
        payment_lifespan_limit: z.number().int().optional().describe("Total spending cap (flash cards, EUR)"),
        pre_expires_at: z.string().optional().describe("Flash card validity end (ISO 8601)"),
        active_days: z.array(z.number().int().min(1).max(7)).optional().describe("Active weekdays (1=Mon, 7=Sun)"),
        categories: z.array(z.string()).optional().describe("Allowed merchant categories"),
        card_design: z.string().optional().describe("Card design identifier"),
        type_of_print: z.enum(["print", "embossed"]).optional().describe("Print type (Plus cards only)"),
      },
    },
    async (args) =>
      withClient(getClient, async (client) => {
        const params: CreateCardParams = {
          holder_id: args.holder_id,
          initiator_id: args.initiator_id,
          organization_id: args.organization_id,
          bank_account_id: args.bank_account_id,
          card_level: args.card_level,
          ...(args.ship_to_business !== undefined ? { ship_to_business: args.ship_to_business } : {}),
          ...(args.atm_option !== undefined ? { atm_option: args.atm_option } : {}),
          ...(args.nfc_option !== undefined ? { nfc_option: args.nfc_option } : {}),
          ...(args.foreign_option !== undefined ? { foreign_option: args.foreign_option } : {}),
          ...(args.online_option !== undefined ? { online_option: args.online_option } : {}),
          ...(args.atm_monthly_limit !== undefined ? { atm_monthly_limit: args.atm_monthly_limit } : {}),
          ...(args.atm_daily_limit_option !== undefined ? { atm_daily_limit_option: args.atm_daily_limit_option } : {}),
          ...(args.atm_daily_limit !== undefined ? { atm_daily_limit: args.atm_daily_limit } : {}),
          ...(args.payment_monthly_limit !== undefined ? { payment_monthly_limit: args.payment_monthly_limit } : {}),
          ...(args.payment_daily_limit_option !== undefined
            ? { payment_daily_limit_option: args.payment_daily_limit_option }
            : {}),
          ...(args.payment_daily_limit !== undefined ? { payment_daily_limit: args.payment_daily_limit } : {}),
          ...(args.payment_transaction_limit_option !== undefined
            ? { payment_transaction_limit_option: args.payment_transaction_limit_option }
            : {}),
          ...(args.payment_transaction_limit !== undefined
            ? { payment_transaction_limit: args.payment_transaction_limit }
            : {}),
          ...(args.payment_lifespan_limit !== undefined ? { payment_lifespan_limit: args.payment_lifespan_limit } : {}),
          ...(args.pre_expires_at !== undefined ? { pre_expires_at: args.pre_expires_at } : {}),
          ...(args.active_days !== undefined ? { active_days: args.active_days } : {}),
          ...(args.categories !== undefined ? { categories: args.categories } : {}),
          ...(args.card_design !== undefined ? { card_design: args.card_design } : {}),
          ...(args.type_of_print !== undefined ? { type_of_print: args.type_of_print } : {}),
        };

        const card = await createCard(client, params);

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(card, null, 2),
            },
          ],
        };
      }),
  );

  server.registerTool(
    "card_bulk_create",
    {
      description: "Bulk create cards (up to 50)",
      inputSchema: {
        cards: z
          .array(
            z.object({
              holder_id: z.string(),
              initiator_id: z.string(),
              organization_id: z.string(),
              bank_account_id: z.string(),
              card_level: z.string(),
              ship_to_business: z.boolean().optional(),
              payment_monthly_limit: z.number().int().optional(),
              atm_monthly_limit: z.number().int().optional(),
              atm_daily_limit_option: z.boolean().optional(),
              atm_daily_limit: z.number().int().optional(),
              payment_lifespan_limit: z.number().int().optional(),
              pre_expires_at: z.string().optional(),
            }),
          )
          .min(1)
          .max(50)
          .describe("Array of card definitions"),
      },
    },
    async ({ cards }) =>
      withClient(getClient, async (client) => {
        const params: CreateCardParams[] = cards.map((c) => ({
          holder_id: c.holder_id,
          initiator_id: c.initiator_id,
          organization_id: c.organization_id,
          bank_account_id: c.bank_account_id,
          card_level: c.card_level,
          ...(c.ship_to_business !== undefined ? { ship_to_business: c.ship_to_business } : {}),
          ...(c.payment_monthly_limit !== undefined ? { payment_monthly_limit: c.payment_monthly_limit } : {}),
          ...(c.atm_monthly_limit !== undefined ? { atm_monthly_limit: c.atm_monthly_limit } : {}),
          ...(c.atm_daily_limit_option !== undefined ? { atm_daily_limit_option: c.atm_daily_limit_option } : {}),
          ...(c.atm_daily_limit !== undefined ? { atm_daily_limit: c.atm_daily_limit } : {}),
          ...(c.payment_lifespan_limit !== undefined ? { payment_lifespan_limit: c.payment_lifespan_limit } : {}),
          ...(c.pre_expires_at !== undefined ? { pre_expires_at: c.pre_expires_at } : {}),
        }));

        const result = await bulkCreateCards(client, params);

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }),
  );

  server.registerTool(
    "card_lock",
    {
      description: "Lock a card",
      inputSchema: {
        id: z.string().describe("Card ID (UUID)"),
      },
    },
    async ({ id }) =>
      withClient(getClient, async (client) => {
        const card = await lockCard(client, id);

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(card, null, 2),
            },
          ],
        };
      }),
  );

  server.registerTool(
    "card_unlock",
    {
      description: "Unlock a card",
      inputSchema: {
        id: z.string().describe("Card ID (UUID)"),
      },
    },
    async ({ id }) =>
      withClient(getClient, async (client) => {
        const card = await unlockCard(client, id);

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(card, null, 2),
            },
          ],
        };
      }),
  );

  server.registerTool(
    "card_report_lost",
    {
      description: "Report a physical card as lost (irreversible)",
      inputSchema: {
        id: z.string().describe("Card ID (UUID)"),
      },
    },
    async ({ id }) =>
      withClient(getClient, async (client) => {
        const card = await reportCardLost(client, id);

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(card, null, 2),
            },
          ],
        };
      }),
  );

  server.registerTool(
    "card_report_stolen",
    {
      description: "Report a physical card as stolen (irreversible)",
      inputSchema: {
        id: z.string().describe("Card ID (UUID)"),
      },
    },
    async ({ id }) =>
      withClient(getClient, async (client) => {
        const card = await reportCardStolen(client, id);

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(card, null, 2),
            },
          ],
        };
      }),
  );

  server.registerTool(
    "card_discard",
    {
      description: "Discard a card (irreversible)",
      inputSchema: {
        id: z.string().describe("Card ID (UUID)"),
      },
    },
    async ({ id }) =>
      withClient(getClient, async (client) => {
        const card = await discardCard(client, id);

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(card, null, 2),
            },
          ],
        };
      }),
  );

  server.registerTool(
    "card_update_limits",
    {
      description: "Update a card's spending limits",
      inputSchema: {
        id: z.string().describe("Card ID (UUID)"),
        atm_monthly_limit: z.number().int().optional().describe("Monthly ATM withdrawal limit (EUR)"),
        atm_daily_limit_option: z.boolean().optional().describe("Enable daily ATM limit"),
        atm_daily_limit: z.number().int().optional().describe("Daily ATM withdrawal limit (EUR)"),
        payment_monthly_limit: z.number().int().optional().describe("Monthly payment limit (EUR)"),
        payment_daily_limit_option: z.boolean().optional().describe("Enable daily payment limit"),
        payment_daily_limit: z.number().int().optional().describe("Daily payment limit (EUR)"),
        payment_transaction_limit_option: z.boolean().optional().describe("Enable per-transaction limit"),
        payment_transaction_limit: z.number().int().optional().describe("Per-transaction limit (EUR)"),
        payment_lifespan_limit: z.number().int().optional().describe("Total spending cap (flash cards, EUR)"),
      },
    },
    async ({ id, ...fields }) =>
      withClient(getClient, async (client) => {
        const params: UpdateCardLimitsParams = {
          ...(fields.atm_monthly_limit !== undefined ? { atm_monthly_limit: fields.atm_monthly_limit } : {}),
          ...(fields.atm_daily_limit_option !== undefined
            ? { atm_daily_limit_option: fields.atm_daily_limit_option }
            : {}),
          ...(fields.atm_daily_limit !== undefined ? { atm_daily_limit: fields.atm_daily_limit } : {}),
          ...(fields.payment_monthly_limit !== undefined
            ? { payment_monthly_limit: fields.payment_monthly_limit }
            : {}),
          ...(fields.payment_daily_limit_option !== undefined
            ? { payment_daily_limit_option: fields.payment_daily_limit_option }
            : {}),
          ...(fields.payment_daily_limit !== undefined ? { payment_daily_limit: fields.payment_daily_limit } : {}),
          ...(fields.payment_transaction_limit_option !== undefined
            ? { payment_transaction_limit_option: fields.payment_transaction_limit_option }
            : {}),
          ...(fields.payment_transaction_limit !== undefined
            ? { payment_transaction_limit: fields.payment_transaction_limit }
            : {}),
          ...(fields.payment_lifespan_limit !== undefined
            ? { payment_lifespan_limit: fields.payment_lifespan_limit }
            : {}),
        };

        const card = await updateCardLimits(client, id, params);

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(card, null, 2),
            },
          ],
        };
      }),
  );

  server.registerTool(
    "card_update_nickname",
    {
      description: "Update a card's nickname",
      inputSchema: {
        id: z.string().describe("Card ID (UUID)"),
        nickname: z.string().min(1).max(40).describe("New nickname (1-40 characters)"),
      },
    },
    async ({ id, nickname }) =>
      withClient(getClient, async (client) => {
        const card = await updateCardNickname(client, id, nickname);

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(card, null, 2),
            },
          ],
        };
      }),
  );

  server.registerTool(
    "card_update_options",
    {
      description: "Update a card's options (ATM, NFC, online, foreign)",
      inputSchema: {
        id: z.string().describe("Card ID (UUID)"),
        atm_option: z.boolean().describe("Enable ATM withdrawals"),
        nfc_option: z.boolean().describe("Enable contactless payments"),
        online_option: z.boolean().describe("Enable online payments"),
        foreign_option: z.boolean().describe("Enable international payments"),
      },
    },
    async ({ id, ...fields }) =>
      withClient(getClient, async (client) => {
        const params: UpdateCardOptionsParams = {
          atm_option: fields.atm_option,
          nfc_option: fields.nfc_option,
          online_option: fields.online_option,
          foreign_option: fields.foreign_option,
        };

        const card = await updateCardOptions(client, id, params);

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(card, null, 2),
            },
          ],
        };
      }),
  );

  server.registerTool(
    "card_update_restrictions",
    {
      description: "Update a card's restrictions (active days, merchant categories)",
      inputSchema: {
        id: z.string().describe("Card ID (UUID)"),
        active_days: z
          .array(z.number().int().min(1).max(7))
          .optional()
          .describe("Active weekdays (1=Monday, 7=Sunday)"),
        categories: z
          .array(
            z.enum([
              "transport",
              "restaurant_and_bar",
              "food_and_grocery",
              "it_and_electronics",
              "utility",
              "tax",
              "legal_and_accounting",
              "atm",
              "office_supply",
              "hardware_and_equipment",
              "finance",
            ]),
          )
          .optional()
          .describe("Allowed merchant categories (empty array disables)"),
      },
    },
    async ({ id, ...fields }) =>
      withClient(getClient, async (client) => {
        const params: UpdateCardRestrictionsParams = {
          ...(fields.active_days !== undefined ? { active_days: fields.active_days } : {}),
          ...(fields.categories !== undefined ? { categories: fields.categories } : {}),
        };

        const card = await updateCardRestrictions(client, id, params);

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(card, null, 2),
            },
          ],
        };
      }),
  );

  server.registerTool(
    "card_iframe_url",
    {
      description: "Get secure iframe URL for viewing card details (PAN, CVV, expiry)",
      inputSchema: {
        id: z.string().describe("Card ID (UUID)"),
      },
    },
    async ({ id }) =>
      withClient(getClient, async (client) => {
        const url = await getCardIframeUrl(client, id);

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ iframe_url: url }, null, 2),
            },
          ],
        };
      }),
  );

  server.registerTool(
    "card_appearances",
    {
      description: "List available card appearances (designs by type and level)",
      inputSchema: {},
    },
    async () =>
      withClient(getClient, async (client) => {
        const appearances = await listCardAppearances(client);

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(appearances, null, 2),
            },
          ],
        };
      }),
  );
}
