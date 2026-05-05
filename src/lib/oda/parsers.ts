import { compact, mapValues } from "es-toolkit";
import { toFinite } from "es-toolkit/compat";
import type {
  WireCart,
  WireCartItem,
  WireOrderDetail,
  WireOrdersResponse,
  WireProduct,
  WireProductDetail,
  WireProductList,
  WireProductListSummary,
  WireProductListsPage,
  WireRecurringOrderMeta,
  WireSearchResponse,
} from "./api-types.ts";
import { findDehydratedQuery, readPath } from "./next-data.ts";
import type {
  CartItem,
  DeliveryStep,
  NutritionRow,
  Order,
  OrderDetails,
  OrderLineItem,
  Product,
  ProductDetails,
  ProductPage,
  RecurringList,
  RecurringOrder,
  RecurringSchedule,
  User,
} from "./types.ts";

/**
 * Parse the REST search response. Returns ~40 products per page; if the
 * total is larger than the returned page, `hasMore` is true so callers can
 * paginate via the `page` query param.
 */
export function parseSearchResponse(
  url: string,
  data: WireSearchResponse,
  page: number,
): ProductPage {
  const products = (data.products ?? []).map(toProduct);
  const totalHits = data.attributes?.total_hits ?? products.length;
  const hasMore = page * products.length < totalHits && products.length > 0;
  return { pageUrl: url, items: products, hasMore };
}

/**
 * Parse search results embedded in the `__NEXT_DATA__` of the HTML search
 * page. Used as a fuzzy-match fallback when the REST search returns zero
 * results: the HTML page does intent matching (e.g. "snickers ice cream"
 * → "Snickers-Is") that the REST endpoint doesn't.
 */
export function parseHtmlSearchPage(
  url: string,
  nextData: unknown,
): ProductPage {
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
      readPath<string>(item, "type") === "product"
        ? toProductFromHtmlEntry(item)
        : null,
    ),
  );
  return {
    pageUrl: url,
    items: products,
    hasMore: readPath<boolean>(data, "attributes.hasMoreItems") === true,
  };
}

/**
 * The HTML search page nests product fields under `attributes` and uses
 * camelCase keys, unlike everywhere else (cart, REST search, product detail)
 * which uses snake_case at the top level. We translate to a wire Product
 * shape and reuse `toProduct`.
 */
function toProductFromHtmlEntry(item: unknown): Product | null {
  const attributes = readPath<Record<string, unknown>>(item, "attributes");
  if (!attributes) return null;
  const id =
    readPath<number>(attributes, "id") ?? readPath<number>(item, "id") ?? 0;
  return {
    id,
    name: firstString(attributes, "fullName", "name") ?? "Unknown Product",
    subtitle: readPath<string>(attributes, "nameExtra") ?? "",
    price: toFinite(readPath(attributes, "grossPrice")),
    relativePrice: toFinite(readPath(attributes, "grossUnitPrice")),
    relativePriceUnit: unitSuffix(
      readPath(attributes, "unitPriceQuantityAbbreviation"),
    ),
    url: htmlEntryUrl(attributes, id),
  };
}

function htmlEntryUrl(
  attributes: Record<string, unknown>,
  productId: number,
): string {
  const direct = firstString(attributes, "frontUrl", "absoluteUrl");
  if (direct)
    return direct.startsWith("http") ? direct : `https://oda.com${direct}`;
  return `https://oda.com/no/products/${productId}/`;
}

/**
 * Map our domain field names to the Norwegian labels Oda uses in the
 * `contents_table` rows. Key here = our field, value = Oda's label.
 */
const CONTENTS_FIELD_LABELS = {
  ingredients: "Ingredienser",
  allergens: "Allergener",
  origin: "Opprinnelse",
  productionCountry: "Produksjonsland",
  supplier: "Leverandør",
  storage: "Oppbevaring",
  size: "Størrelse",
  shelfLifeGuarantee: "Holdbarhetsgaranti",
} as const;

/**
 * Flatten Oda's product detail into the agent-facing `ProductDetails` shape.
 * The wire response has nutrition and contents (ingredients, allergens,
 * origin, supplier, storage) under `detailed_info.local[0]` keyed by
 * Norwegian labels; we surface the common ones as named fields and stash
 * the rest under `facts` for the agent to format if needed.
 */
export function parseProductDetail(data: WireProductDetail): ProductDetails {
  const local = data.detailed_info?.local?.[0];
  const facts = factsFromRows(local?.contents_table?.rows);
  const fields = mapValues(
    CONTENTS_FIELD_LABELS,
    (label) => facts[label] ?? "",
  );

  return {
    ...toProduct(data),
    ...fields,
    isAvailable: data.availability?.is_available ?? false,
    availabilityNote: data.availability?.description ?? "",
    description:
      local?.description_from_supplier ?? local?.short_description ?? "",
    nutrition: nutritionRowsFrom(local?.nutrition_info_table?.rows),
    facts,
  };
}

function factsFromRows(
  rows: { key?: string; value?: string }[] | undefined,
): Record<string, string> {
  const facts: Record<string, string> = {};
  for (const row of rows ?? []) {
    if (row.key && row.value) facts[row.key] = row.value;
  }
  return facts;
}

function nutritionRowsFrom(
  rows: { key?: string; value?: string; indent?: number | null }[] | undefined,
): NutritionRow[] {
  return compact(
    (rows ?? []).map((row) =>
      row.key && row.value
        ? {
            label: row.key,
            value: row.value,
            indented: typeof row.indent === "number" && row.indent > 0,
          }
        : null,
    ),
  );
}

