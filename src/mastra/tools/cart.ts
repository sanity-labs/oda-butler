import { createTool } from "@mastra/core/tools";
import { outdent } from "outdent";
import { z } from "zod";
import { oda } from "../../lib/oda/instance.ts";
import type { RecurringSchedule } from "../../lib/oda/types.ts";

/**
 * "Next-delivery extras" is the regular Oda cart, but framed for the
 * agent in terms of how it actually behaves on a B2B account: it's a
 * scratchpad for one-off additions that ride along with the next
 * unlocked scheduled delivery. Around 12:00 the day before delivery,
 * Oda merges the recurring list + whatever is in the cart into the
 * actual order; the cart resets after.
 *
 * `getNextDeliveryExtras` is no longer registered on the agent (the
 * unified `get_next_delivery` tool subsumes it), but the definition is
 * kept for potential future use.
 */

export const getNextDeliveryExtras = createTool({
  id: "get_next_delivery_extras",
  description: outdent`
    List items currently staged as one-off additions to the next
    scheduled delivery. These ride along with the recurring order on
    the next unlocked drop and reset after; they don't recur.

    Returns:
    - items: the staged products with line prices and quantities.
    - totals: \`productCount\`, \`totalQuantity\`, \`subtotal\` (line sum),
      \`totalGross\` (Oda's calculated total including small-order
      fees), and \`currency\`. Use \`totalGross\` when the user asks
      "how much" — it's what they'll actually be charged.
    - schedule: the recurring order's schedule, so you can phrase
      something like "lands på neste levering, mandag 11. mai".
  `,
  inputSchema: z.object({}),
  execute: async () => {
    const [{ items, totals }, list] = await Promise.all([
      oda.getCartWithTotals(),
      oda.getRecurringList(),
    ]);
    return {
      items,
      totals,
      schedule: list?.schedule ?? null,
    };
  },
});

export const addToNextDelivery = createTool({
  id: "add_to_next_delivery",
  description: outdent`
    Add a product as a one-off to the next scheduled delivery, or change
    its quantity for that delivery. Idempotent: passing quantity 3
    always lands at 3, no matter what was there before.

    Use this when the user wants something on this week's drop without
    committing to it every week — e.g. "add a Snickers ice cream to
    next delivery", "throw two bags of chips on the next order",
    "another bottle of olive oil this week".

    For permanent additions to every recurring delivery, refer the
    user to the office manager; recurring is read-only.

    Before calling, run get_next_delivery so you know what's already
    staged in the cart and what the recurring template already covers.
    If the product is already on recurring, mention that to the user
    rather than silently double-stocking.

    Returns previousQuantity, quantity, and the next delivery date so
    you can phrase a precise confirmation like "Added 1× <name> til
    neste levering, mandag 11. mai".
  `,
  inputSchema: z.object({
    productId: z
      .number()
      .int()
      .describe(
        "Product ID from search_products, get_product, or get_next_delivery.",
      ),
    quantity: z
      .number()
      .int()
      .min(1)
      .describe("Target quantity for the next delivery (must be at least 1)."),
  }),
  execute: async (inputData) => {
    const [change, list] = await Promise.all([
      oda.setCartQuantity(inputData.productId, inputData.quantity),
      oda.getRecurringList(),
    ]);
    return summarizeChange(change, list?.schedule ?? null);
  },
});

export const removeFromNextDelivery = createTool({
  id: "remove_from_next_delivery",
  description: outdent`
    Remove a product from the one-off extras for the next delivery.
    Idempotent: removing a product that isn't staged is a no-op.

    Use this when the user wants to drop something they previously
    added for this week — e.g. "actually skip the Snickers", "drop
    the extra olive oil from this week's order".

    This only touches the per-delivery cart. To stop a product from
    coming on every recurring delivery, refer the user to the office
    manager; recurring is read-only.

    Returns previousQuantity so you can confirm what was dropped.
  `,
  inputSchema: z.object({
    productId: z
      .number()
      .int()
      .describe("Product ID from get_next_delivery or search_products."),
  }),
  execute: async (inputData) => {
    const [change, list] = await Promise.all([
      oda.setCartQuantity(inputData.productId, 0),
      oda.getRecurringList(),
    ]);
    return summarizeChange(change, list?.schedule ?? null);
  },
});

function summarizeChange(
  change: Awaited<ReturnType<typeof oda.setCartQuantity>>,
  schedule: RecurringSchedule | null,
) {
  return {
    productId: change.productId,
    name: change.name,
    previousQuantity: change.previousQuantity,
    quantity: change.quantity,
    schedule,
    totals: change.totals,
  };
}
