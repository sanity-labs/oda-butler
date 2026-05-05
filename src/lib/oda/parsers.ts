import { compact } from "es-toolkit";
import { toFinite } from "es-toolkit/compat";
import { findDehydratedQuery, readPath } from "./next-data.ts";
import type {
  CartItem,
  DeliveryStep,
  Order,
  OrderDetails,
  OrderLineItem,
  Product,
  ProductPage,
  RecurringOrder,
  User,
} from "./types.ts";

export function parseProductPage(url: string, nextData: unknown): ProductPage {
  const data = findDehydratedQuery(
    nextData,
    "mixedSearch",
    "searchpageresponse",
  );
  const items = readPath<unknown[]>(data, "items");
  if (!Array.isArray(items)) {
    return { pageUrl: url, items: [], hasMore: false };
  }

  const products = compact(
    items.map((item) =>
      readPath<string>(item, "type") === "product" ? toProduct(item) : null,
    ),
  );

  return {
    pageUrl: url,
    items: products,
    hasMore: readPath<boolean>(data, "attributes.hasMoreItems") === true,
  };
}

export function parseCartResponse(data: unknown): CartItem[] {
  const top = readPath<unknown[]>(data, "items") ?? [];
  const groups = readPath<unknown[]>(data, "groups") ?? [];
  const grouped = groups.flatMap(
    (group) => readPath<unknown[]>(group, "items") ?? [],
  );
  return [...top, ...grouped].map(toCartItem);
}

export function parseRecurringResponse(data: unknown): RecurringOrder {
  return {
    productCount: readPath<number>(data, "product_quantity_count") ?? 0,
    items: parseCartResponse(data),
  };
}

/**
 * The /api/v1/orders/ endpoint groups orders by month. Flatten and order
 * newest-first so callers don't have to know about the grouping.
 */
export function parseOrdersResponse(data: unknown): Order[] {
  const months = readPath<unknown[]>(data, "results") ?? [];
  return months.flatMap((month) => {
    const orders = readPath<unknown[]>(month, "orders") ?? [];
    return compact(orders.map(toOrder));
  });
}

export function parseOrderDetail(data: unknown): OrderDetails | null {
  const summary = readPath<unknown>(data, "summary");
  const order = toOrder(summary);
  if (!order) return null;

  const itemGroups = readPath<unknown[]>(data, "items.item_groups") ?? [];
  const lineItems = itemGroups.flatMap((group) => {
    const category = readPath<string>(group, "name") ?? "";
    const groupItems = readPath<unknown[]>(group, "items") ?? [];
    return compact(groupItems.map((item) => toLineItem(item, category)));
  });

  return {
    ...order,
    productCount:
      readPath<number>(data, "items.product_count") ?? lineItems.length,
    items: lineItems,
  };
}

export function parseUser(nextData: unknown): User | null {
  const user = findDehydratedQuery(nextData, "user");
  const email = readPath<string>(user, "email");
  if (!email) return null;
  const firstName = readPath<string>(user, "firstName");
  const lastName = readPath<string>(user, "lastName");
  const fullName = compact([firstName, lastName]).join(" ") || email;
  return { email, firstName, lastName, fullName };
}

function toProduct(item: unknown): Product | null {
  const attributes = readPath<Record<string, unknown>>(item, "attributes");
  if (!attributes) return null;
  const id =
    readPath<number>(attributes, "id") ?? readPath<number>(item, "id") ?? 0;
  return {
    id,
    name: firstString(attributes, "fullName", "name") ?? "Unknown",
    subtitle: readPath<string>(attributes, "nameExtra") ?? "",
    price: toFinite(readPath(attributes, "grossPrice")),
    relativePrice: toFinite(readPath(attributes, "grossUnitPrice")),
    relativePriceUnit: unitSuffix(
      readPath(attributes, "unitPriceQuantityAbbreviation"),
    ),
    url: resolveProductUrl(attributes, id),
  };
}

function toCartItem(item: unknown): CartItem {
  const product = readPath<Record<string, unknown>>(item, "product") ?? {};
  const id = readPath<number>(product, "id") ?? 0;
  return {
    id,
    name: firstString(product, "full_name", "name") ?? "Unknown Product",
    subtitle: readPath<string>(product, "name_extra") ?? "",
    quantity: readPath<number>(item, "quantity") ?? 1,
    price: toFinite(readPath(product, "gross_price")),
    relativePrice: toFinite(readPath(product, "gross_unit_price")),
    relativePriceUnit: unitSuffix(
      readPath(product, "unit_price_quantity_abbreviation"),
    ),
    url: resolveProductUrl(product, id),
  };
}

function toOrder(raw: unknown): Order | null {
  const orderNumber = readPath<string>(raw, "order_number");
  if (!orderNumber) return null;

  const trackingStep = parseTrackingStep(
    readPath<string>(raw, "delivery.tracking.step_name"),
  );

  return {
    orderNumber,
    deliveryTime: readPath<string>(raw, "delivery.delivery_time") ?? "",
    deliveryAddress: readPath<string>(raw, "delivery.delivery_address") ?? "",
    statusText: readPath<string>(raw, "delivery.status_text") ?? "",
    trackingStep,
    isUpcoming: trackingStep !== "DELIVERED" && trackingStep !== "CANCELLED",
    total: toFinite(readPath(raw, "gross_amount")),
    currency: readPath<string>(raw, "currency") ?? "NOK",
  };
}

function toLineItem(item: unknown, category: string): OrderLineItem | null {
  const productId = readPath<number>(item, "product_id");
  if (productId == null) return null;
  return {
    productId,
    description: readPath<string>(item, "description") ?? "",
    quantity: readPath<number>(item, "quantity") ?? 0,
    total: toFinite(readPath(item, "gross_amount")),
    category,
    url: resolveProductUrl(item, productId),
  };
}

/**
 * Resolve a product URL from whatever shape the source payload uses. Search
 * results expose `frontUrl`/`absoluteUrl` (camelCase), the cart REST API
 * exposes `front_url`/`absolute_url` (snake_case), and order line items
 * expose neither. Falls back to the canonical search-by-id URL when nothing
 * is provided so the agent always has a link.
 */
function resolveProductUrl(source: unknown, productId: number): string {
  const direct = firstString(
    source,
    "frontUrl",
    "front_url",
    "absoluteUrl",
    "absolute_url",
  );
  if (direct)
    return direct.startsWith("http") ? direct : `https://oda.com${direct}`;
  return `https://oda.com/no/products/${productId}/`;
}

function parseTrackingStep(value: string | undefined): DeliveryStep {
  switch (value) {
    case "CONFIRMED":
    case "PACKING":
    case "EN_ROUTE":
    case "DELIVERED":
    case "CANCELLED":
      return value;
    default:
      return "OTHER";
  }
}

function firstString(source: unknown, ...paths: string[]): string | undefined {
  for (const path of paths) {
    const value = readPath<string>(source, path);
    if (typeof value === "string" && value) return value;
  }
  return undefined;
}

function unitSuffix(unit: unknown): string {
  return typeof unit === "string" && unit ? `/${unit}` : "";
}
