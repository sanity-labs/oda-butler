import { expect, test } from "vitest";
import {
  parseCartResponse,
  parseOrderDetail,
  parseOrdersResponse,
  parseProductPage,
  parseRecurringResponse,
  parseUser,
} from "./parsers.ts";

const productPageNextData = {
  props: {
    pageProps: {
      dehydratedState: {
        queries: [
          {
            queryKey: [{ _id: "mixedSearch", query: { q: "melk" } }],
            state: {
              data: {
                attributes: { hasMoreItems: true, items: 40, page: 1 },
                items: [
                  {
                    id: 8143,
                    type: "product",
                    attributes: {
                      id: 8143,
                      fullName: "Tine Lettmelk 1% fett",
                      nameExtra: "1% fett, 1,75 l",
                      grossPrice: "31.90",
                      grossUnitPrice: "18.23",
                      unitPriceQuantityAbbreviation: "l",
                    },
                  },
                  { id: 999, type: "category", attributes: { name: "Drikke" } },
                ],
              },
            },
          },
        ],
      },
    },
  },
};

const cartResponse = {
  product_quantity_count: 2,
  groups: [
    {
      items: [
        {
          quantity: 2,
          product: {
            id: 26710,
            full_name: "TINE Julebrunost",
            name_extra: "Krydret, 500 g",
            gross_price: "64.90",
            gross_unit_price: "129.80",
            unit_price_quantity_abbreviation: "kg",
          },
        },
      ],
    },
  ],
};

const ordersResponse = {
  has_more: true,
  results: [
    {
      name: "Desember 2025",
      orders: [
        {
          order_number: "5fdnhy",
          gross_amount: 1224.7,
          currency: "NOK",
          delivery: {
            delivery_address: "Seilduksgata 9A, 0553 Oslo",
            delivery_time: "man 1. desember, 18:53",
            status_text: "Bestillingen din er levert",
            tracking: { step_name: "DELIVERED" },
          },
        },
      ],
    },
  ],
};

const orderDetailResponse = {
  summary: {
    order_number: "5fdnhy",
    gross_amount: 1224.7,
    currency: "NOK",
    delivery: {
      delivery_time: "man 1. desember, 18:53",
      delivery_address: "Seilduksgata 9A, 0553 Oslo",
      status_text: "Bestillingen din er levert",
      tracking: { step_name: "DELIVERED" },
    },
  },
  items: {
    product_count: 39,
    item_groups: [
      {
        type: "category",
        name: "Frukt og grønt",
        items: [
          {
            product_id: 8476,
            description: "R Hakkede tomater",
            quantity: 12,
            gross_amount: 201.6,
          },
        ],
      },
    ],
  },
};

const userNextData = {
  props: {
    pageProps: {
      dehydratedState: {
        queries: [
          {
            queryKey: ["user"],
            state: {
              data: {
                email: "test@example.com",
                firstName: "Ada",
                lastName: "Lovelace",
              },
            },
          },
        ],
      },
    },
  },
};

test("parseProductPage skips non-product items and reads attributes", () => {
  const result = parseProductPage("https://oda.com/x", productPageNextData);
  expect(result.items).toHaveLength(1);
  expect(result.items[0]).toMatchObject({
    id: 8143,
    name: "Tine Lettmelk 1% fett",
    price: 31.9,
    relativePrice: 18.23,
    relativePriceUnit: "/l",
  });
  expect(result.hasMore).toBe(true);
});

test("parseCartResponse flattens grouped items", () => {
  const items = parseCartResponse(cartResponse);
  expect(items).toHaveLength(1);
  expect(items[0]).toMatchObject({
    id: 26710,
    quantity: 2,
    name: "TINE Julebrunost",
    price: 64.9,
  });
});

test("parseRecurringResponse uses cart item parsing", () => {
  const recurring = parseRecurringResponse(cartResponse);
  expect(recurring.productCount).toBe(2);
  expect(recurring.items).toHaveLength(1);
});

test("parseOrdersResponse flattens months and marks delivered orders not upcoming", () => {
  const orders = parseOrdersResponse(ordersResponse);
  expect(orders).toHaveLength(1);
  expect(orders[0]).toMatchObject({
    orderNumber: "5fdnhy",
    total: 1224.7,
    trackingStep: "DELIVERED",
    isUpcoming: false,
  });
});

test("parseOrdersResponse flags non-terminal orders as upcoming", () => {
  const upcoming = parseOrdersResponse({
    results: [
      {
        orders: [
          {
            order_number: "abc123",
            gross_amount: 500,
            delivery: { tracking: { step_name: "PACKING" } },
          },
        ],
      },
    ],
  });
  expect(upcoming[0]?.isUpcoming).toBe(true);
  expect(upcoming[0]?.trackingStep).toBe("PACKING");
});

test("parseOrderDetail returns order with line items", () => {
  const detail = parseOrderDetail(orderDetailResponse);
  expect(detail).not.toBeNull();
  expect(detail?.orderNumber).toBe("5fdnhy");
  expect(detail?.productCount).toBe(39);
  expect(detail?.items[0]).toMatchObject({
    productId: 8476,
    description: "R Hakkede tomater",
    quantity: 12,
    category: "Frukt og grønt",
  });
});

test("parseUser handles object queryKey shape", () => {
  const user = parseUser(userNextData);
  expect(user).toEqual({
    email: "test@example.com",
    firstName: "Ada",
    lastName: "Lovelace",
    fullName: "Ada Lovelace",
  });
});

test("parseUser falls back to email when name is missing", () => {
  const user = parseUser({
    props: {
      pageProps: {
        dehydratedState: {
          queries: [
            {
              queryKey: ["user"],
              state: { data: { email: "noname@example.com" } },
            },
          ],
        },
      },
    },
  });
  expect(user?.fullName).toBe("noname@example.com");
});

test("parseProductPage returns empty result for missing data", () => {
  const result = parseProductPage("https://oda.com/x", null);
  expect(result.items).toEqual([]);
  expect(result.hasMore).toBe(false);
});

test("parseOrdersResponse maps unknown step to OTHER", () => {
  const orders = parseOrdersResponse({
    results: [
      {
        orders: [
          {
            order_number: "z",
            delivery: { tracking: { step_name: "WEIRD_NEW_VALUE" } },
          },
        ],
      },
    ],
  });
  expect(orders[0]?.trackingStep).toBe("OTHER");
  expect(orders[0]?.isUpcoming).toBe(true);
});
