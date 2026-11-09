# Durable command outcome compatibility

This is a local, synthetic service-level compatibility check, not a deployment
or a general binary-upgrade promise. A is Git commit
`c2e00f2a9fb505b1f159476447acd880b7216dc2`. B is the full captured source SHA-256
identity in `run.json` and `compatibility/compatibility.json`, with selected
service/schema hashes recorded alongside it. Package version `0.1.0` does not
identify either implementation.

## How evidence is produced

Before entering the history-free baseline capsule, the parent reads A's exact
Git objects through an explicit source/config/test/migration allowlist. It never
copies dotenv files, Git history, credentials or generated clients. Missing A
is a hard failure; CI fetches complete history so the object is available.

A and B have separate generated Prisma clients and separate processes. All
workers inherit the same live disposable-database lease, execute sequentially,
and reset only that target. A first commits real `addPlayer`, manual checkpoint
and meaningful QR scan results against A's schema. B applies its additive
migration and reads those preserved rows. A then commits another specimen
against the expanded schema (new metadata remains null), and B writes its own
fully identified receipts. Synthetic receipt/event specimens are generated from
these committed rows; no handwritten fixture is called an actual A result.
Raw credentials and request hashes are not exported in the specimens or logs.

Every status and duplicate observation fingerprints the complete authoritative
game/receipt state and effect counts before and after, refusing any change.
The report also discovers A's and B's test identities and requires all original
292 unit/integration, 38 ordinary browser, 18 enabled-security and one physical
recovery identities to remain present. Discovery is not a replacement for the
baseline's actual B test executions.

## Supported observations

| Writer / reader | Observation |
|---|---|
| A before additive migration → B | Three original committed rows survive and pass bounded status reads |
| A on expanded schema → B | Three metadata-free committed formats pass bounded status reads |
| A → B duplicate POST | All three refuse with `COMMAND_RECEIPT_INVALID`; no effects repeat |
| B → B | Selected service duplicate/status paths validate identified results; all 36 producers are additionally contract-audited and tested |
| B → actual A | Actual A status and same-intent addPlayer/checkpoint/scan duplicate services observe unchanged result fields without another effect |

Legacy status requires a single primary event, matching actor/version across
the entire command group, validated payload and matching result IDs. Only full
meaningful scans are supported. A duplicate-only scan, ambiguous events, null
JSON, partial metadata and unknown versions fail closed. Player ownership is
established before decoding; another actor sees the same `UNKNOWN` body as an
absent command. `resultVersion: 0` explicitly labels the bounded historical
adapter; it is not a backfill or inferred current identity.

## Unsupported paths

**This is not safe operational rollback to A.** A ignores receipt identity
metadata, retains unsafe casts for corrupt results, and can fabricate a raw
reset token on duplicate. Cross-actor/request replay and reset replay through A
are not supported. No future reader is promised. Use a forward fix; do not drop
metadata or delete invalid receipts to make old code rerun commands.

An APPLIED receipt proves a commit, not current projection freshness and not
availability of a one-time credential. Duplicate issue/reset returns the
original version with `credentialAvailable: false`, without issuing a token or
revoking reclaimed access. New issuance is a separate deliberate command.

QR recovery stores only a format version, operation, game/player IDs and the
original command ID in same-tab storage. It never persists a token, result,
role or payload. A storage-blocked browser retains in-memory recovery but
cannot recover across reload. UNKNOWN is unresolved, never permission to POST
again. Current access-generation checks guard all private callbacks.

The production baseline requires compatibility, original ordinary/security
checks, and the existing create-only physical recovery proof. Its reports keep
source/build attribution and failed evidence. No retention or content-rights
policy is introduced by this work.
