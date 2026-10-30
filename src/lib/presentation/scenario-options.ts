// ST scenario override options for the development fixture content pack
// (spec 19 §7.5 wants enumerated options instead of free-text ids).
//
// SECURITY NOTE: these labels are deliberately duplicated as static strings —
// we must NOT value-import `TSF_Millionaire` into client code, because the
// definition contains plaintext QR tokens, DISCOVERER_ONLY clue bodies and
// hidden-POI coordinates that would ship in the public client bundle.
// Keep the two lists in sync when the fixture content changes.

import { mapVersionLabel } from "./labels";

export function scenarioClueOptions(): Array<{ id: string; label: string }> {
  return [
    { id: "clue-letter", label: "List milionera" },
    { id: "clue-map", label: "Aneks do mapy" },
    { id: "clue-finale", label: "Zniknięcie" },
  ];
}

export function scenarioStageOptions(): Array<{ id: string; label: string }> {
  return [{ id: "stage-finale", label: "etap: finale" }];
}

export function scenarioMapOptions(): Array<{ id: string; label: string }> {
  return [
    { id: "MAP_BASE", label: mapVersionLabel("MAP_BASE") },
    { id: "MAP_EXTENDED", label: mapVersionLabel("MAP_EXTENDED") },
  ];
}
