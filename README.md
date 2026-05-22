# Hype Racer Tycoon

A single-file Three.js racing game with a coins/upgrades loop, a Monaco circuit, an
on-podium celebration, and a territory leaderboard. The game itself is one
hand-rolled HTML file (no build step, no framework); a small serverless function
adds an optional live leaderboard backed by Supabase.

## What's in here

```
.
├── public/
│   └── index.html      ← the game (everything: HTML, CSS, JS, Three.js via CDN)
├── api/
│   └── scores.js       ← leaderboard read/write (Vercel serverless function)
├── supabase.sql        ← database schema + upsert (run once in Supabase)
├── package.json        ← one dependency, for the function only; no build step
├── .env.example        ← the two environment variables the leaderboard needs
└── README.md
```

Only `public/` is served to the browser, so `supabase.sql`, `package.json`, and this
README are never publicly reachable.

## Deploy and share a URL (fast path — ~5 minutes)

You can ship a working, shareable build **without a database**. The leaderboard
shows believable mock data until you connect Supabase, and everything else works.

1. Create a new GitHub repository and upload these files (or `git push` them).
2. Go to vercel.com, **Add New → Project**, and import the repo.
3. If Vercel asks, set **Framework Preset: Other**. It auto-detects the rest:
   install runs `npm install`, there is no build command, and `public/` is the
   static output.
4. Click **Deploy**. Share the resulting `https://<project>.vercel.app` URL.

Open it in a fresh or incognito browser for the intended first-time experience —
the demo-friendly starting state only applies to a clean save.

## Enable the live leaderboard (optional)

Turn the mock board into real, captured engagement.

1. Create a project at supabase.com.
2. In the Supabase **SQL Editor**, paste and run the contents of `supabase.sql`.
3. In Supabase **Project Settings → API**, copy the **Project URL** and the
   **`service_role`** key.
4. In Vercel **Project → Settings → Environment Variables**, add:
   - `SUPABASE_URL` = the Project URL
   - `SUPABASE_SERVICE_ROLE_KEY` = the service_role key
5. **Redeploy** (Vercel → Deployments → ⋯ → Redeploy).

The service_role key is server-side only. It lives in the function and must never
be exposed to the browser — that is the whole reason writes go through `api/scores.js`
rather than straight from the page.

## Local development (optional)

```
npm install
npm i -g vercel
vercel dev        # serves public/ and runs api/ locally
```

Add the two variables to a local `.env` (see `.env.example`) if you want the live
leaderboard locally; otherwise the mock board is used.

## Honest limits before a public campaign

- **Scores can be faked.** The function rejects implausible times and rate-limits,
  which raises the cost of cheating but cannot make a browser game tamper-proof.
  Manually vet any entry you intend to feature or award a prize to.
- **The rate limiter is best-effort.** It throttles a single warm serverless
  instance, not the whole fleet. For a real campaign, move the counter into
  Postgres or a dedicated limiter.
- **You are collecting personal data.** Names plus territory are personal data
  under GDPR, and the audience skews young, which carries heavier obligations.
  Sort consent and retention before a public launch.
- **Territory is a demo simplification.** Choosing a region in the dropdown sets
  where you compete. Production should separate the view filter from a home region,
  or derive region from request geo server-side.

## Tech notes

- The game loads Three.js r0.160 from cdnjs at runtime; nothing is bundled.
- No build step. The single file keeps mobile load fast.
- The serverless function uses ESM (`"type": "module"` in package.json) and the
  Supabase JS client over HTTP, so there are no direct Postgres connections to pool.
