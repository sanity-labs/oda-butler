import { CookieJar } from "./cookie-jar.ts";
import { type Credentials, loadCredentials } from "./credentials.ts";
import { ensureOk } from "./errors.ts";
import { ODA_API_BASE, ODA_BASE_URL, OdaTransport } from "./http.ts";
import {
  parseCartResponse,
  parseOrderDetail,
  parseOrdersResponse,
  parseProductPage,
  parseRecurringListDetail,
  parseRecurringListsResponse,
  parseRecurringResponse,
  parseUser,
} from "./parsers.ts";
import type {
  CartItem,
  Order,
  OrderDetails,
  ProductPage,
  RecurringList,
  RecurringOrder,
  User,
} from "./types.ts";

const CART_API = `${ODA_API_BASE}/api/v1/cart/`;
const CART_ITEMS_API = `${ODA_API_BASE}/api/v1/cart/items/`;
const RECURRING_API = `${ODA_API_BASE}/api/v1/cart/recurring/`;
const RECURRING_ITEMS_API = `${ODA_API_BASE}/api/v1/cart/recurring/items/`;
const PRODUCT_LISTS_API = `${ODA_API_BASE}/api/v1/product-lists/`;
const ORDERS_API = `${ODA_API_BASE}/api/v1/orders/`;
const LOGIN_API = `${ODA_API_BASE}/api/v1/user/login/`;

export type OdaClientOptions = {
  /**
   * If provided, the client will silently re-authenticate on session expiry
   * instead of throwing. Defaults to reading `ODA_EMAIL`/`ODA_PASSWORD` from
   * the environment via `loadCredentials()`.
   */
  credentials?: Credentials | null;
};

export class OdaClient {
  readonly #cookies: CookieJar;
  readonly #http: OdaTransport;

  constructor(cookiePath: string, options: OdaClientOptions = {}) {
    this.#cookies = new CookieJar(cookiePath);
    this.#http = new OdaTransport(this.#cookies);

    const credentials =
      options.credentials === undefined
        ? loadCredentials()
        : options.credentials;
    if (credentials) {
      this.#http.setReloginHook(() =>
        this.login(credentials.email, credentials.password),
      );
    }
  }

  async searchProducts(query: string, page = 1): Promise<ProductPage> {
    const url = `${ODA_BASE_URL}/search/products/?q=${encodeURIComponent(query)}${
      page > 1 ? `&page=${page}` : ""
    }`;
    const nextData = await this.#http.fetchNextData(url);
    return parseProductPage(url, nextData);
  }

  async getCart(): Promise<CartItem[]> {
    const data = await this.#getJson(CART_API);
    return data ? parseCartResponse(data) : [];
  }

  async addToCart(productId: number, quantity = 1): Promise<void> {
    const response = await this.#http.postJson(CART_ITEMS_API, {
      items: [{ product_id: productId, quantity }],
    });
    await ensureOk(response, "Add to cart");
  }

  async removeFromCart(productId: number, quantity = 1): Promise<void> {
    const response = await this.#http.postJson(
      CART_ITEMS_API,
      { items: [{ product_id: productId, quantity: -quantity }] },
      `${ODA_BASE_URL}/cart/`,
    );
    await ensureOk(response, "Remove from cart");
  }

  async getOrders(): Promise<Order[]> {
    const data = await this.#getJson(ORDERS_API);
    return data ? parseOrdersResponse(data) : [];
  }

  async getOrderDetails(orderNumber: string): Promise<OrderDetails | null> {
    const url = `${ORDERS_API}${encodeURIComponent(orderNumber)}/`;
    const data = await this.#getJson(url);
    return data ? parseOrderDetail(data) : null;
  }

  /**
   * Oda doesn't expose a dedicated upcoming-delivery endpoint. We derive it:
   * the most recent order whose tracking is not in a terminal state.
   */
  async getNextDelivery(): Promise<Order | null> {
    const orders = await this.getOrders();
    return orders.find((o) => o.isUpcoming) ?? null;
  }

  async getRecurringOrder(): Promise<RecurringOrder> {
    const data = await this.#getJson(RECURRING_API);
    return data ? parseRecurringResponse(data) : { productCount: 0, items: [] };
  }

  /**
   * B2B accounts manage their recurring order as a product list. The list
   * index gives us schedule metadata (`next_date`, frequency, weekday); we
   * fetch the list detail separately to get full item data with prices.
   * Returns null when no list has an active recurring order.
   */
  async getRecurringList(): Promise<RecurringList | null> {
    const indexData = await this.#getJson(PRODUCT_LISTS_API);
    const summary = indexData ? parseRecurringListsResponse(indexData) : null;
    if (!summary) return null;

    const detailData = await this.#getJson(
      `${PRODUCT_LISTS_API}${summary.id}/`,
    );
    if (!detailData) return summary;
    return parseRecurringListDetail(detailData, summary.schedule);
  }

  async addToRecurring(productId: number, quantity = 1): Promise<void> {
    const response = await this.#http.postJson(
      RECURRING_ITEMS_API,
      { items: [{ product_id: productId, quantity }] },
      `${ODA_BASE_URL}/recurring/`,
    );
    await ensureOk(response, "Add to recurring");
  }

  /**
   * Recurring removes use signed quantity, same as the regular cart.
   * Pass a large quantity (e.g. 999) to remove the entire entry.
   */
  async removeFromRecurring(productId: number, quantity = 999): Promise<void> {
    const response = await this.#http.postJson(
      RECURRING_ITEMS_API,
      { items: [{ product_id: productId, quantity: -quantity }] },
      `${ODA_BASE_URL}/recurring/`,
    );
    await ensureOk(response, "Remove from recurring");
  }

  /**
   * Authenticate with email/password and persist the resulting session
   * cookies. The transport's relogin hook calls this internally with
   * `skipRelogin: true` to avoid recursion if Oda rejects the credentials.
   */
  async login(email: string, password: string): Promise<boolean> {
    await this.#http.request(`${ODA_BASE_URL}/user/login/`, {
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      redirect: "follow",
      skipRelogin: true,
    });
    const csrf = this.#cookies.csrfToken();
    const response = await this.#http.request(LOGIN_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: ODA_API_BASE,
        Referer: `${ODA_BASE_URL}/user/login/`,
        ...(csrf ? { "X-CSRFToken": csrf } : {}),
      },
      body: JSON.stringify({ username: email, password }),
      redirect: "manual",
      skipRelogin: true,
    });
    if (response.ok) {
      this.#cookies.save();
      return true;
    }
    return false;
  }

  async getUser(): Promise<User | null> {
    const nextData = await this.#http.fetchNextData(`${ODA_BASE_URL}/cart/`);
    return parseUser(nextData);
  }

  async #getJson(url: string): Promise<unknown> {
    const response = await this.#http.getJson(url);
    return response.ok ? response.json() : null;
  }
}
