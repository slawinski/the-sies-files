import { jsonError, jsonOk } from "@/lib/http";
import { resolveStoryteller } from "@/lib/auth/http";
import { getActionDecisionContext } from "@/modules/operational/operational.service";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ gameId: string; actionId: string }> },
) {
  try {
    const { gameId, actionId } = await params;
    await resolveStoryteller(gameId);
    return jsonOk(await getActionDecisionContext(gameId, actionId));
  } catch (err) {
    return jsonError(err);
  }
}
