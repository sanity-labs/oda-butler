import { expect, test } from "vitest";
import {
  parseCartResponse,
  parseCartTotals,
  parseOrderDetail,
  parseOrdersResponse,
  parseRecurringListDetail,
  parseRecurringListsResponse,
  parseRecurringResponse,
  parseSearchResponse,
  parseUser,
} from "./parsers.ts";

const searchResponse = {
  attributes: { total_hits: 197 },
  products: [
    {
      id: 8143,
      full_name: "Tine Lettmelk 1% fett",
      name: "Tine Lettmelk",
      name_extra: "1% fett, 1,75 l",
      gross_price: "31.90",
      gross_unit_price: "18.23",
      unit_price_quantity_abbreviation: "l",
      front_url: "https://oda.com/no/products/8143-tine-tine-lettmelk-1-fett/",
      currency: "NOK",
    },
  ],
  categories: [],
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

test("parseSearchResponse maps REST products and flags pagination", () => {
  const result = parseSearchResponse("https://oda.com/x", searchResponse, 1);
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

test("parseRecurringListsResponse picks the active recurring list and parses schedule", () => {
  const list = parseRecurringListsResponse({
    results: [
      {
        id: 1,
        title: "Inactive",
        recurring_order: { is_active: false, next_date: "2026-01-01" },
      },
      {
        id: 572919,
        title: "Ukentlig oppdatert",
        description: "Minimumsliste",
        url: "https://oda.com/no/account/lists/details/572919/",
        number_of_products: 69,
        total_quantity: 72,
        recurring_order: {
          id: 3686,
          is_active: true,
          next_date: "2026-05-11",
          edit_url:
            "/no/orders/recurring/572919/orders/3686/edit/?frequency=1&weekday=1&delivery_offering_id=695",
        },
      },
    ],
  });
  expect(list?.id).toBe(572919);
  expect(list?.productCount).toBe(69);
  expect(list?.schedule).toMatchObject({
    nextDate: "2026-05-11",
    nextDateLabel: "mandag 11. mai",
    frequencyWeeks: 1,
    weekday: 1,
    label: "hver mandag, neste mandag 11. mai",
  });
});

test("parseRecurringListsResponse returns null when nothing is active", () => {
  expect(
    parseRecurringListsResponse({
      results: [{ id: 1, recurring_order: { is_active: false } }],
    }),
  ).toBeNull();
});

test("parseRecurringListDetail merges items, schedule, and an estimated per-delivery total", () => {
  const detail = parseRecurringListDetail(
    {
      id: 572919,
      title: "Ukentlig oppdatert",
      number_of_products: 2,
      total_quantity: 4,
      items: [
        {
          quantity: 2,
          product: {
            id: 41014,
            full_name: "Pepsi Max brett 20 x 0,33L",
            gross_price: "234.00",
          },
        },
        {
          quantity: 2,
          product: {
            id: 8143,
            full_name: "Tine Lettmelk 1% fett",
            gross_price: "31.90",
          },
        },
      ],
    },
    {
      nextDate: "2026-05-11",
      nextDateLabel: "mandag 11. mai",
      frequencyWeeks: 2,
      weekday: 3,
      label: "annenhver onsdag, neste mandag 11. mai",
    },
  );
  expect(detail.items).toHaveLength(2);
  expect(detail.schedule?.label).toBe("annenhver onsdag, neste mandag 11. mai");
  // 2 × 234.00 + 2 × 31.90 = 531.80
  expect(detail.estimatedTotal).toBeCloseTo(531.8, 2);
  expect(detail.currency).toBe("NOK");
});

test("parseRecurringListDetail returns null totals when items have no prices", () => {
  // qty=0 dormant items shouldn't contribute, and an empty list shouldn't
  // pretend a price exists. The agent uses null to know it can't quote
  // a total.
  const detail = parseRecurringListDetail(
    {
      id: 1,
      title: "Empty",
      number_of_products: 0,
      total_quantity: 0,
      items: [],
    },
    null,
  );
  expect(detail.estimatedTotal).toBeNull();
  expect(detail.currency).toBeNull();
});

test("parseCartTotals sums line items and surfaces wire-provided gross total", () => {
  const totals = parseCartTotals({
    product_quantity_count: 3,
    total_gross_amount: "1114.20",
    currency: "NOK",
    groups: [
      {
        items: [
          {
            quantity: 12,
            product: {
              id: 8476,
              full_name: "R Hakkede tomater",
              gross_price: "17.40",
            },
          },
          {
            quantity: 1,
            product: {
              id: 556,
              full_name: "Idun Tomatketchup",
              gross_price: "13.90",
            },
          },
        ],
      },
    ],
  });
  expect(totals.productCount).toBe(3);
  expect(totals.totalQuantity).toBe(13);
  // 12 × 17.40 + 1 × 13.90 = 222.70
  expect(totals.subtotal).toBeCloseTo(222.7, 2);
  // total_gross_amount is what Oda actually charges, including small-order fees
  expect(totals.totalGross).toBeCloseTo(1114.2, 2);
  expect(totals.currency).toBe("NOK");
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

test("parseSearchResponse handles empty result", () => {
  const result = parseSearchResponse(
    "https://oda.com/x",
    { attributes: { total_hits: 0 }, products: [], categories: [] },
    1,
  );
  expect(result.items).toEqual([]);
  expect(result.hasMore).toBe(false);
});

test("parseSearchResponse hasMore is false on the last page", () => {
  const result = parseSearchResponse(
    "https://oda.com/x",
    {
      attributes: { total_hits: 1 },
      products: searchResponse.products,
      categories: [],
    },
    1,
  );
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
