import { jsonError, jsonOk } from "@/lib/http";
import { resolveStoryteller } from "@/lib/auth/http";
import { runConsistencyChecks } from "@/modules/recovery/recovery.service";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ gameId: string }> },
) {
  try {
    const { gameId } = await params;
    await resolveStoryteller(gameId);
    return jsonOk({ issues: await runConsistencyChecks(gameId) });
  } catch (err) {
    return jsonError(err);
  }
}
