import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { oda } from "../../lib/oda/instance.ts";

export const recurringGet = createTool({
  id: "recurring_get",
  description: "Get the active recurring order (faste varer) contents.",
  inputSchema: z.object({}),
  execute: () => oda.getRecurringOrder(),
});

export const recurringAddProduct = createTool({
  id: "recurring_add_product",
  description: "Add a product to the recurring order by product ID.",
  inputSchema: z.object({
    productId: z.number().int().describe("Product ID from products_search."),
    quantity: z.number().int().min(1).default(1),
  }),
  execute: async (inputData) => {
    await oda.addToRecurring(inputData.productId, inputData.quantity);
    return { success: true };
  },
});

export const recurringRemoveProduct = createTool({
  id: "recurring_remove_product",
  description:
    "Remove a product (or decrement quantity) from the recurring order.",
  inputSchema: z.object({
    productId: z.number().int(),
    quantity: z
      .number()
      .int()
      .min(1)
      .optional()
      .describe("How many to remove. Omit to remove the entire entry."),
  }),
  execute: async (inputData) => {
    await oda.removeFromRecurring(inputData.productId, inputData.quantity);
    return { success: true };
  },
});
