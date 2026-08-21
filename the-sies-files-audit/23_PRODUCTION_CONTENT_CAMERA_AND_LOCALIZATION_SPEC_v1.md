# The Sieś Files — Production Content, Camera & Localization Specification v1

**Status:** Production-gate remediation  
**Version:** 1.0  
**Audit baseline:** `main@9099836`  
**Closes:** #9, #20, #21, #22, #23  
**Depends on:** Slice 5, Visual Design Spec, Map Asset Spec

---

## 1. Goal

Turn the current functional/dev-fixture experience into a production content package without changing stable domain IDs.

This spec covers:

- camera-based QR scanning;
- production `MAP_BASE` / `MAP_EXTENDED` artwork;
- production Millionaire scenario copy;
- approved Polish role names;
- a typed localization boundary for hard-coded UI strings.

---

## 2. Camera QR scanner

### 2.1 Product rule

Production player flow must not require manual QR ID/token typing.

Manual token input may remain behind an explicit development/test flag, but must be absent from the normal production UI.

### 2.2 Browser implementation

Use a browser camera flow compatible with current mobile PWA targets.

The scanner must:

1. request camera permission only after user interaction;
2. prefer the rear/environment camera;
3. show live preview;
4. decode QR payload locally in the browser;
5. send only the decoded token to the existing server scan endpoint;
6. stop media tracks immediately after success/cancel/unmount;
7. support retry after a non-match;
8. show a useful fallback when permission/device camera is unavailable.

Choose a maintained decoder implementation supported by the project's browser baseline. Avoid sending camera frames to the server.

### 2.3 Token contract

QR payload format remains the scenario-issued opaque token/identifier contract. The scanner must not accept arbitrary URLs and navigate to them automatically.

Parse:

- exact expected token format; or
- a versioned app URI containing the token, if production QR generation uses one.

Reject unrecognized payloads before server call.

### 2.4 Security/privacy

- camera permission is scoped to active scan flow;
- no image/video is stored;
- no frame is uploaded;
- production CSP must allow required camera/blob behavior without broad remote media origins.

### 2.5 Testability

Abstract decoder/camera adapter so Playwright can inject a decoded token without requiring physical camera hardware.

Provide a development-only test affordance guarded by environment/build flag.

---

## 3. Production map assets

### 3.1 Canonical states

Ship exactly the map visibility states already defined by the map contract:

- `MAP_BASE` — contains no hint of the hidden/locked extension;
- `MAP_EXTENDED` — reveals the extension as a discovery.

Do not generate the hidden region in the base asset at reduced opacity; it must be absent/occluded according to the established fog-of-war contract.

### 3.2 Asset manifest

Add a versioned asset manifest rather than hard-coded ad-hoc paths:

```ts
type MapAssetSet = {
  id: "TSF_MILLIONAIRE_MAP_V1";
  base: { src: string; width: number; height: number; hash?: string };
  extended: { src: string; width: number; height: number; hash?: string };
};
```

Recommended physical layout:

```text
public/maps/tsf-millionaire/v1/
  map-base.<web-format>
  map-extended.<web-format>
```

Use the exact dimensions/format chosen during final artwork export; both states must share compatible framing/aspect ratio so unlock does not cause disruptive layout jumps.

### 3.3 Production gate

Production build/content validation fails if the scenario points to:

- missing asset;
- schematic fallback;
- known design-reference placeholder.

The fallback may remain in development only.

### 3.4 Visual requirements

Conform to the established rural neo-noir + Bento visual system and the canonical map specification. The map need not be survey-accurate; navigation/readability and the reveal effect are the product requirements.

---

## 4. Production scenario prose

### 4.1 Current fixture policy

The current `TSF_Millionaire` content labels itself development fixture content. Keep it explicitly non-production until replaced/approved.

### 4.2 Versioned content pack

Separate scenario engine structure from production copy.

Recommended:

```text
src/content/scenarios/tsf-millionaire/v1/
  scenario.ts
  pl.ts
  validation.ts
```

or a validated JSON/TS equivalent.

Stable IDs remain unchanged where game saves/events depend on them.

### 4.3 Required content areas

Production copy must cover every player-visible and Storyteller-visible scenario surface used by the engine:

- scenario title/premise;
- evidence/clue reveal text;
- task text;
- QR discovery text;
- trap/injury/first-aid text where enabled;
- map unlock reveal;
- finale/end-state text;
- Storyteller notes/operator instructions;
- errors/invalid/repeat scan copy that is scenario-specific.

