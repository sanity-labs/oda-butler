# Oda API notes

Reverse-engineered subset of `oda.com`'s private REST API used by oda-butler.

The wire shapes (request bodies, response payloads, error formats) are described in [`oda-openapi.yaml`](./oda-openapi.yaml). TypeScript types are generated from that spec via `bun run gen:api-types`. This document covers conceptual gotchas that don't fit cleanly into OpenAPI: how endpoints relate, where data is _not_ served from, and operational quirks.

## Auth

- `POST /api/v1/user/login/` returns the `csrftoken` and `sessionid` cookies. To get an initial CSRF cookie, GET any HTML page first (e.g. `/no/user/login/`).
- Mutations require `X-CSRFToken: <csrftoken>`, `Origin: https://oda.com`, and a same-origin `Referer`.

## Products

There is no public products REST endpoint. Search results are embedded in the HTML response from `/no/search/products/` inside `<script id="__NEXT_DATA__">`. Look under `props.pageProps.dehydratedState.queries[]` for the entry whose `queryKey[0]._id` is `"mixedSearch"` (legacy: `"searchpageresponse"`). Each `items[]` entry has `type: "product"`; categories and banners interleave and should be skipped.

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

## Useful HTML pages (Next.js data)

- `__NEXT_DATA__` on `/no/cart/` contains the `user` query (`firstName`, `lastName`, `email`).
- Account pages (`/no/account/`, `/no/account/orders/`) hold only `user`, `onboardingUrl`, `isHijacked`. Real data is fetched via REST after hydration.
