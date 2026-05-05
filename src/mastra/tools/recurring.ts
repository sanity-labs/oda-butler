import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { oda } from "../../lib/oda/instance.ts";

export const recurringGet = createTool({
  id: "recurring_get",
  description:
    "Get the active recurring order (faste varer): items + delivery schedule (next date, weekday, frequency).",
  inputSchema: z.object({}),
  execute: () => oda.getRecurringList(),
});
