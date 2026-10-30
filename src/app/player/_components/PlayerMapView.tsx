"use client";

// PlayerMapView — the dedicated Mapa destination (audit 18 UX-09 / screen spec
// 21 §7). Map occupies most of the viewport; the QR scanner opens as a bottom
// sheet that expands to the camera. The map list alternative is visible below
// the artwork.

import { useState } from "react";
import { ScanLine } from "lucide-react";
import type { PlayerGameProjection } from "@/lib/client-api";
import MapCard from "@/components/MapCard";
import QrScanner from "@/components/QrScanner";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Dialog from "@/components/ui/Dialog";
import Notice from "@/components/ui/Notice";
import Surface from "@/components/ui/Surface";
import { mapVersionLabel } from "@/lib/presentation/labels";

/** Manual token entry is a development/test affordance only (spec 23 §2.1) —
 *  gated on both the build-time flag and a development runtime. */
const DEV_SCAN_INPUT =
  process.env.NODE_ENV === "development" && process.env.NEXT_PUBLIC_DEV_SCAN_INPUT === "1";

export default function PlayerMapView({
  game,
  busy,
  scanMessage,
  scanError,
  onScan,
}: {
  game: PlayerGameProjection;
  busy: boolean;
  scanMessage: string | null;
  scanError: string | null;
  onScan: (token: string) => Promise<void>;
}) {
  const [scanOpen, setScanOpen] = useState(false);
  const [devToken, setDevToken] = useState("");
  const scenario = game.scenario;
  const scenarioVisible = game.phase === "INVESTIGATION" && scenario !== null;
  const activeTask = (scenario?.tasks ?? []).find((t) => t.state !== "COMPLETED") ?? null;
  const pois = scenario?.map?.pois ?? [];

  return (
    <div className="flex flex-col gap-3">
      {/* Context bar */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <p className="eyebrow">Mapa</p>
          {scenario && <Badge variant="brass">{mapVersionLabel(scenario.mapVersionId)}</Badge>}
        </div>
        {activeTask && <Badge variant="moss">zadanie: {activeTask.title}</Badge>}
      </div>

      {!scenarioVisible && (
        <Notice variant="info">Mapa stanie się dostępna podczas śledztwa.</Notice>
      )}

      {/* Terrain */}
      <Surface variant="map">
        <MapCard map={scenario?.map ?? null} mapVersionId={scenario?.mapVersionId ?? null} />
      </Surface>

      {/* Actions */}
      {scenarioVisible && (
        <Button
          fullWidth
          size="lg"
          icon={<ScanLine aria-hidden="true" className="h-5 w-5" />}
          onClick={() => setScanOpen(true)}
        >
          Skanuj kod QR
        </Button>
      )}

      {/* Known locations — the visible list alternative for the map */}
      {pois.length > 0 && (
        <section aria-label="Znane miejsca">
          <p className="eyebrow mb-2">Znane miejsca</p>
          <ul className="flex flex-wrap gap-1.5">
            {pois.map((poi) => (
              <li key={poi.id}>
                <Badge variant="neutral">{poi.label}</Badge>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Scanner sheet */}
      <Dialog
        open={scanOpen}
        onClose={() => setScanOpen(false)}
        title="Skaner kodów QR"
        description="Zeskanuj kod znaleziony na terenie śledztwa. Kamera włączy się dopiero po twojej zgodzie."
      >
        <QrScanner onScan={onScan} />

        {scanMessage && (
          <Notice variant="success" className="mt-3">
            {scanMessage}
          </Notice>
        )}
        {scanError && (
          <Notice variant="error" className="mt-3">
            {scanError}
          </Notice>
        )}

        {DEV_SCAN_INPUT && (
          <div className="mt-4 border-t border-line pt-3">
            <p className="text-meta text-ink-muted">Tryb deweloperski</p>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                const token = devToken.trim();
                if (!token || busy) return;
                void onScan(token);
              }}
              className="mt-2 flex flex-col gap-2"
            >
              <label htmlFor="qr-token" className="sr-only">
                Kod QR
              </label>
              <input
                id="qr-token"
                value={devToken}
                onChange={(event) => setDevToken(event.target.value)}
                placeholder="Wpisz kod QR"
                autoComplete="off"
                className="min-h-11 w-full rounded-control border border-line bg-card-soft px-3 text-ink-primary placeholder:text-ink-muted"
              />
              <Button type="submit" variant="secondary" busy={busy} disabled={!devToken.trim()}>
                Skanuj
              </Button>
            </form>
          </div>
        )}
      </Dialog>
    </div>
  );
}
