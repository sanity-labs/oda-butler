import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { oda } from "../../lib/oda/instance.ts";

export const getRecurringOrder = createTool({
  id: "get_recurring_order",
  description: [
    "Read the office's recurring order (faste varer):",
    "items with quantities, the delivery schedule (frequency, weekday, next delivery date),",
    'and the human-readable schedule label like "every Monday, next on 2026-05-11".',
    "Call this before update_recurring_item or remove_recurring_item so you know what's already on the list.",
  ].join(" "),
  inputSchema: z.object({}),
  execute: () => oda.getRecurringList(),
});

export const updateRecurringItem = createTool({
  id: "update_recurring_item",
  description: [
    "Add a product to the recurring order, or change its per-delivery quantity.",
    "Idempotent: passing quantity 3 always lands at 3, no matter what was there before.",
    'Use this for both "add Pepsi" (quantity 1) and "add another Pepsi" (current+1).',
    "To delete a product, use remove_recurring_item instead.",
    "Returns previousQuantity and quantity so you can phrase a precise confirmation.",
  ].join(" "),
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
  description: [
    "Remove a product from the recurring order entirely.",
    "Idempotent: removing a product that isn't on the list is a no-op.",
    "Returns previousQuantity (what it was before removal) so you can confirm what was dropped.",
  ].join(" "),
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