export function parseCartResponse(data: WireCart): CartItem[] {
  const top = data.items ?? [];
  const grouped = (data.groups ?? []).flatMap((group) => group.items ?? []);
  return [...top, ...grouped].map(toCartItem);
}

export function parseRecurringResponse(data: WireCart): RecurringOrder {
  return {
    productCount: data.product_quantity_count ?? 0,
    items: parseCartResponse(data),
  };
}

/**
 * Pick the active recurring list from `/api/v1/product-lists/`. B2B accounts
 * keep their recurring order as a product list with `recurring_order.is_active`
 * set; consumer accounts use the cart endpoint instead. Returns null when no
 * active recurring list exists.
 */
export function parseRecurringListsResponse(
  data: WireProductListsPage,
): RecurringList | null {
  const active = (data.results ?? []).find(
    (list) => list.recurring_order?.is_active === true,
  );
  return active ? toRecurringList(active) : null;
}

export function parseRecurringListDetail(
  data: WireProductList,
  schedule: RecurringSchedule | null,
): RecurringList {
  const items = data.items ?? [];
  return {
    id: data.id ?? 0,
    title: data.title ?? "",
    description: data.description ?? "",
    url: data.url ?? "",
    productCount: data.number_of_products ?? items.length,
    totalQuantity: data.total_quantity ?? 0,
    items: items.map(toCartItem),
    schedule,
  };
}

function toRecurringList(raw: WireProductListSummary): RecurringList {
  return {
    id: raw.id ?? 0,
    title: raw.title ?? "",
    description: raw.description ?? "",
    url: raw.url ?? "",
    productCount: raw.number_of_products ?? 0,
    totalQuantity: raw.total_quantity ?? 0,
    items: [],
    schedule: parseRecurringSchedule(raw.recurring_order ?? null),
  };
}

export function parseRecurringSchedule(
  raw: WireRecurringOrderMeta | null,
): RecurringSchedule | null {
  if (!raw) return null;
  const nextDate = raw.next_date ?? null;
  const params = parseEditUrlParams(raw.edit_url ?? "");
  const frequencyWeeks = params.frequency;
  const weekday = params.weekday;
  return {
    nextDate,
    frequencyWeeks,
    weekday,
    label: formatScheduleLabel({ nextDate, frequencyWeeks, weekday }),
  };
}

function parseEditUrlParams(editUrl: string): {
  frequency: number | null;
  weekday: number | null;
} {
  if (!editUrl) return { frequency: null, weekday: null };
  const query = editUrl.includes("?") ? editUrl.split("?")[1] : editUrl;
  const params = new URLSearchParams(query);
  const toInt = (value: string | null) => {
    if (!value) return null;
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : null;
  };
  return {
    frequency: toInt(params.get("frequency")),
    weekday: toInt(params.get("weekday")),
  };
}

const WEEKDAY_NAMES = [
  "",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

function formatScheduleLabel({
  nextDate,
  frequencyWeeks,
  weekday,
}: {
  nextDate: string | null;
  frequencyWeeks: number | null;
  weekday: number | null;
}): string {
  const day = weekdayName(weekday);
  const next = nextDate ? `next on ${nextDate}` : "";
  return compact([formatCadence(frequencyWeeks, day), next]).join(", ");
}

function weekdayName(weekday: number | null): string | null {
  if (!weekday || weekday < 1 || weekday > 7) return null;
  return WEEKDAY_NAMES[weekday] ?? null;
}

function formatCadence(weeks: number | null, day: string | null): string {
  if (weeks === 1) return day ? `every ${day}` : "weekly";
  if (weeks === 2) return day ? `every other ${day}` : "every other week";
  if (weeks && weeks > 2) return `every ${weeks} weeks`;
  return day ? `on ${day}s` : "";
}

/**
 * The /api/v1/orders/ endpoint groups orders by month. Flatten and order
 * newest-first so callers don't have to know about the grouping.
 */
export function parseOrdersResponse(data: WireOrdersResponse): Order[] {
  const months = data.results ?? [];
  return months.flatMap((month) => compact((month.orders ?? []).map(toOrder)));
}

export function parseOrderDetail(data: WireOrderDetail): OrderDetails | null {
  const order = data.summary ? toOrder(data.summary) : null;
  if (!order) return null;

  const itemGroups = data.items?.item_groups ?? [];
  const lineItems = itemGroups.flatMap((group) => {
    const category = group.name ?? "";
    return compact(
      (group.items ?? []).map((item) => toLineItem(item, category)),
    );
  });

  return {
    ...order,
    productCount: data.items?.product_count ?? lineItems.length,
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

function toProduct(product: WireProduct): Product {
  const id = product.id ?? 0;
  return {
    id,
    name: product.full_name ?? product.name ?? "Unknown Product",
    subtitle: product.name_extra ?? "",
    price: toFinite(product.gross_price),
    relativePrice: toFinite(product.gross_unit_price),
    relativePriceUnit: unitSuffix(product.unit_price_quantity_abbreviation),
    url: resolveProductUrl(product, id),
  };
}

function toCartItem(item: WireCartItem): CartItem {
  const product = item.product;
  return {
    ...toProduct(product),
    quantity: item.quantity,
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
 * Resolve a product URL. REST endpoints (search, cart, product-list, product
 * detail) expose `front_url` (absolute) and `absolute_url` (path-relative).
 * Order line items expose neither, so we fall back to the canonical
 * search-by-id URL.
 */
function resolveProductUrl(source: unknown, productId: number): string {
  const direct = firstString(source, "front_url", "absolute_url");
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
