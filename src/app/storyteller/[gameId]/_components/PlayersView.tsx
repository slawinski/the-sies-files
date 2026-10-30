"use client";

// PlayersView — roster management that does not compete with live controls
// (spec 19 §7.3 / screen spec 21 §11). Inline actions move into a per-row
// overflow menu; reordering requires explicit Arrange-circle mode.

import { useState } from "react";
import { ArrowDown, ArrowUp, Plus, UserRound } from "lucide-react";
import type { StorytellerGameProjection, StorytellerPlayerDto } from "@/lib/client-api";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Dialog from "@/components/ui/Dialog";
import Notice from "@/components/ui/Notice";
import Surface from "@/components/ui/Surface";
import { claimStatus } from "@/lib/presentation/labels";

const MAX_PLAYERS = 16;

export default function PlayersView({
  game,
  busy,
  renameEnabled,
  onAddPlayer,
  onRenamePlayer,
  onRemovePlayer,
  onMovePlayer,
  onIssueClaim,
  onResetAccess,
}: {
  game: StorytellerGameProjection;
  busy: boolean;
  renameEnabled: boolean;
  onAddPlayer: (name: string) => Promise<boolean>;
  onRenamePlayer: (playerId: string, name: string) => void;
  onRemovePlayer: (player: StorytellerPlayerDto) => void;
  onMovePlayer: (playerId: string, direction: -1 | 1) => void;
  onIssueClaim: (player: StorytellerPlayerDto) => void;
  onResetAccess: (player: StorytellerPlayerDto) => void;
}) {
  const [newName, setNewName] = useState("");
  const [arranging, setArranging] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [removeTarget, setRemoveTarget] = useState<StorytellerPlayerDto | null>(null);
  const [resetTarget, setResetTarget] = useState<StorytellerPlayerDto | null>(null);

  const sorted = [...game.players].sort((a, b) => a.virtualSeat - b.virtualSeat);
  const rosterLocked = !renameEnabled;

  async function submitAdd(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = newName.trim();
    if (!trimmed) return;
    const ok = await onAddPlayer(trimmed);
    if (ok) setNewName("");
  }

  function commitRename(playerId: string) {
    const trimmed = editingName.trim();
    if (!trimmed) return;
    onRenamePlayer(playerId, trimmed);
    setEditingId(null);
    setEditingName("");
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="eyebrow">Gracze</p>
          <p className="mt-1 text-meta text-ink-muted">
            {game.participantCount} z {MAX_PLAYERS} miejsc w kręgu
          </p>
        </div>
        {sorted.length > 1 && (
          <Button
            variant={arranging ? "secondary" : "quiet"}
            aria-pressed={arranging}
            disabled={busy}
            icon={<UserRound aria-hidden="true" className="h-4 w-4" />}
            onClick={() => setArranging((value) => !value)}
          >
            {arranging ? "Zakończ układanie" : "Ułóż krąg"}
          </Button>
        )}
      </div>

      {arranging && (
        <Notice variant="info">
          Tryb układania kręgu — zmień kolejność miejsc. Inne akcje na graczach są wstrzymane.
        </Notice>
      )}

      {/* Add participant */}
      {!rosterLocked && (
        <Surface variant="system">
          <form onSubmit={submitAdd} className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <label className="flex-1">
              <span className="mb-1 block text-meta text-ink-muted">Imię uczestnika</span>
              <input
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
                placeholder="np. Ela"
                autoComplete="off"
                className="min-h-11 w-full rounded-control border border-line bg-card-soft px-3 text-ink-primary placeholder:text-ink-muted"
              />
            </label>
            <Button type="submit" variant="secondary" busy={busy} disabled={!newName.trim() || game.participantCount >= MAX_PLAYERS} icon={<Plus aria-hidden="true" className="h-4 w-4" />}>
              Dodaj do kręgu
            </Button>
          </form>
          {game.participantCount >= MAX_PLAYERS && (
            <p className="mt-2 text-meta text-ink-muted">Lista pełna — maksimum 16 uczestników.</p>
          )}
        </Surface>
      )}

      {/* Roster */}
      <div className="flex flex-col gap-2">
        {sorted.length === 0 ? (
          <Surface variant="soft">
            <p className="text-center text-sm text-ink-muted">
              Nie ma jeszcze uczestników. Dodaj pierwsze imię, aby otworzyć krąg.
            </p>
          </Surface>
        ) : (
          sorted.map((player, index) => {
            const tone = claimStatus(player);
            const isEditing = editingId === player.id;
            const isFirst = index === 0;
            const isLast = index === sorted.length - 1;

            return (
              <Surface key={player.id} variant="soft">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-line bg-elevated text-sm tabular-nums text-ink-secondary">
                    {player.virtualSeat + 1}
                  </span>

                  {isEditing ? (
                    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                      <label htmlFor={`rename-${player.id}`} className="sr-only">
                        Imię: {player.displayName}
                      </label>
                      <input
                        id={`rename-${player.id}`}
                        value={editingName}
                        onChange={(event) => setEditingName(event.target.value)}
                        autoFocus
                        className="min-h-11 w-full min-w-40 flex-1 rounded-control border border-line bg-elevated px-3 text-ink-primary"
                      />
                      <Button variant="secondary" size="sm" busy={busy} onClick={() => commitRename(player.id)}>
                        Zapisz
                      </Button>
                      <Button variant="quiet" size="sm" onClick={() => setEditingId(null)}>
                        Anuluj
                      </Button>
                    </div>
                  ) : (
                    <>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-base text-ink-primary">{player.displayName}</p>
                        <p className="text-meta">
                          <Badge variant={tone.tone}>{tone.label}</Badge>
                          {!player.alive && <Badge variant="rust" className="ml-1.5">nie żyje</Badge>}
                        </p>
                      </div>

                      {arranging ? (
                        <div className="flex shrink-0 gap-1.5">
                          <Button variant="quiet" size="sm" disabled={busy || isFirst} aria-label={`Przenieś ${player.displayName} w górę`} icon={<ArrowUp aria-hidden="true" className="h-4 w-4" />} onClick={() => onMovePlayer(player.id, -1)} />
                          <Button variant="quiet" size="sm" disabled={busy || isLast} aria-label={`Przenieś ${player.displayName} w dół`} icon={<ArrowDown aria-hidden="true" className="h-4 w-4" />} onClick={() => onMovePlayer(player.id, 1)} />
                        </div>
                      ) : (
                        <OverflowMenu
                          player={player}
                          busy={busy}
                          renameEnabled={renameEnabled}
                          onRename={() => {
                            setEditingId(player.id);
                            setEditingName(player.displayName);
                          }}
                          onIssueClaim={() => onIssueClaim(player)}
                          onResetAccess={() => setResetTarget(player)}
                          onRemove={() => setRemoveTarget(player)}
                        />
                      )}
                    </>
                  )}
                </div>
              </Surface>
            );
          })
        )}
      </div>

      {/* Remove confirmation */}
      <Dialog
        open={removeTarget !== null}
        onClose={() => setRemoveTarget(null)}
        title="Usuń gracza"
        description={
          <>
            Usuwasz <span className="font-semibold text-ink-primary">{removeTarget?.displayName}</span>{" "}
            z kręgu. Ta operacja jest nieodwracalna.
          </>
        }
        footer={
          <>
            <Button variant="quiet" onClick={() => setRemoveTarget(null)}>
              Anuluj
            </Button>
            <Button
              variant="danger"
              busy={busy}
              onClick={() => {
                if (removeTarget) onRemovePlayer(removeTarget);
                setRemoveTarget(null);
              }}
            >
              Usuń
            </Button>
          </>
        }
      />

      {/* Access-reset confirmation (strong — the old access dies immediately) */}
      <Dialog
        open={resetTarget !== null}
        onClose={() => setResetTarget(null)}
        title="Reset dostępu"
        description={
          <>
            Unieważniasz obecny dostęp{" "}
            <span className="font-semibold text-ink-primary">{resetTarget?.displayName}</span>{" "}
            i wydajesz nowy jednorazowy token. Stary link przestaje działać natychmiast.
          </>
        }
        footer={
          <>
            <Button variant="quiet" onClick={() => setResetTarget(null)}>
              Anuluj
            </Button>
            <Button
              variant="danger"
              busy={busy}
              onClick={() => {
                if (resetTarget) onResetAccess(resetTarget);
                setResetTarget(null);
              }}
            >
              Resetuj dostęp
            </Button>
          </>
        }
      />
    </div>
  );
}

