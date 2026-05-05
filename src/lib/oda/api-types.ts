/**
 * Convenience re-exports of the OpenAPI-generated wire types. Parsers and
 * the HTTP client should consume these instead of `unknown` + `readPath`.
 *
 * Regenerate with `bun run gen:api-types` whenever `docs/oda-openapi.yaml`
 * changes.
 */
import type { components } from "./api-types.generated.ts";

type Schemas = components["schemas"];

export type WireCart = Schemas["Cart"];
export type WireCartItem = Schemas["CartItem"];
export type WireProduct = Schemas["Product"];
export type WireProductDetail = Schemas["ProductDetail"];
export type WireSearchResponse = Schemas["SearchResponse"];
export type WireBrand = Schemas["Brand"];
export type WireCategory = Schemas["Category"];
export type WireUserAddress = Schemas["UserAddress"];
export type WireUserPreferences = Schemas["UserPreferences"];
export type WireOrdersResponse = Schemas["OrdersResponse"];
export type WireOrderMonth = Schemas["OrderMonth"];
export type WireOrderSummary = Schemas["OrderSummary"];
export type WireOrderDetail = Schemas["OrderDetail"];
export type WireOrderLineItem = Schemas["OrderLineItem"];
export type WireOrderItemGroup = Schemas["OrderItemGroup"];
export type WireOrderTrackingStep = Schemas["OrderTrackingStep"];
export type WireProductList = Schemas["ProductList"];
export type WireProductListSummary = Schemas["ProductListSummary"];
export type WireProductListsPage = Schemas["ProductListsPage"];
export type WireRecurringOrderMeta = Schemas["RecurringOrderMeta"];
export type WireItemDelta = Schemas["ItemDelta"];
export type WireListError = Schemas["ListError"];