### 4.4 Content review gate

Before `productionReady: true`:

- no “dev fixture”, TODO, placeholder, lorem, internal implementation wording;
- Polish grammar/spelling reviewed;
- role/player placeholders use neutral role labels, not real participant names;
- clue ordering has no contradiction with unlock rules;
- secrets shown to the correct audience only;
- all QR tokens map to an existing content item/state transition.

Add a validation script/test that checks references/IDs, even though prose quality itself needs human approval.

---

## 5. Polish character names

### 5.1 Do not rename IDs

Keep machine IDs:

`WASHERWOMAN`, `LIBRARIAN`, ..., `IMP`, `BUREAUCRAT`.

Never migrate domain state to localized strings.

### 5.2 Character metadata

Extend character definition metadata:

```ts
interface CharacterDefinition {
  id: CharacterId;
  category: CharacterCategory;
  defaultAlignment: Alignment | null;
  publicCharacter: boolean;
  displayName: {
    pl: string;
  };
}
```

Ability text can be added as separate localized content if/when player role cards require it.

### 5.3 Approval

Do not derive final Polish names automatically by title-casing IDs.

Create an explicit reviewed mapping for all Trouble Brewing characters and Bureaucrat. “Pełnomocnik” remains the already-established public Polish label where canonical docs specify it.

Any other Polish name not already canonical in project docs requires product/content approval before production flag.

### 5.4 UI

All player/Storyteller/public role labels use `displayName.pl`, never:

- `id.replace("_", " ")`;
- title-case helper;
- raw enum value.

Tests should scan rendered role fixtures for raw English IDs.

---

## 6. i18n / string externalization

### 6.1 Scope

The current production language remains Polish. This is not a requirement to ship English now.

The goal is to stop hard-coding UI copy inside components and establish a typed locale boundary.

### 6.2 Lightweight first implementation

A full routing/localization library is optional for this one-locale MVP.

Recommended:

```text
src/i18n/
  types.ts
  pl.ts
  t.ts
```

with typed keys and interpolation.

Example:

```ts
t("storyteller.realtime.offline")
t("voting.currentPlayer", { name })
```

No dynamic string-key access from untrusted data.

### 6.3 What belongs in UI i18n

Externalize:

- navigation labels;
- buttons;
- status/error messages;
- generic game-phase labels;
- control-plane labels;
- scanner permission/errors;
- accessibility labels.

Keep versioned scenario prose in the scenario content pack, not the generic UI dictionary.

Keep character names in character metadata.

### 6.4 Locale source

For v1:

- app default = `pl`;
- no locale picker required;
- design API so another locale can be added without changing domain IDs.

### 6.5 Error mapping

Domain error codes remain stable machine codes. Map them to localized user copy at presentation boundary.

Do not persist translated error prose in domain events.

---

## 7. Production-content manifest

Add one release-readable manifest:

```ts
{
  scenarioPack: "TSF_MILLIONAIRE_V1",
  locale: "pl",
  mapAssetSet: "TSF_MILLIONAIRE_MAP_V1",
  productionReady: true
}
```

Release validation refuses `productionReady: true` unless:

- production map assets exist;
- scenario pack has no fixture flag;
- all character display names exist;
- i18n key completeness passes;
- scanner production mode does not expose manual token input.

---

## 8. Tests

### Camera

- permission accepted/rejected;
- rear-camera preference;
- decoded valid token triggers one scan command;
- invalid payload rejected locally;
- media tracks stop on success/cancel;
- duplicate scan follows existing idempotent scenario behavior;
- manual input absent in production build.

### Maps

- base state points to production base asset;
- extended unlock swaps to production extended asset;
- no missing/fallback asset in production manifest;
- framing dimensions compatible.

### Content

- every clue/task/QR reference resolves;
- every production-visible string is non-placeholder;
- production scenario does not contain fixture marker.

### Localization

- every character has `displayName.pl`;
- UI role render never falls back to raw ID;
- `pl` dictionary key completeness type-checks;
- representative pages render without hard-coded English role names.

---

## 9. Acceptance criteria

Done means:

- a player can scan real QR codes with the phone camera;
- manual QR token entry is not present in production UX;
- both production map states ship and the base map gives no hidden-area hint;
- Millionaire scenario content is explicitly approved/versioned as production;
- every role has an explicit approved Polish display name;
- UI copy comes through a typed Polish localization layer;
- stable domain/event IDs remain language-independent.
