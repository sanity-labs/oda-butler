/**
 * Domain types for the Oda integration.
 *
 * These are what the agent and tools see: camelCase, narrowed enums,
 * computed fields like `isUpcoming` and `RecurringSchedule.label` that
 * don't exist on the wire. They're intentionally separate from the
 * OpenAPI-generated wire shapes in `api-types.ts`.
 *
 * Translation between the two happens in `parsers.ts`. This is the
 * Anti-Corruption Layer pattern (Evans, *Domain-Driven Design*): when
 * Oda renames a field or adds a tracking state we've never seen, the
 * blast radius stops at the parsers.
 *
 * Rule of thumb:
 * - New field that's a renamed/cleaned version of a wire field → here.
 * - Computed/synthesized field (label, isUpcoming, narrowed enum) → here.
 * - Raw wire shape → `api-types.ts` (regen via `bun run gen:api-types`).
 */

export type Product = {
  id: number;
  name: string;
  subtitle: string;
  price: number;
  relativePrice: number;
  relativePriceUnit: string;
  url: string;
};

export type ProductPage = {
  pageUrl: string;
  items: Product[];
  hasMore: boolean;
};

export type NutritionRow = {
  /** Norwegian label, e.g. "Energi", "Fett", "Karbohydrater". */
  label: string;
  /** Pre-formatted value, e.g. "173 kJ / 41 kcal", "1 g". */
  value: string;
  /** True when the row is a sub-bullet under the previous one. */
  indented: boolean;
};

export type ProductDetails = Product & {
  isAvailable: boolean;
  availabilityNote: string;
  description: string;
  /** "Per 100g/ml" macros and micros, in Oda's order. May be empty. */
  nutrition: NutritionRow[];
  ingredients: string;
  allergens: string;
  origin: string;
  productionCountry: string;
  supplier: string;
  storage: string;
  size: string;
  shelfLifeGuarantee: string;
  /** Free-form extras keyed by their Norwegian label, in case the agent wants more. */
  facts: Record<string, string>;
};

export type CartItem = {
  id: number;
  name: string;
  subtitle: string;
  quantity: number;
  price: number;
  relativePrice: number;
  relativePriceUnit: string;
  url: string;
};

export type CartTotals = {
  /** Distinct product count, e.g. 31. */
  productCount: number;
  /** Sum of all item quantities (a 12-pack at qty 2 contributes 24). */
  totalQuantity: number;
  /** Total cost as Oda calculates it, including small-order fees. */
  totalGross: number;
  /** Pre-fee subtotal (sum of line totals). */
  subtotal: number;
  /** ISO 4217 currency code, e.g. "NOK". */
  currency: string;
};

export type DeliveryStep =
  | "CONFIRMED"
  | "PACKING"
  | "EN_ROUTE"
  | "DELIVERED"
  | "CANCELLED"
  | "OTHER";

export type Order = {
  orderNumber: string;
  deliveryTime: string;
  deliveryAddress: string;
  statusText: string;
  trackingStep: DeliveryStep;
  isUpcoming: boolean;
  total: number;
  currency: string;
};

export type OrderLineItem = {
  productId: number;
  description: string;
  quantity: number;
  total: number;
  category: string;
  url: string;
};

export type OrderDetails = Order & {
  productCount: number;
  items: OrderLineItem[];
};

export type RecurringOrder = {
  productCount: number;
  items: CartItem[];
};

export type RecurringSchedule = {
  /** ISO date (YYYY-MM-DD) of the next scheduled delivery. */
  nextDate: string | null;
  /** Norwegian-formatted next delivery date, e.g. "mandag 11. mai". */
  nextDateLabel: string | null;
  /** Weeks between deliveries. 1 = weekly, 2 = every other week. */
  frequencyWeeks: number | null;
  /** ISO weekday: 1=Mon, 2=Tue, ..., 7=Sun. */
  weekday: number | null;
  /** Human-readable label, e.g. "hver mandag, neste mandag 11. mai". */
  label: string;
};

export type RecurringList = {
  id: number;
  title: string;
  description: string;
  url: string;
  productCount: number;
  totalQuantity: number;
  /**
   * Estimated cost per delivery, summed from item prices and quantities.
   * Approximate: doesn't include fees, discounts, or out-of-stock
   * substitutions Oda may apply at order-creation time. The actual
   * delivery total can shift slightly. Null when no items have prices.
   */
  estimatedTotal: number | null;
  /** Currency for `estimatedTotal`. Null when no items. */
  currency: string | null;
  items: CartItem[];
  schedule: RecurringSchedule | null;
};

export type CartQuantityChange = {
  /** Cart contents after the change, top-of-list first. */
  cart: CartItem[];
  /** Cart-level totals (distinct products, total qty, gross, currency) after the change. */
  totals: CartTotals;
  productId: number;
  /** Resolved product name when known (from cart contents pre or post change). */
  name: string | null;
  previousQuantity: number;
  quantity: number;
};

export type RecurringQuantityChange = {
  list: RecurringList;
  productId: number;
  name: string | null;
  previousQuantity: number;
  quantity: number;
};

export type User = {
  email: string;
  firstName?: string;
  lastName?: string;
  fullName: string;
};
