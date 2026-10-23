# Playbook: Building a Multi-Agent Research App (from the Aimsir Funder Command Center)

**Owner:** Sean Smith · **Created:** 2026-10-23 · **Purpose:** Reference for starting a similar enterprise (a site where specialist sub-agents research a subject and produce a one-page brief a human reviews before anything goes out).

Labels: **[Fact]** verified · **[Decision]** chosen to resolve a conflict · **[Lesson]** learned the hard way.

---

## 1. The original brief (Sean's words, API key redacted)

> I am looking to build an app that I want to deploy out to the main branch in GitHub. Ultimately, this application is going to be deployed out onto Netlify.
>
> This application should allow you to create a site where separate sub-agents handle funder research for the Aimser Foundation grant and funder command center, to include:
> - priorities
> - deadlines
> - past awards
> - fit scoring system against Aimser's programs
> - first draft narrative sections
> - a deadline pipeline
>
> Output is a one-page funder brief you review before anything goes out.
>
> You are going to use the Scrape Creators API, which I will provide later in the conversation. I want you to look up Scrape Creators and their capabilities, as well as utilize Firecrawl or any other resources that can be utilized to assist in building the site. I want you to use them, and then, first of all, give me a summary to confirm that you understand what I want you to build.
>
> First things first, I want you to build me a PRD based off of this. [...] Secondly, I want you to give me a list of agents or sub-agents that I can refer to as you're building this. I'm going to randomly say you can build me or provide me with five, perhaps four agents, and they're all going to be experts. I'm going to provide you with the API key for Scrape Creators.
>
> Yes, I know that it'll be on the internet now, and others will be able to see it. Do not complain about it. I know what I'm doing. I want to get this build done. [...] Do not be lazy, resolve all conflicts before you build the PRD. Here's the API key: **[REDACTED. Lives only in the Netlify environment variable `SCRAPECREATORS_API_KEY`]**
>
> Ok go get started building.

The key was left out of this saved copy on purpose: files in this repo are what GitHub shows. If you ever need it, it is in your Netlify environment variables and your Scrape Creators dashboard.

## 2. Operating instructions Sean gave along the way
- Lead with the answer, then reasoning. Distinguish confirmed fact / planning target / assumption / recommendation.
- "Don't be lazy; resolve all conflicts before building the PRD." Surface conflicts, state a labeled decision, proceed.
- Ask only consequential questions; otherwise state an assumption and go.
- Never invent facts, statistics, quotes, or organizational details. Never send/submit/commit on Sean's behalf.
- Push straight to `main`; no pull request without his say-so. Sean connects Netlify himself.
- Time-boxed launches happen: a password gate was made optional to get a URL live in an hour.
- Sean prefers numbered, click-by-click instructions and sends phone photos of his screen; read them closely.

## 3. Conflicts found in the brief, and the decisions (reuse this checklist)
| Conflict | Decision |
|---|---|
| Scrape Creators is a **social-media** scraper (38+ platforms); it has **no grants/990/RFP data**. [Fact] | Use it for Google search (`/v1/google/search`, 1 credit) and LinkedIn company posts as *signals*. Real awards/deadlines come from ProPublica Nonprofit Explorer (free), Grants.gov `search2` (free, no auth), and the funder's own pages. |
| Agents need an LLM; only one API key was supplied. | Anthropic API key from platform.claude.com/settings/keys (billing separate from a Claude subscription). |
| Firecrawl key not available in production. | Firecrawl optional; fall back to plain fetch. |
| Name spelled "Aimser" vs "Aimsir". | Use the organization's own spelling (Aimsir). |
| Program list didn't exist yet. | Researched from the org's public site/Instagram, seeded as a draft, confirmed by Sean, editable in-app. |
| Secrets shared in chat. | Never committed; only in Netlify env vars; used server-side only. |
| "Review before anything goes out." | App has no send/submit capability at all; approval gate blocks while verify-items remain unless an override note is written. |
| Netlify normal functions time out. | Long research runs in a Netlify **Background Function** (15 min); UI polls run status. |
| Social data is unofficial/stale. | Social posts raise "possible priority shift" only; never set deadlines or award facts. |

