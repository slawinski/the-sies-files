import net from 'node:net';
import { isDeepStrictEqual } from 'node:util';
import { PrismaClient } from '@prisma/client';

export async function lifecycle(action: string, extra: Record<string, unknown> = {}) {
  if (!process.env.SIES_RECOVERY_SOCKET || !process.env.SIES_RECOVERY_TOKEN) throw new Error('Recovery requires its owning parent');
  return new Promise<Record<string, unknown>>((resolve, reject) => {
    const socket = net.createConnection(process.env.SIES_RECOVERY_SOCKET!);
    let data = '';
    socket.setTimeout(150_000, () => socket.destroy(new Error('Lifecycle request timed out')));
    socket.on('connect', () => socket.write(JSON.stringify({ action, token: process.env.SIES_RECOVERY_TOKEN, ...extra }) + '\n'));
    socket.on('data', chunk => { data += chunk.toString(); });
    socket.on('error', reject);
    socket.on('end', () => {
      try { const response = JSON.parse(data); if (response.error) reject(new Error(response.error)); else resolve(response.value); }
      catch { reject(new Error('Incomplete lifecycle response')); }
    });
  });
}

export type Rows = Record<string, Record<string, unknown>[]>;
const direct = ['players', 'setup_drafts', 'operational_phases', 'effects', 'death_records', 'investigation_states', 'nominations',
  'scenario_states', 'scenario_discoveries', 'task_states', 'scenario_conditions', 'qr_scans', 'checkpoints', 'domain_events', 'command_receipts'];
const predicates: Record<string, string> = {
  game_sessions: 't.id = $1',
  ...Object.fromEntries(direct.map(table => [table, 't."gameId" = $1'])),
  player_claims: 't."playerId" IN (SELECT id FROM players WHERE "gameId" = $1)',
  browser_sessions: 't."storytellerGameId" = $1 OR t."playerId" IN (SELECT id FROM players WHERE "gameId" = $1)',
  player_secrets: 't."playerId" IN (SELECT id FROM players WHERE "gameId" = $1)',
  operational_actions: 't."operationalPhaseId" IN (SELECT id FROM operational_phases WHERE "gameId" = $1)',
  votes: 't."nominationId" IN (SELECT id FROM nominations WHERE "gameId" = $1)',
};

export async function durableRows(db: PrismaClient, gameId: string): Promise<Rows> {
  return db.$transaction(async tx => {
    const rows: Rows = {};
    for (const [table, predicate] of Object.entries(predicates)) {
      // Identifiers/predicates are a closed source-controlled list; only the
      // game ID is parameterized. Sensitive values never leave this process.
      const result = await tx.$queryRawUnsafe<{ row: Record<string, unknown> }[]>(`SELECT to_jsonb(t) AS row FROM "${table}" t WHERE ${predicate} ORDER BY to_jsonb(t)::text`, gameId);
      rows[table] = result.map(r => r.row);
    }
    return rows;
  }, { isolationLevel: 'RepeatableRead' });
}

export function equalPrivate(actual: unknown, expected: unknown, claim: string) {
  // Native assertion diffs would publish secrets/session hashes. Only the
  // family/claim name is safe to put in native failure evidence.
  if (!isDeepStrictEqual(actual, expected)) throw new Error(`Recovery comparison failed: ${claim}`);
}

export function equalRows(actual: Rows, expected: Rows) {
  for (const family of Object.keys(predicates)) equalPrivate(actual[family], expected[family], family);
}

export function assertContinuation(before: Rows, after: Rows, actor: string, nominationId: string, commandId: string) {
  const expected = structuredClone(before);
  const game = expected.game_sessions[0];
  const actualGame = after.game_sessions[0];
  equalPrivate(actualGame.version, Number(game.version) + 1, 'one version');
  equalPrivate(actualGame.eventSequence, Number(game.eventSequence) + 2, 'two event sequences');
  game.version = actualGame.version; game.eventSequence = actualGame.eventSequence; game.updatedAt = actualGame.updatedAt;
  const nomination = expected.nominations.find(n => n.id === nominationId)!;
  equalPrivate(nomination.currentVirtualSeat, 1, 'prior seat');
  nomination.currentVirtualSeat = 2;
  const added = (family: string) => after[family].filter(a => !before[family].some(b => b.id === a.id));
  const votes = added('votes');
  equalPrivate(votes.length, 1, 'one new vote');
  equalPrivate({ actor: votes[0]?.playerId, intent: votes[0]?.rawIntent, nomination: votes[0]?.nominationId }, { actor, intent: false, nomination: nominationId }, 'next vote identity');
  const receipts = added('command_receipts');
  equalPrivate(receipts.length, 1, 'one new receipt');
  equalPrivate({ command: receipts[0]?.commandId, version: receipts[0]?.resultingVersion }, { command: commandId, version: actualGame.version }, 'continuation receipt');
  const events = added('domain_events').sort((a, b) => Number(a.sequence) - Number(b.sequence));
  equalPrivate(events.map(e => e.eventType), ['VOTE_INTENT_RECORDED', 'VOTE_PASS_ADVANCED'], 'exact event types');
  equalPrivate(events.map(e => e.commandId), [commandId, commandId], 'event command identities');
  for (const family of ['votes', 'command_receipts', 'domain_events']) {
    expected[family].push(...added(family));
    const sort = (rows: Record<string, unknown>[]) => [...rows].sort((a, b) => String(a.id).localeCompare(String(b.id)));
    expected[family] = sort(expected[family]); after[family] = sort(after[family]);
  }
  equalRows(after, expected);
}
