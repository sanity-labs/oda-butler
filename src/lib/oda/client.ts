import { CookieJar } from "./cookie-jar.ts";
import { type Credentials, loadCredentials } from "./credentials.ts";
import { ensureOk, extractListError } from "./errors.ts";
import { ODA_API_BASE, ODA_BASE_URL, OdaTransport } from "./http.ts";
import type {
  WireCart,
  WireOrderDetail,
  WireOrdersResponse,
  WireProductDetail,
  WireProductList,
  WireProductListsPage,
  WireSearchResponse,
} from "./api-types.ts";
import {
  parseCartResponse,
  parseHtmlSearchPage,
  parseOrderDetail,
  parseOrdersResponse,
  parseProductDetail,
  parseRecurringListDetail,
  parseRecurringListsResponse,
  parseRecurringResponse,
  parseRecurringSchedule,
  parseSearchResponse,
  parseUser,
} from "./parsers.ts";
import type {
  CartItem,
  Order,
  OrderDetails,
  ProductDetails,
  ProductPage,
  RecurringList,
  RecurringOrder,
  RecurringQuantityChange,
  User,
} from "./types.ts";

const SEARCH_API = `${ODA_API_BASE}/api/v1/search/`;
const PRODUCTS_API = `${ODA_API_BASE}/api/v1/products/`;
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

  /**
   * Search the catalog. Tries the REST search first; for multi-word queries
   * with zero REST matches we retry against the HTML search page, which does
   * intent matching the REST endpoint lacks (e.g. "snickers ice cream" →
   * Snickers-Is). Single-word zero-result queries skip the fallback because
   * the HTML page returns generic recommendations rather than a real "no
   * results" signal, which would mislead the agent.
   */
  async searchProducts(query: string, page = 1): Promise<ProductPage> {
    const restUrl = `${SEARCH_API}?q=${encodeURIComponent(query)}${
      page > 1 ? `&page=${page}` : ""
    }`;
    const data = await this.#getJson<WireSearchResponse>(restUrl);
    const rest = data
      ? parseSearchResponse(restUrl, data, page)
      : { pageUrl: restUrl, items: [], hasMore: false };
    if (rest.items.length > 0 || query.trim().split(/\s+/).length < 2) {
      return rest;
    }

    const htmlUrl = `${ODA_BASE_URL}/search/products/?q=${encodeURIComponent(query)}${
      page > 1 ? `&page=${page}` : ""
    }`;
    const nextData = await this.#http.fetchNextData(htmlUrl);
    return parseHtmlSearchPage(htmlUrl, nextData);
  }

  /**
   * Fetch full product details, including nutrition, ingredients, allergens,
   * origin, and storage info. Returns null when the product doesn't exist.
   */
  async getProduct(productId: number): Promise<ProductDetails | null> {
    const data = await this.#getJson<WireProductDetail>(
      `${PRODUCTS_API}${productId}/`,
    );
    return data ? parseProductDetail(data) : null;
  }

  async getCart(): Promise<CartItem[]> {
    const data = await this.#getJson<WireCart>(CART_API);
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
    const data = await this.#getJson<WireOrdersResponse>(ORDERS_API);
    return data ? parseOrdersResponse(data) : [];
  }

  async getOrderDetails(orderNumber: string): Promise<OrderDetails | null> {
    const url = `${ORDERS_API}${encodeURIComponent(orderNumber)}/`;
    const data = await this.#getJson<WireOrderDetail>(url);
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
    const data = await this.#getJson<WireCart>(RECURRING_API);
    return data ? parseRecurringResponse(data) : { productCount: 0, items: [] };
  }

  /**
   * B2B accounts manage their recurring order as a product list. The list
   * index gives us schedule metadata (`next_date`, frequency, weekday); we
   * fetch the list detail separately to get full item data with prices.
   * Returns null when no list has an active recurring order.
   */
  async getRecurringList(): Promise<RecurringList | null> {
    const indexData =
      await this.#getJson<WireProductListsPage>(PRODUCT_LISTS_API);
    const summary = indexData ? parseRecurringListsResponse(indexData) : null;
    if (!summary) return null;

    const detailData = await this.#getJson<WireProductList>(
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
   * Apply signed-delta quantity changes to a product list. Positive deltas add
   * (or create entries), negative deltas remove (clamped at 0). Returns the
   * full updated list. Throws on 4xx with the server's error message.
   *
   * Body shape is a top-level array, not `{ items: [...] }` like the cart.
   */
  async updateProductListItems(
    listId: number,
    deltas: Array<{ productId: number; delta: number }>,
  ): Promise<RecurringList> {
    const url = `${PRODUCT_LISTS_API}${listId}/products/`;
    const referer = `${ODA_BASE_URL}/account/lists/details/${listId}/`;
    const body = deltas.map(({ productId, delta }) => ({
      product_id: productId,
      quantity: delta,
    }));
    const response = await this.#http.postJson(url, body, referer);
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(extractListError(text, response.status));
    }
    const data = (await response.json()) as WireProductList;
    return parseRecurringListDetail(
      data,
      parseRecurringSchedule(data.recurring_order ?? null),
    );
  }

  /**
   * Set a product to an exact target quantity on the active recurring list.
   * Idempotent: calling with `quantity: 3` always lands on 3, regardless of
   * the previous state. Quantity 0 removes the product. Throws when there
   * is no active recurring list on the account.
   */
  async setRecurringQuantity(
    productId: number,
    quantity: number,
  ): Promise<RecurringQuantityChange> {
    if (quantity < 0 || !Number.isInteger(quantity)) {
      throw new Error("quantity must be a non-negative integer");
    }
    const list = await this.getRecurringList();
    if (!list) {
      throw new Error(
        "This account has no active recurring order, so quantities can't be set.",
      );
    }
    const before = list.items.find((i) => i.id === productId);
    const previousQuantity = before?.quantity ?? 0;
    const delta = quantity - previousQuantity;
    if (delta === 0) {
      return {
        list,
        productId,
        name: before?.name ?? null,
        previousQuantity,
        quantity,
      };
    }
    const updated = await this.updateProductListItems(list.id, [
      { productId, delta },
    ]);
    const after = updated.items.find((i) => i.id === productId);
    return {
      list: updated,
      productId,
      name: after?.name ?? before?.name ?? null,
      previousQuantity,
      quantity: after?.quantity ?? 0,
    };
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

  async #getJson<T>(url: string): Promise<T | null> {
    const response = await this.#http.getJson(url);
    return response.ok ? ((await response.json()) as T) : null;
  }
}