## 4. The agent roster pattern (5 experts + a code orchestrator)
1. **Funder Intelligence Analyst**: priorities, eligibility, geography, award range, signals.
2. **Awards & 990 Analyst**: past awards, comparable-org history, coverage notes.
3. **Deadline & Pipeline Strategist**: deadlines, windows, rolling status.
4. **Fit Scoring Analyst**: per-criterion 0-10 scores; **code** computes the weighted 0-100 and applies hard-stop caps.
5. **Narrative Drafter & Brief Editor**: first-draft sections, one-page brief; code computes the verify-list.
Orchestrator (plain code): Intelligence → (Awards ∥ Deadlines) → Fit → Narrative → Editor; degrades to "unknown" on failure, never fabricates.

**Design principles that worked**
- *Evidence-bound*: code gathers evidence; the model may only extract from it.
- *Guardrails in code, not prompts*: a "confirmed" fact must cite a URL the agent actually saw, else it is downgraded; awards without a traceable source are dropped; numbers in drafts not present in source data are flagged; employer names and sweeping claims are flagged.
- *Scores computed in code* so they are auditable and tunable (weights editable in-app).
- *Per-run cost caps* and a daily run cap.

## 5. Lessons learned (gotchas)
- **[Lesson]** Netlify env-var changes only apply after a **new deploy**.
- **[Lesson]** A Netlify project set to **Private** blocks the app's own server-to-server call to its background function (HTTP 401). Fix: **Make public** (the app's own password still protects data).
- **[Lesson]** Use the main site URL, not a deploy "permalink" (`<hash>--site.netlify.app`), which is frozen at one old deploy. After deploys, hard-refresh (Ctrl+Shift+R) to clear cached JS.
- **[Lesson]** Settings "connected" only proved a key existed; add a real **Test** button that makes a live call.
- **[Lesson]** Surface agent errors in the UI; silent failures looked like "empty brief".
- **[Lesson]** Grants.gov keyword results include other agencies' notices. Never auto-label them as the funder's deadlines; let the model filter by agency and require a source.
- **[Lesson]** Search often returns directory sites (Inside Philanthropy, Candid) as the "official site". Filter aggregators; allow manual website/EIN edits.
- **[Lesson]** Give the fit agent the full organization profile (locations, tax status), not just the program list, or it will wrongly mark local funders as geography mismatches.
- **[Lesson]** Keep uncertainty out of funder-facing prose; put it in "needs data" placeholders.
- **[Lesson]** The build sandbox could not reach api.scrapecreators.com or ProPublica directly (proxy allowlist); verify live integrations from the deployed site, not the sandbox.

## 6. Reusable starter prompt for the next similar enterprise
> Build me a Netlify-deployed site (GitHub `main`) where separate expert sub-agents research **[SUBJECT]** for **[ORGANIZATION]** and produce a **one-page brief** I review before anything goes out. Include: **[LIST OF ANALYSES, e.g. priorities, deadlines, history, fit score, first-draft narrative, pipeline]**. Use **[DATA API]** plus Firecrawl and any other free sources that help. First: research the API's real capabilities and tell me what it can and cannot do; list every conflict in this request with a decision; then give me a summary to confirm, a PRD, and a roster of **[4-5]** expert agents. Rules: no invented facts; every confirmed claim cites a source it actually read; scores computed in code; the app can never send or submit anything; secrets only in Netlify env vars; push to main only when I say so. Where I hand you an API key, never commit it.

## 7. Where things live in this repo
- `docs/PRD.md`, `docs/AGENTS.md`: requirements and roster.
- `config/aimsir-profile.json`, `aimsir-programs.json`, `scoring.json`, `funders-seed.json`: confirmed org data and scoring weights.
- `netlify/lib/agents/*`, `netlify/lib/guards.ts`, `netlify/lib/orchestrator.ts`: the agents and guardrails.
- `test/*`: guardrail and mocked end-to-end tests (`npm test`).
