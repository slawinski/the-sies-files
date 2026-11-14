# Manual game history, retirement and restore custody

Archiving retains history for existing authorized readers. It is not erasure.
There is no automatic age-based deletion or public purge endpoint. The owner
chooses each retirement; this procedure does not grant copyright, privacy or
other legal clearance, certify all copies erased, or provide a backup service.

## 1. Retain or retire deliberately

Keep a completed game when its authorized history is still needed. Archive it
through the existing Storyteller action. Archive blocks gameplay edits, not the
existing actor-specific history reads. Ordinary credential checks still apply.
Before retirement, separately account for any owner-held exports that should
remain, and confirm authority for their retention/removal with their custodians.
Do not put private gameplay, credentials or exports in source control or reports.

For physical retirement, stop and drain every application, worker and pool using
the target, including monitoring connections. The offline tool independently
checks connection visibility/quiescence; do not terminate someone else's session
to satisfy it. Use the reviewed source/schema and a private local journal parent
(owned by the operator, mode 0700, real absolute path without symlink ancestors).
Evidence files are exclusive mode 0600. Same-user hostile processes and device
durability beyond successful filesystem synchronization are outside this custody
model. Never discover a target or credentials by reading an application dotenv.

Run from the verified, dotenv-free source capsule with its generated Prisma
client. Use an explicit password-free loopback URL with a non-default database;
if needed supply only `GAME_DATA_PASSWORD` through the private process environment.
The tool does not fall back to `DATABASE_URL` for its operator target.

```sh
node_modules/.bin/tsx scripts/game-data-lifecycle.mts plan \
  --database "$EXPLICIT_LOCAL_URL" --game "$GAME_UUID" --request "$REQUEST_UUID" \
  --plan "$PRIVATE/plan.json" --journal "$PRIVATE/intent.json" \
  --receipt "$PRIVATE/receipt.json" --stopped-application
# Inspect the minimal plan and confirm the exact selected game and target.
node_modules/.bin/tsx scripts/game-data-lifecycle.mts apply \
  --database "$EXPLICIT_LOCAL_URL" --game "$GAME_UUID" --request "$REQUEST_UUID" \
  --plan "$PRIVATE/plan.json" --journal "$PRIVATE/intent.json" \
  --receipt "$PRIVATE/receipt.json" --stopped-application
```

Only an ENDED, archived root is eligible. Plan binds UUID, immutable creation
time, revision/sequence, archive time, target host/port/database/OID/cluster,
source/tool/policy/schema and complete selected/retained data digests. A change
requires inspection and a new selection, not editing a plan or relaxing a guard.
Unclassified schemas, oversized graphs and competing sessions refuse. No force,
batch, remote-target or session-kill option exists.

Apply explicitly deletes restrictive history and scalar Presence then the root
and cascades, verifies zero selected residue and unchanged other-game/global
state, and commits a minimal independent `GameRetirement` anchor. Global limiter
buckets are not game-owned and are not swept. Minimal linked retirement metadata
is intentional retained private evidence, not participant/gameplay history.

## 2. Preserve outcome uncertainty

| Observed state | Required action |
|---|---|
| Refused before intent/deletion | Keep failure report; correct target/custody/eligibility only under the original authority. No deletion success is implied. |
| Durable pending intent, transaction rolled back | Preserve intent and first failure. The unchanged eligible original can be revalidated with the exact selection. |
| Commit uncertain, or receipt finalization failed | Keep service stopped; preserve plan, intent, any reservation/temp files and `.failure.json`. Do not infer outcome from the game being absent. |
| Exact anchor + matching intent, zero selected residue | `reconcile` with the same arguments can finalize only; it does not delete again. Earlier failure remains in the receipt. |
| Missing/corrupt intent, mismatched anchor, or absent game without anchor | No automatic success/reconciliation. Investigate privately and retain uncertainty. |
| Final receipt | Retain the receipt **and its intent** independently of this database and its backups, with the plan/earlier failure under private custody. |

`reconcile` uses the same arguments as `apply`; it is original-operation
reconciliation, **not** a restore scrubber. A matching anchor is not enough when
private rows have reappeared. Database/file stores do not commit atomically.
Every nonzero attempt remains a failed attempt even if a later reconciliation
succeeds. Keep earlier reports and source identities, not just the latest receipt.

