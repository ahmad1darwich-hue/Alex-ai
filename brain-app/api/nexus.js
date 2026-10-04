// Second address of the Nexus engine (same handler as api/indicator.js). Used to stage and verify new engine versions.
export const config = { runtime: "edge" };

import { handle } from "./_nexus/handler.js";

export default function handler(req, ctx) {
  return handle(req, ctx);
}
