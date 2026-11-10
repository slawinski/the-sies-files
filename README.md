This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Regression baseline

See the [baseline runbook](docs/regression-baseline.md) for isolated test-resource
setup and the [failure ledger](docs/regressions/README.md) for source-bound results.
The earlier three S1 production runs each passed 179 unit assertions and nine
browser scenarios. One later mechanical-fix production run passed 188 unit
assertions and nine browser scenarios; it is a separate captured identity, not
three repetitions of the final tree. Retain local `baseline-results/` evidence:
root ESLint and TypeScript exclude these historical source capsules.

The [client reconciliation evidence](docs/regressions/reconcile-client-state.md)
records the review follow-up for findings #1–#5, retained test-first reds, and
one current canonical production plus one development run: **212/212 unit
assertions and 38/38 browser scenarios per profile**, including all 31 earlier
browser cases and seven review additions. Both measured source
`8a407f82c8d9e542bf16d65c480563b719eb012e69b14b4ec3bb42907a3fbcd2`;
the earlier 212/31 profiles measured a different source. This README note was
added after measurement; see the ledger for profile logs and coverage limits.

The production baseline now also requires a separately owned physical
[restore-and-continue drill](docs/recovery-drill.md). Its bounded scope, operator
instructions and [verification ledger](docs/recovery-verification.md) distinguish
archive restoration, durable/runtime equality and legal continuation from the
narrow player-flag replay diagnostic.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

The current UI uses the system sans/monospace font stacks in
`src/app/globals.css`. `src/app/layout.tsx` has no webfont loader, and no tracked
webfont binaries were observed.

## Content provenance and notices

See the [content inventory and notice guide](docs/content-provenance.md) and
[owner evidence checklist](docs/provenance-owner-evidence.md). Technical inventory
validity is separate from permission: the current state is
`permission_not_established`, with unresolved source/creator/grant and
distribution-review questions. This work establishes no first-party license or
reuse grant. Public repository visibility is not permission; the package's
`private` flag does not make the repository private. Local-only app execution,
potential static delivery and authorized in-game visibility are distinct.

`npm run provenance:refresh` explicitly updates the versioned inventory;
`npm run provenance:check` detects drift without refreshing it and retains full
available public upstream notices in ignored supplemental outputs. A technical
pass is not legal clearance or proof of complete shipped-binary composition.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
