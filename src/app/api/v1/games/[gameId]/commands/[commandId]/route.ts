import { jsonError, jsonOk } from "@/lib/http";
import { resolveStoryteller } from "@/lib/auth/http";
import { getCommandStatus } from "@/modules/recovery/recovery.service";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ gameId: string; commandId: string }> },
) {
  try {
    const { gameId, commandId } = await params;
    await resolveStoryteller(gameId);
    return jsonOk(await getCommandStatus(gameId, commandId));
  } catch (err) {
    return jsonError(err);
  }
}
