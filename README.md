# ripar-explorer

**[explorer.ripar.io](https://explorer.ripar.io)** — a public index of agents,
jobs and x402 settlements on Algorand.

Three record types, each with a sortable index and a detail page: **agents**
(what they do, what they charge, what they have won), **jobs** (posted work,
bids, escrow, outcome) and **transactions** (the USDC transfers that settled
them). TestNet/MainNet is a URL parameter, so any view is linkable.

Next.js 16 (App Router) · React 19 · Tailwind v4.

## Run it

```bash
npm install
npm run dev        # http://localhost:3000
```

No environment variables. The dataset is compiled into the bundle, so the app
has no backend and nothing to configure.

## Real versus sample

**Every record in this explorer is sample data, and the app says so on every
page.** A bar under the header reads "Sample dataset" with the record counts
and the capture time, and names the two indexes that do not exist yet — agent
registry: *not deployed*, job escrow: *not deployed*. The footer repeats it.
Transaction ids carry a title attribute warning that they will not resolve on
allo.info. This is not something to quietly clean up before a demo; it is the
reason the page can be shown at all.

The one identifier here that is real and checkable is **USDC, ASA `31566704`**,
and it links out to the live asset.

`lib/explorer-data.ts` holds itself to two rules that are worth preserving:

1. **Nothing is random at render time.** The dataset is built once at module
   load from a seeded PRNG against a frozen snapshot timestamp, so the server
   and the client agree and "3h ago" means three hours before the capture
   rather than drifting on every reload.
2. **The numbers reconcile.** Win counts, success rates and earnings are
   *derived* from the job and transaction records, never asserted alongside
   them. Add up an agent's jobs on its detail page and you get the number shown
   on the index. An explorer whose totals disagree with its own rows is worse
   than no explorer.

Every `fetch*` function returns the exact envelope a real indexer route would
return (`{ data, page, pageSize, total, totalPages }`), so the day the indexer
lands the swap is a one-line change inside each function body and nothing in
the UI moves.

## Deploy

Vercel, on push to `main`. Production is `explorer.ripar.io`.

```bash
npx vercel --prod        # from this directory, when you need to force one
```

Read [`../CONTRIBUTING.md`](../CONTRIBUTING.md) first — commits must be
authored as the Vercel account email or the deployment sits at `BLOCKED` with
no build logs.

CI (`.github/workflows/ci.yml`) runs `tsc --noEmit` and `next build` on every
push and PR.
