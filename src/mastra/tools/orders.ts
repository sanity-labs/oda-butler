import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { oda } from "../../lib/oda/instance.ts";

export const listOrders = createTool({
  id: "list_orders",
  description: [
    "List recent past orders, newest first.",
    "Each order includes orderNumber, deliveryTime, deliveryAddress, statusText, total, and tracking step.",
    'Use this for questions like "what did we order last week?" or "how much did we spend recently?".',
    "For line items inside an order, use get_order with the orderNumber.",
    "For the upcoming delivery specifically, prefer get_next_delivery instead.",
  ].join(" "),
  inputSchema: z.object({
    limit: z
      .number()
      .int()
      .min(1)
      .max(20)
      .default(5)
      .describe("How many orders to return. Defaults to 5."),
  }),
  execute: async (inputData) => {
    const orders = await oda.getOrders();
    return orders.slice(0, inputData.limit);
  },
});

export const getOrder = createTool({
  id: "get_order",
  description: [
    "Read the full details of a single past order: line items, quantities, prices, category, and delivery info.",
    'Use this when the user asks "what was in order 5fdnhy?" or "what cheese did we get last time?".',
  ].join(" "),
  inputSchema: z.object({
    orderNumber: z
      .string()
      .min(1)
      .describe("Order number from list_orders, e.g. '5fdnhy'."),
  }),
  execute: (inputData) => oda.getOrderDetails(inputData.orderNumber),
});

export const getNextDelivery = createTool({
  id: "get_next_delivery",
  description: [
    "Get the order that's currently in flight (the next physical delivery).",
    "Returns delivery time, address, status text, and tracking step (Bekreftet, Pakkes, På vei, Levert).",
    "Returns null when nothing is in flight.",
    'Use this for "is the order on its way?" or "when does it arrive?".',
    'For "when\'s the next recurring drop scheduled?", use get_recurring_order — it returns the next scheduled date which can be further out than the in-flight order.',
  ].join(" "),
  inputSchema: z.object({}),
  execute: () => oda.getNextDelivery(),
});
