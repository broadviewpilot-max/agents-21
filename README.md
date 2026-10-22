# Aimsir Funder Command Center

Private web app where five specialist sub-agents research a funder for The Aimsir Foundation and produce a **one-page funder brief** that Sean reviews and approves. The app has **no send/submit capability**.

Docs: [`docs/PRD.md`](docs/PRD.md) · [`docs/AGENTS.md`](docs/AGENTS.md)

## What it does
Priorities · deadlines · past awards · fit score vs. Aimsir programs · first-draft narrative sections · deadline pipeline (+ `.ics` calendar download).

Agents: Funder Intelligence → (Awards & 990 ∥ Deadlines) → Fit Scoring → Narrative Drafter / Brief Editor. Every "confirmed" fact must cite a URL the agent actually saw; otherwise it is downgraded to "inferred". Awards without a traceable source are dropped. Figures in drafts that are not in Aimsir's source data are flagged in the brief's "Verify" list. Approval is blocked while open items remain unless an override note is recorded.

## Deploy (Netlify)
1. Netlify > Add new site > Import from GitHub > this repo, branch `main`. Build settings come from `netlify.toml`.
2. Site configuration > Environment variables (see `.env.example`):
   | Variable | Required | Notes |
   |---|---|---|
   | `APP_PASSWORD` | yes | Login passphrase. Unset = nobody can sign in. |
   | `SCRAPECREATORS_API_KEY` | yes | Google search + LinkedIn signals. |
   | `ANTHROPIC_API_KEY` | yes | Powers the agents. Create at platform.claude.com/settings/keys (API billing is separate from a Claude subscription). |
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
