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

export type User = {
  email: string;
  firstName?: string;
  lastName?: string;
  fullName: string;
};
