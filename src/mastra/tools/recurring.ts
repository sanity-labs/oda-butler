import { createTool } from "@mastra/core/tools";
import { outdent } from "outdent";
import { z } from "zod";
import { oda } from "../../lib/oda/instance.ts";

export const getRecurringOrder = createTool({
  id: "get_recurring_order",
  description: outdent`
    Read the office's recurring order (faste varer): items with
    quantities, the delivery schedule, and a per-delivery cost estimate.
    The recurring list is read-only context the agent reports on; it is
    owned by the office manager and not editable through this bot.

    Use this to answer "what's on faste varer?", "when's the next
    delivery?", or "how much do we spend per delivery?". For staging
    one-off additions onto the next delivery, use add_to_next_delivery
    instead.

    Returns:
    - items: products on the list with name, quantity, and line price.
    - productCount, totalQuantity: distinct products vs. total units.
    - estimatedTotal, currency: approximate cost per delivery, summed
      from item prices and quantities. Treat as approximate; Oda's
      actual delivery total can shift from fees, discounts, or
      out-of-stock substitutions. Null when items have no prices.
    - schedule: pre-formatted strings for next delivery date
      (\`nextDateLabel\`, e.g. "mandag 11. mai") and cadence (\`label\`,
      e.g. "hver mandag, neste mandag 11. mai").
  `,
  inputSchema: z.object({}),
  execute: () => oda.getRecurringList(),
});

/**
 * Not currently registered on the agent — the office manager owns the
 * recurring list, so the bot is scoped to cart-only mutations. Kept
 * here (along with removeRecurringItem) so a future office that wants
 * recurring edits can re-register them without re-implementing.
 */
export const updateRecurringItem = createTool({
  id: "update_recurring_item",
  description: outdent`
    Add a product to the recurring order, or change its per-delivery
    quantity. Idempotent: passing quantity 3 always lands at 3, no matter
    what was there before.

    Use this for both "add Pepsi" (quantity 1) and "add another Pepsi"
    (current+1). To delete a product, use remove_recurring_item instead.

    Returns previousQuantity and quantity so you can phrase a precise
    confirmation.
  `,
  inputSchema: z.object({
    productId: z
      .number()
      .int()
      .describe("Product ID from search_products or get_recurring_order."),
    quantity: z
      .number()
      .int()
      .min(1)
      .describe("Target quantity per delivery (must be at least 1)."),
  }),
  execute: async (inputData) => {
    const result = await oda.setRecurringQuantity(
      inputData.productId,
      inputData.quantity,
    );
    return summarizeChange(result);
  },
});

export const removeRecurringItem = createTool({
  id: "remove_recurring_item",
  description: outdent`
    Remove a product from the recurring order entirely. Idempotent:
    removing a product that isn't on the list is a no-op.

    Returns previousQuantity (what it was before removal) so you can
    confirm what was dropped.
  `,
  inputSchema: z.object({
    productId: z
      .number()
      .int()
      .describe("Product ID from search_products or get_recurring_order."),
  }),
  execute: async (inputData) => {
    const result = await oda.setRecurringQuantity(inputData.productId, 0);
    return summarizeChange(result);
  },
});

function summarizeChange(
  result: Awaited<ReturnType<typeof oda.setRecurringQuantity>>,
) {
  return {
    productId: result.productId,
    name: result.name,
    previousQuantity: result.previousQuantity,
    quantity: result.quantity,
    schedule: result.list.schedule,
    listProductCount: result.list.productCount,
  };
}
