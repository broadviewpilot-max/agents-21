# Aimsir Funder Command Center

Private web app where five specialist sub-agents research a funder for The Aimsir Foundation and produce a **one-page funder brief** that Sean reviews and approves. The app has **no send/submit capability**.

Docs: [`docs/PRD.md`](docs/PRD.md) · [`docs/AGENTS.md`](docs/AGENTS.md)

## What it does
Priorities · deadlines · past awards · fit score vs. Aimsir programs · first-draft narrative sections · deadline pipeline (+ `.ics` calendar download).

Agents: Funder Intelligence → (Awards & 990 ∥ Deadlines) → Fit Scoring → (Narrative Drafter ∥ Gemini Verifier) → Brief Editor. Every "confirmed" fact must cite a URL the agent actually saw; otherwise it is downgraded to "inferred". Awards without a traceable source are dropped. Figures in drafts that are not in Aimsir's source data are flagged in the brief's "Verify" list. Approval is blocked while open items remain unless an override note is recorded.

## Deploy (Netlify)
1. Netlify > Add new site > Import from GitHub > this repo, branch `main`. Build settings come from `netlify.toml`.
2. Site configuration > Environment variables (see `.env.example`):
   | Variable | Required | Notes |
   |---|---|---|
   | `GOOGLE_CLIENT_ID` | no (recommended) | Turns on **Sign in with Google**. A public ID, not a secret. See "Google sign-in setup" below. |
   | `ALLOWED_EMAILS` | with Google | Comma-separated emails allowed in. Required when `GOOGLE_CLIENT_ID` is set; if empty, nobody can sign in. |
   | `APP_PASSWORD` | no | Optional backup login. With neither Google nor a password set, the site is in **open mode** (anyone with the URL can use it and spend your API credits). |
   | `MAX_RUNS_PER_DAY` | no | Default 25. Cost guard on research runs. |
   | `SCRAPECREATORS_API_KEY` | yes | Google search + LinkedIn signals. |
   | `ANTHROPIC_API_KEY` | yes | Powers the agents. Create at platform.claude.com/settings/keys (API billing is separate from a Claude subscription). |
   | `GEMINI_API_KEY` | no (recommended) | Enables the Verifier agent: Gemini re-reads each cited source page and tags every CONF claim ✓ / ~ / ✗. Create at aistudio.google.com. |
   | `GEMINI_MODEL` | no | Default `gemini-3.8-flash`. If the Test Gemini button says the model is not found, it lists valid names. |
   | `FIRECRAWL_API_KEY` | no | Better page reading; falls back to plain fetch. |
   | `ANTHROPIC_MODEL` | no | Default `claude-sonnet-5-5`. |
   | `SC_MAX_CREDITS_PER_RUN` | no | Default 15. |
3. Open the site > Settings tab to confirm each connection.

Never commit keys. `.env` is git-ignored.

## Data sources
- **Scrape Creators** (`/v1/google/search`, `/v1/linkedin/company/posts`, `/v1/account/credit-balance`): discovery and social signals only. It has no grants/990 endpoints.
- **ProPublica Nonprofit Explorer** (free): EIN and 990 filings.
- **Grants.gov `search2`** (free, no auth): federal opportunities and close dates.
- **Firecrawl** (optional): funder pages and 990 PDFs.

## Develop
```
npm install
npm test          # guardrail + mocked end-to-end pipeline tests
npm run build     # typecheck + vite build
npx netlify dev   # local site + functions (needs env vars)
```
Storage is Netlify Blobs. Programs and scoring weights seed from `config/` and are editable in the app.

## Google sign-in setup (one time, about 10 minutes)
1. Go to console.cloud.google.com, sign in, and create a project (for example "Aimsir Funder Center"). Menu names change; search the console for "Credentials" if you cannot find an item.
2. Open **APIs & Services > OAuth consent screen** (newer consoles call it **Google Auth Platform**). Choose **External**, enter an app name and your support email, and save. Add your own Gmail address under **Test users** (leaving the app in "Testing" is fine for one user).
3. Open **Credentials > Create credentials > OAuth client ID**. Application type: **Web application**. Under **Authorized JavaScript origins**, add your site address exactly, for example `https://regal-mochi-8156ad.netlify.app` (no trailing slash, no path). No redirect URI is needed.
4. Copy the **Client ID**.
5. In Netlify > Site configuration > Environment variables, add `GOOGLE_CLIENT_ID` (the Client ID) and `ALLOWED_EMAILS` (your Gmail address). Redeploy.
6. Open the site: you will see a **Sign in with Google** button. Settings should show Access: `google`.

How it works: the browser gets a signed Google ID token; the server verifies its signature, issuer, audience and expiry, requires a verified email on `ALLOWED_EMAILS`, then issues its own 12-hour session token signed with a random server-side secret. Removing an email from `ALLOWED_EMAILS` revokes that person's sessions. Keep `APP_PASSWORD` set as a backup until Google sign-in works, then remove it.
