import { afterEach, expect, test, vi } from "vitest";
import type { Product } from "../../lib/oda/types.ts";

// Mock `instance.ts` before importing the tools so tests don't pay the
// cost of `config.ts` validation (which would call process.exit when
// real Slack/Anthropic env vars aren't set in the test runner).
const searchProductsSpy = vi.fn();
vi.mock("../../lib/oda/instance.ts", () => ({
  oda: { searchProducts: searchProductsSpy },
}));

const { searchProducts } = await import("./products.ts");

const product = (
  id: number,
  price: number,
  relativePrice: number,
): Product => ({
  id,
  name: `P${id}`,
  subtitle: "",
  price,
  relativePrice,
  relativePriceUnit: "l",
  url: `https://oda.com/p/${id}`,
});

const stubResults = (items: Product[]) => {
  searchProductsSpy.mockResolvedValue({ pageUrl: "x", items, hasMore: false });
};

afterEach(() => {
  searchProductsSpy.mockReset();
});

// Mastra's tool.execute() type requires (input, options). Tests don't
// exercise the options at all, so we pass an empty stub.
type SearchInput = {
  query: string;
  page?: number;
  sort?:
    | "relevance"
    | "price-asc"
    | "price-desc"
    | "unit-price-asc"
    | "unit-price-desc";
  limit?: number;
};
type SearchResult = { items: Product[]; hasMore: boolean };

const run = (input: SearchInput): Promise<SearchResult> =>
  searchProducts.execute?.(
    input as never,
    {} as never,
  ) as Promise<SearchResult>;

test("search_products preserves Oda's relevance order by default", async () => {
  // Cheapest at index 2; relevance keeps it there.
  stubResults([product(1, 100, 50), product(2, 80, 40), product(3, 30, 60)]);
  const result = await run({ query: "x" });
  expect(result.items.map((i) => i.id)).toEqual([1, 2, 3]);
});

test("search_products sorts by absolute price when sort=price-asc", async () => {
  stubResults([product(1, 100, 50), product(2, 80, 40), product(3, 30, 60)]);
  const result = await run({ query: "x", sort: "price-asc" });
  expect(result.items.map((i) => i.id)).toEqual([3, 2, 1]);
});

test("search_products sorts by per-unit price when sort=unit-price-asc", async () => {
  // The cheapest absolute (id 3 at kr 30) is actually the worst per-unit
  // deal (kr 60/l). This is the value of unit-price sort: comparing what
  // you actually pay per liter, not per package.
  stubResults([product(1, 100, 50), product(2, 80, 40), product(3, 30, 60)]);
  const result = await run({ query: "x", sort: "unit-price-asc" });
  expect(result.items.map((i) => i.id)).toEqual([2, 1, 3]);
});

test("search_products limit caps the returned items, post-sort", async () => {
  stubResults([product(1, 100, 50), product(2, 80, 40), product(3, 30, 60)]);
  const result = await run({ query: "x", sort: "price-asc", limit: 2 });
  // After sort: [3, 2, 1]; limit to 2: [3, 2]
  expect(result.items.map((i) => i.id)).toEqual([3, 2]);
});
