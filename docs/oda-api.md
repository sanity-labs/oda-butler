# Oda API notes

Reverse-engineered subset of `oda.com`'s private REST API used by oda-butler.

The wire shapes (request bodies, response payloads, error formats) are described in [`oda-openapi.yaml`](./oda-openapi.yaml). TypeScript types are generated from that spec via `bun run gen:api-types`. This document covers conceptual gotchas that don't fit cleanly into OpenAPI: how endpoints relate, where data is _not_ served from, and operational quirks.

## Auth

- `POST /api/v1/user/login/` returns the `csrftoken` and `sessionid` cookies. To get an initial CSRF cookie, GET any HTML page first (e.g. `/no/user/login/`).
- Mutations require `X-CSRFToken: <csrftoken>`, `Origin: https://oda.com`, and a same-origin `Referer`.

## Products and search

There are two search surfaces:

- **REST** (`GET /api/v1/search/?q={q}&page={n}`) returns `{attributes:{total_hits}, products[], categories[]}`. Snake-case product shape, same as cart items. Pagination via `page` only (`limit`/`offset` are ignored). 40 products per page.
- **HTML** (`GET /no/search/products/?q=...`) embeds results in `__NEXT_DATA__` under the `"mixedSearch"` (or legacy `"searchpageresponse"`) dehydrated query. CamelCase product shape, nested under `attributes`.

The REST search is _more literal_. Multi-word queries like `"snickers ice cream"` return zero hits there even though the HTML page resolves them via intent matching (→ Snickers-Is). The HTML page also surfaces "alternative suggestions" on a true miss — it doesn't return zero results cleanly — so it should only be used as a fallback when the REST result is empty _and_ the query has multiple words.

Direct product lookup is available at `GET /api/v1/products/{id}/` and brand pages at `GET /api/v1/brand/{id}/` (categories with embedded products).

## Next delivery

There is **no dedicated upcoming-delivery endpoint**. We derive it from `/api/v1/orders/`: pick the most recent order whose `tracking.step_name` is not a terminal state (`DELIVERED`, `CANCELLED`). If none, return `null`.

## Recurring order: two surfaces, one is unused

Oda has two unrelated surfaces both called "recurring":

### Consumer recurring cart (do not use on B2B)

- `GET /api/v1/cart/recurring/` and `POST /api/v1/cart/recurring/items/` exist and use the same shape as the regular cart. On B2B accounts they always return the empty cart shape (`product_quantity_count: 0`) regardless of the actual recurring order. Mutations against this endpoint update the consumer recurring cart, which the B2B UI ignores.

### B2B product list with attached schedule (the real one)

B2B accounts manage their recurring order as a _product list_ with an attached `recurring_order` object. The active recurring list is the entry in `GET /api/v1/product-lists/` whose `recurring_order.is_active === true`.

Schedule fields (`frequency`, `weekday`, `next_date`) live on `recurring_order`. The cadence is encoded in `recurring_order.edit_url` as query params:

- `frequency` is the cadence in weeks (1 = weekly, 2 = biweekly, ...)
- `weekday` is ISO 8601 day-of-week (1 = Monday ... 7 = Sunday)
- `delivery_offering_id` is opaque

Mutations go through `POST /api/v1/product-lists/{id}/products/` with a _top-level array_ of signed deltas (not `{ items: [...] }` like the cart). `OPTIONS` returns 405 with `Allow: POST`. The endpoint accepts changes to lists with or without an active recurring schedule.

## User account

- `GET /api/v1/user/addresses/` — array of delivery addresses with delivery-area metadata (coordinates, unattended-delivery flags, etc.).
- `GET /api/v1/user/preferences/` — substitution opt-out, sampling opt-out, default recipe portions. `POST` to update.
- `POST /api/v1/user/logout/` — explicit logout. Cookies become invalid server-side.

## Discovery quirks

- `OPTIONS` returns `405 Allow: <verbs>` on every endpoint, which makes verb discovery cheap when reverse-engineering new paths.
- `404` responses come back as the full Next.js HTML 404 page (≈180 KB), not JSON. Parse defensively.

## Useful HTML pages (Next.js data)

- `__NEXT_DATA__` on `/no/cart/` contains the `user` query (`firstName`, `lastName`, `email`).
- Account pages (`/no/account/`, `/no/account/orders/`) hold only `user`, `onboardingUrl`, `isHijacked`. Real data is fetched via REST after hydration.
