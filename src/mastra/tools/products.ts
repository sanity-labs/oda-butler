import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { oda } from "../../lib/oda/instance.ts";

export const productsSearch = createTool({
  id: "products_search",
  description:
    "Search Oda for products by query string. Norwegian and English both work.",
  inputSchema: z.object({
    query: z.string().describe("e.g. 'melk', 'oat milk', 'pizzadeig'"),
    page: z.number().int().min(1).optional(),
  }),
  execute: async (inputData) =>
    oda.searchProducts(inputData.query, inputData.page),
});
