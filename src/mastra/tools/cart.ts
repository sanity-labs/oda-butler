import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { oda } from "../../lib/oda/instance.ts";

export const cartGet = createTool({
  id: "cart_get",
  description: "Get the current shared shopping cart contents.",
  inputSchema: z.object({}),
  execute: () => oda.getCart(),
});

export const cartAddProduct = createTool({
  id: "cart_add_product",
  description: "Add a product to the shared cart by product ID.",
  inputSchema: z.object({
    productId: z.number().int().describe("Product ID from products_search."),
    quantity: z.number().int().min(1).default(1),
  }),
  execute: async (inputData) => {
    await oda.addToCart(inputData.productId, inputData.quantity);
    return { success: true };
  },
});

export const cartRemoveProduct = createTool({
  id: "cart_remove_product",
  description:
    "Remove (or decrement) a product from the shared cart by product ID.",
  inputSchema: z.object({
    productId: z.number().int(),
    quantity: z
      .number()
      .int()
      .min(1)
      .default(1)
      .describe("How many to remove. Pass a large number to remove all."),
  }),
  execute: async (inputData) => {
    await oda.removeFromCart(inputData.productId, inputData.quantity);
    return { success: true };
  },
});
