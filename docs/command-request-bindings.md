# Command intent binding audit

Every row uses result version 1 and binds the operation and authenticated logical
actor in addition to these inputs. `commandId` and `expectedVersion` are not
semantic inputs. Object keys are canonicalized; arrays retain their order.
The production-callsite audit requires exactly one callsite per catalog entry.

| Operation | Semantic input | Actor |
|---|---|---|
| renameGame | normalized name | storyteller |
| setParticipantKind | playerId, participantKind | storyteller |
| addPlayer | normalized displayName | storyteller |
| updatePlayer | playerId, normalized displayName | storyteller |
| removePlayer | playerId | storyteller |
| reorderPlayers | orderedPlayerIds | storyteller |
| issueClaimToken | playerId; excludes generated tokenHash/expiry | storyteller |
| generateSetup | seedSupplied marker and explicit seed when supplied | storyteller |
| commitSetup | empty | storyteller |
| acknowledgeRole | empty | player |
| startOperational | empty | storyteller |
| submitAction | actionId, ordered targetPlayerIds | player |
| resolveAction | actionId, resolutionSupplied marker, supplied resolution | storyteller |
| completeOperational | empty | storyteller |
| openNominations | empty | storyteller |
| closeNominations | empty | storyteller |
| nominate | nomineeId | player |
| resolveNominationTrigger | nominationId, optionId | storyteller |
| voteIntent | nominationId, intent | player |
| startVotingPass | nominationId | storyteller |
| advanceVotingPass | nominationId | storyteller |
| lockVote | nominationId | storyteller |
| resolveExecution | empty | storyteller |
| exileTraveller | playerId | storyteller |
| slayer | targetPlayerId | player |
| resolveSlayerDecision | slayerPlayerId, optionId | storyteller |
| closeInvestigation | empty | storyteller |
| scanQr | SHA-256 semantic token digest; never raw token | player |
| storytellerRevealClue | clueId, targetSupplied marker, supplied targetPlayerId | storyteller |
| storytellerCompleteTask | taskId | storyteller |
| storytellerSetStage | stageId (existing handler does not trim stored value) | storyteller |
| storytellerSetMap | mapVersionId | storyteller |
| storytellerSetCondition | conditionId, active | storyteller |
| createCheckpoint | reasonSupplied marker, supplied reason (existing normalization) | storyteller |
| resetPlayerAccess | playerId; excludes generated token/hash/expiry | storyteller |
| recoveryOverride | structured payload, trimmed reason | storyteller |

Hashes are equality checks, not authorization, and are not returned or logged.
Historical null metadata is not default identity. All historical duplicate POSTs
are refused without changing receipts or invoking handlers.
