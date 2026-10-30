# The Sieś Files — Updated Screen Specifications v1

**Purpose:** implementation reference for the redesigned UI  
**Relationship to prototype:** preserves mood, bento hierarchy, document language and strong state changes; intentionally removes excess grunge, permanent hero imagery, repetitive fingerprints/clips and generic red CTAs.

---

## 1. Player — Akta / Investigation Home

### Goal

Give the player a calm “what matters now” screen during free investigation.

### Mobile frame

Target: 390×844.

```text
┌─────────────────────────────────┐
│ The Sieś Files      LIVE        │
│ DOCHODZENIE · CYKL 2             │
├─────────────────────────────────┤
│ [ Żyjesz ]     [ 1 głos ducha ] │
├─────────────────────────────────┤
│ AKTA / TERAZ                      │
│                                  │
│  paper dossier                   │
│  NOWA WSKAZÓWKA                  │
│  "Przy stodole..."               │
│  received 23:15                  │
│                                  │
│  [ Otwórz w dzienniku ]          │
├─────────────────────────────────┤
│ Aktywne zadanie                  │
│ Znajdź oznaczenie przy ognisku   │
│                    [ Mapa → ]    │
├─────────────────────────────────┤
│ ostatnie zdarzenie               │
│ Nominacje jeszcze zamknięte      │
├─────────────────────────────────┤
│ Akta | Gracze | Dziennik | Mapa │
└─────────────────────────────────┘
```

### Visual

- no large village hero while playing;
- compact wordmark;
- dark shell;
- 2 small status tiles max;
- evidence is warm paper;
- normal CTA is brass/neutral, not red;
- bottom nav modern and restrained.

### States

- clue unavailable: omit card; do not show `???`;
- no task: map preview may take secondary slot;
- offline: connection badge becomes banner only if interaction is blocked.

---

## 2. Player — Private Role Reveal

### Goal

Make role reveal deliberate, private and memorable.

### Covered state

```text
dark full-screen overlay

THE SIEŚ FILES
INFORMACJA PRYWATNA

Upewnij się, że nikt nie widzi ekranu.

[ Pokaż moją rolę ]
```

No alignment color or role-specific graphic appears before reveal.

### Revealed state

```text
┌───────────────────────────────┐
│ INFORMACJA PRYWATNA           │
│                               │
│   parchment dossier           │
│   TWOJA ROLA                  │
│   Wróżka                      │
│   Dobro                       │
│                               │
│   Zdolność                    │
│   [full readable ability]     │
│                               │
│   Informacja początkowa...    │
│                               │
│   [ Zapamiętałem — ukryj ]    │
└───────────────────────────────┘
```

### Differences from prototype

Keep:
- paper;
- typewriter role heading;
- privacy warning;
- dramatic scale.

Remove:
- unrelated suspect portraits;
- unnecessary fingerprint decoration;
- oversized permanent logo;
- bright danger-red acknowledgement.

Use one discreet stamp/mark maximum.

---

## 3. Player — Operational Action

### Goal

One action, one instruction, one target decision.

```text
CaseHeader
CICHA AKCJA · TYLKO DLA CIEBIE

[ dark/secret primary card ]
Wybierz osobę
Krótka, plain-language instrukcja.

┌ PersonTile ┐
│ 03  Ela    │ selected
└────────────┘
┌ PersonTile ┐
│ 04  Janek  │
└────────────┘
...

[ Zatwierdź wybór ]

helper:
Po wysłaniu wybór może być nieodwracalny.
```

### Behavior

- selection is local;
- submission waits for server acknowledgement;
- success changes to neutral waiting state;
- waiting state does not reveal who else is acting.

### Visual

No evidence document unless the action actually delivers evidence.

---

## 4. Player — Gracze

### Goal

Fast public-state scan of 13–16 people.

```text
header
GRACZE
[ 11 żyje ] [ 2 nie żyje ]

03  Ela          żyje
04  Janek        nie żyje · głos ducha dostępny
05  Sołtys       żyje
...
```

