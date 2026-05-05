import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { oda } from "../../lib/oda/instance.ts";

export const searchProducts = createTool({
  id: "search_products",
  description: [
    "Search Oda's catalog for products. Norwegian and English queries both work.",
    "Returns up to ~24 products per page with id, name, subtitle, price, per-unit price, and url.",
    "Use the returned id with update_recurring_item or remove_recurring_item.",
    "If hasMore is true, pass page=2, page=3, etc. to paginate.",
  ].join(" "),
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
