# PRD — Aimsir Funder Command Center

**Owner:** Sean Smith, Founder & Executive Director, The Aimsir Foundation
**Status:** Draft v1 for owner confirmation — 2026-10-21
**Deploy target:** GitHub `main` → Netlify (continuous deployment)

Labels used: **[Confirmed]** verified from a source or stated by Sean · **[Decision]** conflict resolved by this PRD · **[Assumption]** planning value, change freely · **[Open]** needs Sean's input.

---

## 1. Summary

A private web app where a team of specialist sub-agents researches a funder and produces, per funder: priorities, deadlines, past awards, a fit score against Aimsir's programs, first-draft narrative sections, and a place on a deadline pipeline. Output is a **one-page funder brief** that Sean reviews and approves. **Nothing leaves the app** — it has no send, submit, or email capability.

## 2. Problem

Funder research is manual and scattered: priorities live on websites and 990s, deadlines live in email and memory, and "is this worth pursuing?" is judged by feel. Sean needs a repeatable, evidence-backed screen that ends in a single page he can act on.

## 3. Goals / Non-goals

**Goals**
1. Enter a funder (name/URL/EIN) → receive a reviewable one-page brief in minutes.
2. Every claim in the brief carries a source link and a status (Confirmed / Inferred / Unknown).
3. Transparent, adjustable fit score against Aimsir's programs.
4. A deadline pipeline spanning all tracked funders.
5. Human approval gate on every brief and every drafted narrative.

**Non-goals (v1)**
- Submitting applications, sending email, or contacting funders.
- Final submission narratives written to a specific RFP rubric (separate later task once a NOFO is in hand).
- Multi-user accounts, billing, CRM.

## 4. User

Single primary user (Sean), possibly a board member as read-only later. Context: time-poor, aviation-leader register, expects conclusion-first output.

## 5. Conflicts found and resolutions