Use:
- initials/avatar;
- seat;
- name;
- public status;
- optional nominee/current voter treatment.

Do not invent:
- alibis;
- personality tags;
- “milczy”;
- biographies

unless those are real scenario data.

Prototype “resident dossiers” may be implemented later as scenario-specific content layered on top of the canonical roster.

---

## 5. Player — Dziennik

### Goal

Persistent memory without turning engine audit into player-facing logs.

```text
DZIENNIK · CYKL 2

23:15  Otrzymano nową wskazówkę
       [paper excerpt]

23:09  Mapa została uzupełniona

22:54  Nominacje zamknięte
       Wybrano ...
```

### Visual

- dark product timeline;
- paper only for content artifacts;
- timestamps visually secondary;
- no giant “close journal” CTA; bottom nav handles navigation.

---

## 6. Player — Formal Nomination / Voting

### Goal

Interrupt free exploration and make the public decision unambiguous.

```text
CaseHeader with thin rust line
GŁOSOWANIE · FORMALNY TRYB

[ Nominee ]
Janek
nominowany przez Elę

Twój głos
[ TAK ]   [ NIE ]

ghost vote:
Masz jeden głos ducha. Użycie go jest trwałe.

[ status after submit ]
Twój głos został zapisany: TAK
```

### Visual

- rust replaces moss/brass as dominant accent;
- rest of shell stays dark;
- no map/scanner CTA above fold;
- no blood/horror language;
- no danger-red unless destructive admin action.

### Result

Result screen is compact and public:
- nominee;
- effective total;
- threshold;
- passed/failed;
- resulting engine outcome.

Do not show decorative portraits just to fill the screen.

---

## 7. Player — Map

### Goal

Make terrain usable outdoors and let map reveal feel like discovering new case material.

```text
compact header
MAPA · SIEŚKI 13

[ current task chip ]

┌───────────────────────────────┐
│                               │
│        MAP ARTWORK            │
│      pan/zoom/markers         │
│                               │
└───────────────────────────────┘

[ Skanuj kod QR ]
known locations / selected location
BottomNav
```

### Base map

- composition ends naturally at western edge;
- no fog/lock/blank area implying an extension.

### Extended

On unlock:
- short “Nowy fragment mapy” notice;
- visual annex/extension transition;
- newly authorized markers arrive with the state;
- no separate Game Engine phase change.

---

## 8. Storyteller — Session Lobby / Setup

### Goal

Prepare the game without reproducing the prototype's decorative density.

Tablet/desktop:

```text
Rail              LOBBY / PRZYGOTOWANIE
                  case "..."
Control           ┌ participants ┐ ┌ readiness ┐
Players           │ 14 / 16      │ │ 12 ready  │
Grimoire          └──────────────┘ └───────────┘
Scenario
Audit             ┌─────────────────────────────┐
System            │ Wirtualny krąg              │
                  │ 01 Ela       connected       │
                  │ 02 Janek     waiting claim   │
                  │ ...                         │
                  └─────────────────────────────┘

                  [ Configure roles / Grimoire ]
                  [ Start role reveal ] only when valid
```

Use a small rural/case image in an optional top-right tile, not a background under controls.

---

## 9. Storyteller — Control Home

### Goal

Run the game from one operational screen.

```text
Rail        CASE / PHASE / CYCLE        live ●

            ┌────────────────────────┬──────────────┐
            │ TERAZ                  │ HEALTH       │
            │ Wróżka czeka na wybór  │ 14 online    │
            │ player: Ela            │ 0 degraded   │
            │ [details if needed]     │              │
            └────────────────────────┴──────────────┘

            ┌────────────────────────┬──────────────┐
            │ KOLEJKA OPERACYJNA     │ GRACZE       │
            │ ✓ Poisoner             │ 13 alive     │
            │ → Fortune Teller       │ 1 dead       │
            │ · Monk                 │ 1 attention  │
            └────────────────────────┴──────────────┘

            ┌───────────────┬───────────────────────┐
            │ NOMINACJE     │ SCENARIUSZ            │
            │ closed        │ stage / latest scan   │
            └───────────────┴───────────────────────┘
```

