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
  /** Weeks between deliveries. 1 = weekly, 2 = every other week. */
  frequencyWeeks: number | null;
  /** ISO weekday: 1=Mon, 2=Tue, ..., 7=Sun. */
  weekday: number | null;
  /** Human-readable label, e.g. "every Monday, next on May 11". */
  label: string;
};

export type RecurringList = {
  id: number;
  title: string;
  description: string;
  url: string;
  productCount: number;
  totalQuantity: number;
  items: CartItem[];
  schedule: RecurringSchedule | null;
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
