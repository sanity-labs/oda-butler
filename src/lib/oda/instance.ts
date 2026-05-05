import { OdaClient } from "./client.ts";
import { cookiePath } from "./paths.ts";

export const oda = new OdaClient(cookiePath());
