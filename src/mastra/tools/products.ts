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

const SORT_OPTIONS = [
  "relevance",
  "price-asc",
  "price-desc",
  "unit-price-asc",
  "unit-price-desc",
] as const;

export const searchProducts = createTool({
  id: "search_products",
  description: outdent`
    Search Oda's catalog for products. Norwegian and English queries
    both work.

    Returns up to ~24 products per page with id, name, subtitle, price,
    per-unit price, and url. Use the returned id with update_recurring_item,
    remove_recurring_item, add_to_next_delivery, or get_product.

    Optional sort and limit:
    - \`sort\` reorders the returned page client-side. Use "price-asc"
      for cheapest first ("cheapest beer"), "price-desc" for most
      expensive first, or "unit-price-asc" / "unit-price-desc" to
      compare by per-liter / per-kg price. Default is "relevance"
      (Oda's own ranking).
    - \`limit\` caps the items returned (1-24).

    Caveat on sort: Oda's API doesn't support server-side sorting, so
    \`sort\` only reorders the *current page*. "Cheapest beer overall"
    is approximate; the true cheapest might be on page 2. For most
    office use the first page is enough, since relevance already
    floats popular items to the top.

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
    sort: z
      .enum(SORT_OPTIONS)
      .optional()
      .describe(
        'Reorder the returned page. "price-asc" = cheapest first, "price-desc" = most expensive first, "unit-price-asc" / "unit-price-desc" = sort by kr/l or kr/kg. Default "relevance".',
      ),
    limit: z
      .number()
      .int()
      .min(1)
      .max(24)
      .optional()
      .describe("Cap the returned items (1-24). Omit to return all."),
  }),
  execute: async (inputData) => {
    const page = await oda.searchProducts(inputData.query, inputData.page);
    const sorted = sortProducts(page.items, inputData.sort);
    const limited =
      inputData.limit !== undefined ? sorted.slice(0, inputData.limit) : sorted;
    return {
      items: limited,
      hasMore: page.hasMore,
    };
  },
});

function sortProducts(
  items: Awaited<ReturnType<typeof oda.searchProducts>>["items"],
  sort: (typeof SORT_OPTIONS)[number] | undefined,
) {
  if (!sort || sort === "relevance") return items;
  // Don't mutate the caller's array.
  const out = [...items];
  switch (sort) {
    case "price-asc":
      return out.sort((a, b) => a.price - b.price);
    case "price-desc":
      return out.sort((a, b) => b.price - a.price);
    case "unit-price-asc":
      return out.sort((a, b) => a.relativePrice - b.relativePrice);
    case "unit-price-desc":
      return out.sort((a, b) => b.relativePrice - a.relativePrice);
  }
}