The active blocker always gets the largest/highest card.

No audit log on this page.

---

## 10. Storyteller — Required Decision

When the engine requires Storyteller judgment, `TERAZ` expands.

Example:

```text
WYMAGANA DECYZJA
Imp zabił gracza X.

Efekt do rozstrzygnięcia:
[ target / redirect controls defined by action schema ]

context:
- affected character
- relevant malfunction state
- eligible successor / redirect choices

[ Zatwierdź rozstrzygnięcie ]
```

This card should expose semantically required options directly, including special redirect/succession decisions where supported by the engine.

If the actor is malfunctioning, the Storyteller must see the functioning state prominently enough to know information may need to be false.

---

## 11. Storyteller — Players

```text
GRACZE                    [ Ułóż krąg ]

seat | name | access | connection | alive | role | •••
01     Ela    claimed   live         yes    ...
02     Janek  pending   —            yes    ...
```

Overflow:
- rename;
- claim link;
- reset;
- remove.

Arrange mode:
- drag handles/up-down keyboard controls;
- no remove/reset controls visible while arranging.

---

## 12. Storyteller — Grimoire

### Candidate

```text
GRIMUAR · NIEZATWIERDZONY

distribution summary

01 Ela      Wróżka       GOOD
02 Janek    Drunk → Monk GOOD
...

Red herring: ...
Demon bluffs: ...

[ Przegeneruj ] [ Zatwierdź układ ]
```

### Committed

Read-only board with status/effect badges.

Provide one **Privacy cover** control that hides role names instantly.

---

## 13. Storyteller — Scenario

```text
SCENARIUSZ

[ stage ] [ map state ] [ active conditions ]

REVEALED EVIDENCE
...

TASKS
...

RECENT SCANS
...

Advanced overrides ▸
```

Overrides are not visible until expanded.

Use human labels; raw IDs are secondary.

---

## 14. Storyteller — Audit

Dense utility screen, intentionally less cinematic.

```text
AUDYT
[ search ] [ category filters ] [ range ]

#123 23:14 NOMINATION_LOCKED  ST  v42
#122 23:13 VOTE_CAST          Ela v41
...

row expand -> technical payload
```

This is a tool, not a bento mood screen.

---

## 15. Storyteller — System / Recovery

```text
SYSTEM
Realtime
Presence
Latest checkpoint
Diagnostics

DANGER ZONE
Recovery override
[ Enter ]
```

Recovery sequence:
- operation;
- human-readable target;
- resulting state preview;
- reason;
- confirmation.

Never present a raw ID text input as the preferred path when a known player/action can be selected.

---

## 16. Shared screen-state matrix

| State | Player primary surface | Storyteller primary surface |
|---|---|---|
| setup | claim/wait | readiness/setup |
| role reveal | private reveal | reveal readiness |
| operational: player required | action stage | waiting blocker |
| operational: ST required | neutral waiting | decision blocker |
| investigation | evidence/task | investigation status |
| nominations open | formal nomination | nomination controller |
| voting | focused vote | vote pass/controller |
| execution resolution | result/status | resolution action |
| scenario unlock | evidence/map notice | scenario pulse |
| ended | end-state summary | end-state control |

---

## 17. Copy rules

Player copy:
- plain Polish;
- no engine enum names;
- short verbs;
- clearly differentiate `wybierz` from `zatwierdź`.

Storyteller:
- human label first;
- technical code/ID optional secondary;
- explicit consequence for phase/recovery actions.

---

## 18. Screenshot acceptance

Each implemented screen should be screenshot-tested at:

Player:
- 390×844;
- 360×800;
- 430×932.

Storyteller:
- 1024×768;
- 1280×800;
- 1366×1024.

Review screenshots in:
- normal state;
- long Polish name;
- long ability/evidence copy;
- offline/reconnecting;
- error state where applicable;
- reduced-motion is behavioral rather than screenshot-only.

The final screenshots should be recognizably related to the supplied prototypes, but visually cleaner, more contemporary and more operationally focused.
