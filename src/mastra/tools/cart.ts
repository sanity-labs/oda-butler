import { createTool } from "@mastra/core/tools";
import { outdent } from "outdent";
import { z } from "zod";
import { oda } from "../../lib/oda/instance.ts";
import type { RecurringSchedule } from "../../lib/oda/types.ts";

/**
 * "Next-delivery extras" is the regular Oda cart, but framed for the
 * agent in terms of how it actually behaves on a B2B account: it's a
 * scratchpad for one-off additions that ride along with the next
 * scheduled recurring delivery. Two days before delivery, Oda merges
 * the recurring list + whatever is in the cart into the actual order;
 * the cart resets after.
 *
 * These tools are intentionally separate from the recurring tools so
 * the agent can pick the right one based on intent ("just this week"
 * vs. "every week from now on") without us having to encode that
 * distinction inside a single overloaded tool.
 */

export const getNextDeliveryExtras = createTool({
  id: "get_next_delivery_extras",
  description: outdent`
    List items currently staged as one-off additions to the next
    scheduled delivery. These ride along with the recurring order on the
    next drop and reset after — they don't recur.

    Use this for questions like "what's getting added this week?",
    "did anyone throw extras on the next order?", or before adding more
    one-offs so you can spot duplicates and bump quantities instead of
    creating a second line.

    For the recurring list itself (what we always order), use
    get_recurring_order.

    Returns the items, total distinct product count, and the schedule
    for the recurring order they'll piggyback on, so you can phrase a
    confirmation like "extras lands på neste levering, mandag 11. mai".
  `,
  inputSchema: z.object({}),
  execute: async () => {
    const [items, list] = await Promise.all([
      oda.getCart(),
      oda.getRecurringList(),
    ]);
    return {
      items,
      productCount: items.length,
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

    For permanent additions to every recurring delivery, use
    update_recurring_item instead.

    Before calling, run get_next_delivery_extras (and optionally
    get_recurring_order) so you know what's already staged. If the
    product is already on the recurring list, mention that to the user
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
        "Product ID from search_products, get_product, or get_recurring_order.",
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

    This only touches the per-delivery extras. To remove a product
    from the *recurring* list (so it stops coming every week), use
    remove_recurring_item instead.

    Returns previousQuantity so you can confirm what was dropped.
  `,
  inputSchema: z.object({
    productId: z
      .number()
      .int()
      .describe("Product ID from get_next_delivery_extras or search_products."),
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
    nextDeliveryProductCount: change.productCount,
  };
}
