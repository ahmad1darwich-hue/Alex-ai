import { isAuthenticated } from "../../../../lib/auth";
export async function GET() {
  return Response.json({ authenticated: await isAuthenticated() });
}
