import { createTool } from "@mastra/core/tools";
import { outdent } from "outdent";
import { z } from "zod";
import { oda } from "../../lib/oda/instance.ts";

export const getProduct = createTool({
  id: "get_product",
  description: outdent`
    Look up detailed info for a single product by ID:
    nutrition (per 100g/ml: energy, fat, carbs, sugar, protein, salt, etc.),
    ingredients, allergens, origin, supplier, storage, and a short
    supplier description.

    Use this when the user asks about nutritional content, ingredients,
    allergens, or country of origin.

    Returns null when the productId is unknown. Get the productId from
    search_products or get_recurring_order first.
  `,
  inputSchema: z.object({
    productId: z
      .number()
      .int()
      .describe("Product ID from search_products or get_recurring_order."),
  }),
  execute: (inputData) => oda.getProduct(inputData.productId),
});

export const searchProducts = createTool({
  id: "search_products",
  description: outdent`
    Search Oda's catalog for products. Norwegian and English queries
    both work.

    Returns up to ~24 products per page with id, name, subtitle, price,
    per-unit price, and url. Use the returned id with update_recurring_item,
    remove_recurring_item, or get_product.

    If hasMore is true, pass page=2, page=3, etc. to paginate.
  `,
  inputSchema: z.object({
    query: z
      .string()
      .min(1)
      .describe("e.g. 'melk', 'oat milk', 'pizzadeig', 'snickers ice cream'."),
    page: z
      .number()
      .int()
      .min(1)
      .optional()
      .describe("Page number, starting at 1. Omit for first page."),
  }),
  execute: async (inputData) => {
    const page = await oda.searchProducts(inputData.query, inputData.page);
    return {
      items: page.items,
      hasMore: page.hasMore,
    };
  },
});
