import { createTool } from "@mastra/core/tools";
import { outdent } from "outdent";
import { z } from "zod";
import { oda } from "../../lib/oda/instance.ts";

/**
 * Single consolidated read for everything related to "what's arriving
 * at the office and when". Folds three Oda data sources into one
 * response so the agent doesn't have to fan out across multiple tools
 * and reason about how they relate.
 *
 * Anthropic's "Writing tools for agents" guide flags this exact
 * pattern: prefer one tool that compiles related context (their
 * canonical example is `get_customer_context` over separate
 * `get_customer_by_id` + `list_transactions` + `list_notes`). The
 * earlier split (`get_recurring_order` + `get_next_delivery_extras`)
 * existed back when the agent could mutate both surfaces and routing
 * mattered. With recurring read-only, the split was just ceremony.
 */
export const getNextDelivery = createTool({
  id: "get_next_delivery",
  description: outdent`
    Single read for what's arriving at the office and when. Combines
    the next physical delivery, the cart, and the recurring template
    into one response.

    Use this for "when's the next delivery?", "what's coming this
    week?", "what's in the cart?", "what's on faste varer?", or any
    combination. One call covers all of them. After staging cart
    changes (add_to_next_delivery, remove_from_next_delivery), call
    again to see the updated cart contents.

    Returns three sections:
    - upcoming: the next physical delivery the office is receiving,
      sourced from Oda's order tracking. Includes deliveryTime
      (Norwegian-formatted with weekday, date, and time window, e.g.
      "man 11. mai, 10:00 - 12:00"), statusText (a sentence the agent
      can quote, e.g. "Bestillingen din er bekreftet"), total, and
      currency. Null when no order is in flight yet; in that case
      use recurring.schedule.nextDateLabel for the next delivery date.
    - cart: one-off items staged for the next delivery. Items get
      auto-folded into the order at the cutoff (around 12:00 the day
      before delivery).
    - recurring: the standing template (faste varer) and its
      schedule. Read-only context; the office manager owns the list.
      schedule.nextDateLabel is the next time the recurring template
      runs, which can differ from upcoming.deliveryTime when an order
      is already in flight.

    For permanent recurring changes, refer the user to the office
    manager. For one-off cart edits, use add_to_next_delivery /
    remove_from_next_delivery.
  `,
  inputSchema: z.object({}),
  execute: async () => {
    const [upcoming, cart, recurring] = await Promise.all([
      oda.getNextDelivery(),
      oda.getCartWithTotals(),
      oda.getRecurringList(),
    ]);
    return {
      upcoming: upcoming
        ? {
            deliveryTime: upcoming.deliveryTime,
            deliveryAddress: upcoming.deliveryAddress,
            statusText: upcoming.statusText,
            total: upcoming.total,
            currency: upcoming.currency,
          }
        : null,
      cart: {
        items: cart.items,
        totals: cart.totals,
      },
      recurring,
    };
  },
});
