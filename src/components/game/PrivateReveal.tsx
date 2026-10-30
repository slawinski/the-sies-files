"use client";

// PrivateReveal — deliberate, full-screen role reveal (audit 18 UX-03,
// spec 19 §6.3). Covered → revealed → acknowledged. The covered state must
// not leak ANY role-derived information (no icon, no alignment color, no
// content length); the revealed state is a confidential dossier moment.

import { useState } from "react";
import { EyeOff } from "lucide-react";
import type { RoleRevealDto } from "@/lib/client-api";
import Button from "@/components/ui/Button";
import Notice from "@/components/ui/Notice";
import RoleDossier from "./RoleDossier";

export default function PrivateReveal({
  role,
  nameById,
  busy,
  onAcknowledge,
}: {
  role: RoleRevealDto;
  nameById: Map<string, string>;
  busy: boolean;
  onAcknowledge: () => void;
}) {
  const [revealed, setRevealed] = useState(false);

  return (
    <div className="fixed inset-0 z-private flex min-h-dvh flex-col overflow-y-auto bg-canvas">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-10">
        {!revealed ? (
          <div className="text-center">
            <p className="text-[11px] uppercase tracking-[0.3em] text-moss">The Sieś Files</p>
            <h1 className="display mt-6 text-3xl leading-tight text-ink-primary">
              Informacja prywatna
            </h1>
            <div className="mx-auto mt-8 flex h-14 w-14 items-center justify-center rounded-chip border border-brass/40 bg-brass/5">
              <EyeOff aria-hidden="true" className="h-6 w-6 text-brass" strokeWidth={1.75} />
            </div>
            <p className="mx-auto mt-6 max-w-xs text-base text-ink-secondary">
              Upewnij się, że nikt nie widzi ekranu. Ta karta zawiera twoją tajną rolę.
            </p>
            <Button size="lg" fullWidth className="mt-10" onClick={() => setRevealed(true)}>
              Pokaż moją rolę
            </Button>
          </div>
        ) : (
          <div className="role-reveal">
            <RoleDossier role={role} nameById={nameById} />

            <Notice variant="private" className="mt-4">
              Zapamiętaj swoją rolę — ta karta zniknie po zamknięciu i nie będzie wyświetlana
              publicznie.
            </Notice>

            <Button
              variant="secondary"
              size="lg"
              fullWidth
              busy={busy}
              className="mt-4"
              onClick={onAcknowledge}
            >
              Zapamiętałem — ukryj
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