## 3. Before serving any restored copy

1. Restore into a **new, explicitly owned, unserved staging target**. Do not point
   applications, connection pools, browser clients or workers at it. Never restore
   over an existing/private dataset to run a proof.
2. Obtain the independent retirement collection from its custodian, not from the
   restored database or from inside that same backup. Inventory all known intents,
   including failed/uncertain attempts, and finalized receipts. Missing location,
   missing receipt, incomplete inventory or unknown custody is a blocker, not an
   empty collection. A DB anchor in a newer backup cannot replace this collection.
3. Create a private collection file with absolute private evidence paths:

   ```json
   {
     "format": "game-retirement-custody/1",
     "complete": true,
     "entries": [
       { "journal": "/PRIVATE/retirement/intent.json", "receipt": "/PRIVATE/retirement/receipt.json" },
       { "journal": "/PRIVATE/incomplete/intent.json", "receipt": null }
     ]
   }
   ```

   `complete: true` is an explicit custodian assertion that the supplied inventory
   is complete for this restore's source/custody history; software cannot discover
   withheld/lost evidence. An empty array is valid **only** when the custodian has
   established no prior retirement attempts. Never use it to bypass uncertainty.
   Up to 1,000 entries are admitted; larger collections require a reviewed change,
   not splitting the history and interpreting one partial result as clearance.
4. Run the actual read-only check (no application initialization or dotenv):

   ```sh
   node_modules/.bin/tsx scripts/game-data-lifecycle.mts restore-check \
     --database "$EXPLICIT_STAGING_URL" --evidence "$PRIVATE/collection.json" \
     --unserved-staging
   ```

   It uses a read-only repeatable-read transaction, verifies the actual target
   identity and quiescence, and reads only game UUID/creation time. A committed
   receipt blocks reintroduced UUID + immutable `createdAt`, even when the old
   root is ACTIVE, unarchived, and has no retirement anchor. A reused UUID with a
   different creation time is reported as an immutable-identity mismatch, **not**
   deletion eligibility. Pending/uncertain evidence blocks until independently
   reconciled, even if its game is absent. Missing/malformed/incomplete supplied
   evidence also returns nonzero. Output contains counts and at most 100 linked
   conflict identities, never participant rows; treat those identities as private.
5. Any blocked/nonzero result keeps staging unserved. First reconcile uncertain
   original operations under section 2 and repair custody, not evidence contents.
   For committed reintroductions, explicitly choose to discard the owned staging
   copy or authorize a reviewed, exact-identity removal **only in that unserved
   owned staging copy**. Keep the original receipt and failure reports unchanged.
   Do not archive an old ACTIVE game merely to trick normal apply into accepting
   it, mutate its creation time, remove an entry, or change live eligibility.
6. A manual staging removal must lock and confirm the exact UUID and UTC creation
   timestamp, preserve unselected games, remove its `domain_events`,
   `command_receipts`, `checkpoints` and scalar `presence` before deleting that
   exact root and cascades in one transaction. Inspect schema ownership first;
   this is not permission for a broad SQL sweep or for deleting live source data.
   The synthetic proof contains this explicitly scoped example, not a public or
   automatic reconciliation interface. Record who authorized the manual action,
   target identity and verification outcome privately, without copying gameplay.
7. Run restore-check again with the **complete** independently held collection.
   Exit zero means no conflicts in this staged snapshot against that supplied
   evidence, not universal erasure or permission to serve. The custodian separately
   confirms authority, copy inventory and the ordinary deployment/recovery gates.
   Never rely on a prior check after changing staging or the evidence collection.

## 4. Retention and copy-custody inventory