function OverflowMenu({
  player,
  busy,
  renameEnabled,
  onRename,
  onIssueClaim,
  onResetAccess,
  onRemove,
}: {
  player: StorytellerPlayerDto;
  busy: boolean;
  renameEnabled: boolean;
  onRename: () => void;
  onIssueClaim: () => void;
  onResetAccess: () => void;
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        variant="quiet"
        size="sm"
        aria-label={`Akcje dla: ${player.displayName}`}
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        •••
      </Button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={player.displayName}
        description="Dostęp i tożsamość gracza"
      >
        <div className="flex flex-col gap-2">
          {renameEnabled && (
            <Button variant="quiet" fullWidth busy={busy} onClick={() => { setOpen(false); onRename(); }}>
              Zmień imię
            </Button>
          )}
          <Button variant="secondary" fullWidth busy={busy} onClick={() => { setOpen(false); onIssueClaim(); }}>
            Link do odbioru
          </Button>
          {(player.claimed || player.hasClaimToken) && (
            <Button variant="secondary" fullWidth busy={busy} onClick={() => { setOpen(false); onResetAccess(); }}>
              Reset dostępu
            </Button>
          )}
          <Button variant="danger" fullWidth busy={busy} onClick={() => { setOpen(false); onRemove(); }}>
            Usuń z kręgu
          </Button>
        </div>
      </Dialog>
    </>
  );
}