| # | Conflict | Resolution |
|---|---|---|
| C1 | **Scrape Creators is a social-media scraping API** (TikTok, Instagram, YouTube, LinkedIn, Facebook, X, Reddit, Google Search, etc. — 38+ platforms). It has **no grants, 990, or RFP endpoints.** [Confirmed from docs.scrapecreators.com] | **[Decision]** Use it for what it does well: (a) `GET /v1/google/search` (1 credit/call) for funder discovery and deadline/announcement finding; (b) LinkedIn company page/posts, Facebook posts/events, X, Instagram for *recent priority signals and announcements*. It is **not** the system of record for awards or deadlines. |
| C2 | "Past awards" cannot come from Scrape Creators. | **[Decision]** Sources: ProPublica Nonprofit Explorer API (free; `/nonprofits/api/v2/search.json`, `/organizations/{ein}.json` — [Confirmed]) for filings/990 links; Firecrawl to read the funder's own grantee/"past awards" pages and 990 Schedule I PDFs; Grants.gov API (`api.grants.gov/v1/api/search2`, no auth — [Confirmed]) for federal opportunities and closing dates. Awards the agent cannot find are shown as **"Not found"**, never estimated. |
| C3 | Sub-agents need an LLM; only a Scrape Creators key was supplied. | **[Decision]** Agents call Claude via the Anthropic API. **[Open]** Sean must supply `ANTHROPIC_API_KEY`. Firecrawl access comes from the dev environment now; a `FIRECRAWL_API_KEY` is needed for the deployed site **[Open]**. |
| C4 | Spelling "Aimser" (request) vs "Aimsir" (Sean's profile). | **[Decision]** Use **Aimsir** everywhere. |
| C5 | Aimsir program list is not in the request. | **[Decision]** Fit scoring reads `config/aimsir-programs.json`, seeded with program areas from Sean's profile (First Flight Forward, discovery flights, ground school, scholarships, drone/UAS, mentorship). **[Open]** Sean confirms names, descriptions, geography, and budgets; no participant counts or financials are invented. |
| C6 | The API key was shared in chat; a public/main-branch repo would expose it if committed. | **[Decision]** Key lives only in Netlify environment variable `SCRAPECREATORS_API_KEY` and a git-ignored local `.env`. Called only from server-side Netlify Functions, never the browser. Repo contains `.env.example` only. |
| C7 | "Deploy to main" + "review before anything goes out." | **[Decision]** Code ships to `main` → Netlify. The app has **no outbound actions**; "going out" means Sean copies/exports an approved brief himself. |
| C8 | Netlify sync functions time out (~10–26 s); multi-agent research takes longer. | **[Decision]** Orchestrator runs as a **Netlify Background Function** (up to 15 min); UI polls a run-status record. Agents run in parallel where independent. |
| C9 | Social data is "unofficial," can be stale or missing. | **[Decision]** Each datum is stamped with source, retrieval time, and confidence; social signals can raise a "possible priority shift" flag but cannot set a deadline. |
| C10 | Scrape Creators credits: 100 free; $47 = 25k credits. | **[Assumption]** ≤15 credits per funder run; per-run credit counter shown in UI; hard cap configurable. |

## 6. Functional requirements

### 6.1 Funder intake
- Input: funder name, optional website URL, optional EIN, funder type (private foundation / corporate / federal / state-local).
- Creates a Funder record and triggers a Run.

### 6.2 Sub-agent pipeline (see `AGENTS.md`)
Orchestrator runs: **Intelligence → (Awards ∥ Deadlines) → Fit → Narrative → Brief Editor.** Each agent returns typed JSON validated against a schema; failures degrade to "Unknown" with an error note, never fabricated content.

### 6.3 Priorities
Funding priorities, focus areas, geography, eligibility, typical award range, restrictions — each with source URL + status label.

### 6.4 Deadlines
Application windows, LOI dates, rolling status. Source-linked; when no date is verifiable, show **"Unconfirmed — verify with funder"**.

### 6.5 Past awards
Table of recent grants (recipient, amount, year, purpose, source). Summary stats computed from rows actually found (count, median, range). Shows coverage note ("N of M years found").

### 6.6 Fit scoring
0–100 score = weighted rubric, shown with per-criterion rationale and evidence.
**[Assumption] default weights:** Mission alignment 30 · Program match 25 · Geography/eligibility 15 · Award size vs. Aimsir need 10 · Funding history with comparable orgs 10 · Timing/effort 10. Weights editable in `config/scoring.json`. Hard-stop flags (ineligible entity type, excluded geography) cap the score and are shown in red. Recommendation: **Pursue / Cultivate / Pass**.

### 6.7 Draft narrative sections
Drafts for: organizational overview, statement of need, program description, alignment-to-funder-priorities. Rules: Aimsir facts only from `config/aimsir-profile.json`; no invented statistics, outcomes, or participants; minors' information stays generic; every number is tagged *planning target* or left as `[INSERT VERIFIED DATA]`. Voice: practitioner-to-funder, per Sean's style.

### 6.8 Deadline pipeline
Kanban + timeline: Researching → Brief ready → Approved → Drafting → Submitted (manual toggle) → Awarded/Declined. Sort by next deadline; flags for ≤30/14/7 days. Optional iCal export (read-only feed) **[Open: wanted in v1?]**.

### 6.9 One-page funder brief (primary output)
Fixed one-page layout, color-coded panels: Recommendation + score (top) · Priorities · Deadlines · Past awards snapshot · Fit rationale · Draft narrative excerpt · Open items/verify list · Sources. Print-to-PDF stylesheet (US Letter). States: **Draft → Reviewed → Approved**; only Sean can approve; edits are inline and versioned.

### 6.10 Review gate
Briefs cannot be marked Approved while any "Verify" item is unresolved unless Sean overrides with a note. Approved briefs are the only exportable artifact.

## 7. Non-functional requirements
- **Security:** API keys server-side only; site protected by Netlify password/Identity (single user) **[Decision]**; no PII on minors stored; rate limits on run creation.
- **Accuracy:** zero fabricated facts — schema-enforced `status` (confirmed/inferred/unknown) and mandatory `source_url` on confirmed items.
- **Performance:** typical run ≤ 5 min; UI never blocks.
- **Cost:** per-run Scrape Creators/Firecrawl/Claude cost estimate displayed.
- **Accessibility/responsive:** usable on phone (Sean is often on the road).
- **Auditability:** every run logs agent inputs, sources, timestamps.

## 8. Architecture

- **Frontend:** Vite + React + TypeScript, plain CSS tokens; static build on Netlify.
- **Backend:** Netlify Functions (TypeScript): `run-start`, `run-status` (sync), `run-orchestrate` (background), `brief-save/approve`, `pipeline-*`.
- **Storage:** Netlify Blobs (funders, runs, briefs, pipeline) — no external DB **[Decision]**; Supabase is the upgrade path if multi-user is needed.
- **Integrations:** Scrape Creators (`x-api-key` header, base `https://api.scrapecreators.com`), Firecrawl, ProPublica Nonprofit Explorer, Grants.gov, Anthropic API.
- **CI/CD:** push to `main` → Netlify build (`npm run build`, publish `dist`), env vars set in Netlify UI. `netlify.toml` committed.

## 9. Data model (abridged)
`Funder{id,name,url,ein,type}` · `Run{id,funderId,status,agentResults,creditsUsed,startedAt}` · `Fact{field,value,status,sourceUrl,retrievedAt}` · `Award{recipient,amount,year,purpose,sourceUrl}` · `Deadline{label,date,kind,status,sourceUrl}` · `FitScore{total,criteria[],flags[],recommendation}` · `Brief{id,funderId,version,state,sections}` · `PipelineItem{funderId,stage,nextDeadline,notes}`.

## 10. Milestones
1. **M0** Scaffold, Netlify config, CI, auth gate, env wiring (health-check of Scrape Creators key via credit-balance endpoint).
2. **M1** Intake + orchestrator + Intelligence & Deadlines agents.
3. **M2** Awards agent (ProPublica + Firecrawl) + Fit scoring + config editor.
4. **M3** Narrative agent + one-page Brief renderer + review gate.
5. **M4** Deadline pipeline + export/print polish.
6. **M5** Hardening: tests, cost caps, error states, docs.

## 11. Success metrics
- Brief generated for a new funder in ≤ 5 min and ≤ 15 Scrape Creators credits.
- 100% of "Confirmed" facts carry a working source link (spot-checked on first 5 funders).
- Sean's edit rate on narrative drafts trends down; zero fabricated facts found in review.

## 12. Open items for Sean
1. `ANTHROPIC_API_KEY` and a deployable `FIRECRAWL_API_KEY`.
2. Confirm Aimsir program list/descriptions and the scoring weights.
3. Seed list of funders to test with (3–5).
4. Netlify site: connect this repo (`broadviewpilot-max/agents-21`, `main`) — or authorize me to do it via the Netlify connector.
5. iCal export in v1? Single-user password gate acceptable?
6. Confirm you want this written to `main` directly (this session is on branch `ccr-178c79af-4z7dvi`; I will not push to `main` or open a PR without your say-so).
