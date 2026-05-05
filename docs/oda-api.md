# Oda API notes

Reverse-engineered against `oda.com` (Norwegian site) on 2025-12-XX while authenticated. All endpoints take session cookies (`csrftoken`, `sessionid`) and return JSON. The frontend speaks Django REST under the hood so payloads are `snake_case`.

## Auth

- `POST /api/v1/user/login/` — body `{username, password}`. Response has the session cookies.
- All mutation endpoints want `X-CSRFToken: <csrftoken cookie>`, `Origin: https://oda.com`, and a `Referer` from the same origin.

## Products

- `GET /no/search/products/?q={query}&page={n}` — HTML page, product list embedded in `__NEXT_DATA__` under `dehydratedState.queries[].queryKey[0]._id === "mixedSearch"` (or legacy `searchpageresponse`).

## Cart

- `GET /api/v1/cart/` — `{ id, label_text, product_quantity_count, total_gross_amount, items, groups: [{items: [...]}] }`.
- `POST /api/v1/cart/items/` body `{ items: [{ product_id, quantity }] }` — add (positive quantity) or remove (negative quantity). Returns the updated cart.

## Orders

- `GET /api/v1/orders/` — paginated, returns `{ get_more_url, has_more, results: [{name: "Desember 2025", type: "month", gross_amount, currency, orders: [Order]}] }`. Pagination via `?through-date=YYYY-MM-DD`.
- `GET /api/v1/orders/{order_number}/` — full detail: `{ info: [{key, title, content}], summary: Order, items: { product_count, item_groups: [{ type: "category", name, items: [LineItem] }] } }`.

### Order shape (summary)

```json
{
  "order_number": "5fdnhy",
  "status": {
    "title": "Kvittering",
    "payment_status_state": "payment_paid",
    "can_be_ordered_again": true
  },
  "delivery": {
    "delivery_address": "Seilduksgata 9A, 0553 Oslo",
    "delivery_time": "man 1. desember, 18:53",
    "status_text": "Bestillingen din er levert",
    "tracking": {
      "step_name": "DELIVERED",
      "data": { "title": "...", "current_step_number": 4, "steps": [...] }
    }
  },
  "gross_amount": 1224.7,
  "currency": "NOK"
}
```

`tracking.step_name` values seen: `DELIVERED`. The full lifecycle (per the steps array) is `Bekreftet` → `Pakkes` → `På vei` → `Levert`.

### Line item

```json
{
  "product_id": 8476,
  "product_image": "https://...",
  "description": "R Hakkede tomater Med basilikum og oregano, 390 g",
  "quantity": 12,
  "uncredited_quantity": 12,
  "gross_amount": 201.6,
  "currency": "NOK",
  "vat_percentage": "15%",
  "discount": null | { "is_discounted": true, "undiscounted_gross_price": "39.90", ... }
}
```

## Next delivery / upcoming

There is **no dedicated upcoming-delivery endpoint**. The "next delivery" is whichever order in `/api/v1/orders/` has `tracking.step_name` other than `DELIVERED`/`CANCELLED`. The status text and tracking data tell you what stage it's in.

For our agent we infer "next delivery" by:

1. Calling `/api/v1/orders/`.
2. Picking the most recent order whose `tracking.step_name` is not a terminal state (`DELIVERED`, `CANCELLED`).
3. If none: returning `null`.

## Recurring order (faste varer)

- `GET /api/v1/cart/recurring/` — same shape as the cart. Empty cart returns `{ id: 0, product_quantity_count: 0, groups: [] }`.
- `POST /api/v1/cart/recurring/items/` body `{ items: [{ product_id, quantity }] }` — confirmed working. Same protocol as the regular cart: positive quantity to add, negative to remove. The `OPTIONS` preflight returns `405` (Django doesn't allow OPTIONS on this view), but `POST` works.

## Useful HTML pages

- `__NEXT_DATA__` on `/no/cart/` includes the `user` query (`firstName`, `lastName`, `email`).
- Most account pages (`/no/account/`, `/no/account/orders/`) hold only `user`, `onboardingUrl`, `isHijacked`. Real data is loaded via REST after the page hydrates.
