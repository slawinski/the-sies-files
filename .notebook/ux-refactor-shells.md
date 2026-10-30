# UX Refactor: Player Companion + Storyteller Console shells
> Redesign per the-sies-files-ux-audit/ (docs 18–21). Route files are thin
> controllers; rendering lives in view components over semantic primitives.

## Architecture
- `src/lib/presentation/` — pure selectors (unit-tested):
  - `player-mode.ts` — `selectPlayerPresentation`, `selectActiveVotingNomination`, `requiredTargetCount`
  - `storyteller-mode.ts` — `selectPrimaryStorytellerBlocker` (priority: ST decision > player waiting > voting > phase advance > setup)
  - `action-priority.ts` — severity matrix (variant + confirmation gates)
  - `labels.ts`, `scenario-options.ts` — Polish copy; options are STATIC fixtures (never value-import `modules/scenario/definition` client-side — it contains plaintext QR tokens / hidden content)
- `src/components/ui/` — semantic primitives: Button, Surface, Badge, Notice, Dialog (focus trap), CaseHeader, BottomNav, StorytellerRail, StatTile, PersonTile, DossierDocument, Timeline, Skeleton, ConnectionStatus, AppShell
- `src/components/game/` — domain stages: PrivateReveal (full-screen), RoleDossier, CurrentActionStage, VoteStage, NominationStage, GameEndedStage, InvestigationSummary, DeliveredInfo
- `src/components/useVersionedMutation.ts` — the one mutation wrapper (version-conflict → refetch + stale banner; no optimistic success)
- Player views: `/player?view=case|people|journal|map` (default case) — bottom nav, safe-area padded
- Storyteller views: `/storyteller/[gameId]?view=control|players|grimoire|scenario|audit|system` — desktop rail, narrow-screen chip selector, privacy-cover toggle (masks grimoire roles/alignment + control resolutions)

## Gotchas
- UI e2e specs must hide the Next dev-overlay portal: `await page.addStyleTag({ content: "nextjs-portal { display: none; }" })` — it sits bottom-left over the "Akta" nav item and intercepts pointer events.
- Role ack bumps the game version — API-driven e2e steps after a UI ack must refetch `v` from the storyteller projection first.
- The case view MUST render MapCard (e2e-07 asserts `.map-viewport` on `/player` default view); scenario.map exists only after the first QR scan.
- `globals.css` v2 tokens: `.eyebrow`/`.display`/`.text-meta` live in `@layer components` so utility color overrides win. Custom utilities: rounded-card/tile/control/chip, content-bottom-nav, texture-paper/shell, z-nav/sheet/dialog/private.
- Screenshots: `bash scripts/reset-e2e-db.sh && DATABASE_URL=... npm run dev -- --port 3100 &` then `npx tsx scripts/capture-ux-screenshots.mts` (writes playwright-report/ux-screenshots/).

## Known flakes (pre-existing)
- Full e2e suite: e2e-04 (random CHEF/MONK draw odds) and occasional cold-server timing — pass in isolation.
