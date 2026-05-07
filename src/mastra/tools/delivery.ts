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
    the in-flight order, the cart for the next unlocked delivery, and
    the standing recurring template into one response.

    Use this for "when's the next delivery?", "what's coming this
    week?", "what's in the cart?", "what's on faste varer?", or any
    combination. One call covers all of them. After staging cart
    changes (add_to_next_delivery, remove_from_next_delivery), call
    again to see the updated cart contents.

    Returns three sections:
    - upcoming: the next delivery the office actually receives. Once
      the order is confirmed (trackingStep CONFIRMED, PACKING, or
      EN_ROUTE), it's locked and can no longer be modified through
      the bot. Null when no order is in flight yet. Includes
      deliveryTime (Norwegian-formatted with weekday, date, and time
      window, e.g. "man 11. mai, 10:00 - 12:00"), statusText,
      trackingStep, total, and currency.
    - cart: one-off items staged for the next *unlocked* delivery.
      When upcoming is populated, the cart rides on the delivery
      after upcoming, not on upcoming itself. The date the cart
      attaches to is always recurring.schedule.nextDateLabel.
    - recurring: the standing template (faste varer) and its
      schedule. Read-only context; the office manager owns the list.
      schedule.nextDateLabel is the next delivery the template will
      modify, which is also when the cart rides.

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
            trackingStep: upcoming.trackingStep,
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