| Material / purpose | Current behavior or known expiry | Physical removal and custodian responsibility |
|---|---|---|
| Completed/archived history, roles, votes, audit events, checkpoints, command outcomes | Manual history retention; archive retains actor-specific reads. No age eraser. | Explicit offline selected-game retirement. Owner decides authorized export retention first. |
| Claim tokens and browser-session credentials | Unclaimed claim TTL 7 days; session/cookie TTL 30 days (`src/lib/auth/tokens.ts`, `cookies.ts`). Revocation/expiry denies access; archive alone is not credential revocation. | Expiry does **not** delete rows or copies. Selected purge removes claims/session rows and hashes. Printed QR/raw tokens and cookies on user devices require custodian/device action. |
| Browser projections and pending QR identity | In-memory projections; `sessionStorage` key `tsf:pending-qr` stores game/player/command identity, not payload. Access denial clears pending identity; tab lifecycle is not guaranteed forensic erasure. Map seen-revision uses `localStorage`. | Clear relevant browser/site storage on held devices when authorized. Offline tabs, screenshots, OS/browser caches or user exports cannot be recalled by server purge. Purge/restart browser evidence is a separate release gate. |
| Presence | 30-second ONLINE and 120-second STALE thresholds are classifications, not deletion timers (`recovery.service.ts`). | Scalar Presence has no root cascade; selected offline purge removes it explicitly. No deployment-wide Presence sweep promised. |
| Global rate-limit state | Operational anti-abuse windows, shared across games; not game-owned. | Not selected by game purge. Deployment storage/retention requires separate operational inventory. |
| CI artifacts | Current workflow requests 14-day artifact retention. Synthetic baseline/recovery reports are separate from private exports. | Hosted deletion/expiry, downloaded artifacts and actual provider settings are custodian facts, not proven by YAML. Do not upload custody directories or dumps. |
| Source history and local build/test capsules | Source-control history and retained diagnostic specimens have no automatic game-retirement expiry. | No history rewrite or capsule purge here. Audit any accidentally stored private material separately with explicit authority; current synthetic proof is not evidence about all historic commits. |
| Owner-held exports, DB dumps, external backups/replicas and logs | Locations, schedules, deployment deadlines and retention are **unknown unless the custodian records them**. | Inventory holder/location/access/authorized purpose, restoration paths and chosen removal actions privately. Independently held evidence must accompany every restore admission. Database purge cannot erase external copies. |
| Retirement plan, intent, failure, receipt and DB anchor | Minimal linked UUID/time/count/digest metadata, retained deliberately for outcome reconciliation and anti-resurrection. No participant identities, credential hashes, roles, votes or payloads. | Private custodian keeps collection independently of restorable DBs. Do not silently age out the history needed to screen older backups. Any later disposal policy needs separate authority and must account for still-restorable copies. |

Record unresolved custody facts explicitly. There is no invented deployment
retention deadline, rights guarantee or all-copies-deleted certificate here.

## 5. Separate synthetic PG16 proof

From a dotenv-free captured source capsule with its regenerated client and PG16
tools in PATH, give an explicit owned loopback `DATABASE_URL` ending `_test` and
the capsule's original manifest. No credentials from a deployed environment:

```sh
node_modules/.bin/tsx scripts/game-data-lifecycle-proof.mts \
  --output /NEW/PRIVATE/lifecycle-proof --manifest /CAPSULE/manifest.json
```

The parent directory must exist; output must not exist. The URL supplies only
the disposable connection. The proof leases and creates two unpredictable new
databases from `template0`, never adopting the named database. It dumps an ACTIVE
synthetic game before retirement, completes/archives through real command
handlers, purges through actual lifecycle entry points, keeps the receipt outside
both databases, physically restores into its new staging DB, observes the block,
explicitly removes that exact reintroduced identity only in owned unserved staging,
and rechecks. The other game's complete graph digest must be unchanged. Ordinary
live plan/apply remains refused. No app build or browser recovery is claimed;
`attribution.build` is null. CLI proof verifies captured source before and after.

`lifecycle.json` records actual PG versions, source/policy/tool identity, target
identities, stage exit codes, observations and cleanup. Nonzero backup/restore,
proof interruption, source drift or cleanup failure cannot become success. Reports
and private synthetic custody/dump artifacts remain for diagnosis; do not publish
the custody subtree. Cleanup drops only successfully created databases under live
matching leases, without force, and releases those leases. Lost ownership or failed
drop keeps a failure and resource for explicit reconciliation. Never clear a stale
lease or stop a cluster merely because its name resembles this proof. A hard kill
cannot run cleanup; keep the run/ownership record and have its owner reconcile.

The original [playable recovery drill](recovery-drill.md) is a **different required
gate**. A lifecycle block is not playable recovery; a playable old restore is not
retirement clearance. U5 owns canonical/CI wiring and final exact-source reruns.
