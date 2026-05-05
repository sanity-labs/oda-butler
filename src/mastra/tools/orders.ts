import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { oda } from "../../lib/oda/instance.ts";

export const ordersList = createTool({
  id: "orders_list",
  description:
    "List recent past orders with summary info (number, delivery time, total, status).",
  inputSchema: z.object({}),
  execute: () => oda.getOrders(),
});

export const orderGetDetails = createTool({
  id: "order_get_details",
  description:
    "Get line items, total, and delivery status for a specific past order.",
  inputSchema: z.object({
    orderNumber: z
      .string()
      .describe("Order number from orders_list, e.g. '5fdnhy'."),
  }),
  execute: (inputData) => oda.getOrderDetails(inputData.orderNumber),
});

export const nextDeliveryGet = createTool({
  id: "next_delivery_get",
  description:
    "Get the next scheduled delivery (date, address, status). Returns null if there isn't one.",
  inputSchema: z.object({}),
  execute: () => oda.getNextDelivery(),
});
