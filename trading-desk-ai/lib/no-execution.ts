/**
 * ⚠️  READ THIS FIRST
 *
 * This file does NOT exist in this project, and that is deliberate.
 *
 * There is no execution module. No exchange client. No order endpoint.
 * No API keys, no wallet, no signing, no withdrawal path.
 *
 * A signal can only ever hold one of three states — PENDING, APPROVED, REJECTED —
 * and only the person clicking in the UI can move it out of PENDING. Approval is
 * a label on a screen, not an instruction to anything.
 *
 * If you ever add an execution layer to this app, you are building a different
 * product with a different risk profile. Do that on purpose, with your own keys,
 * your own limits, and your own review — not by quietly extending this one.
 */

export const EXECUTION_DISABLED = true;
