# Sub-Agent Roster — Aimsir Funder Command Center

Five expert agents plus a code-level orchestrator. Each returns schema-validated JSON; every fact carries `status` (confirmed / inferred / unknown) and `source_url`. Agents never invent data; unknowns stay unknown.

| # | Agent | Expertise | Owns | Primary tools |
|---|---|---|---|---|
| 1 | **Funder Intelligence Analyst** | Philanthropy & grantmaker research | Priorities, eligibility, geography, restrictions, award range, recent shifts | Firecrawl (funder site), Scrape Creators `google/search`, LinkedIn/Facebook/X/Instagram posts |
| 2 | **Awards & 990 Analyst** | Form 990 / Schedule I, grant-history analysis | Past awards table, comparable-org funding history, coverage notes | ProPublica Nonprofit Explorer, Firecrawl (grantee pages, PDFs) |
| 3 | **Deadline & Pipeline Strategist** | Grant calendars, federal NOFO cycles | Deadlines, LOI/application windows, rolling status, pipeline stage & alerts | Grants.gov `search2`, Firecrawl, Scrape Creators `google/search` (date-filtered), Facebook Events |
| 4 | **Fit Scoring Analyst** | Mission-alignment & portfolio strategy | 0–100 score, rationale, hard-stop flags, Pursue/Cultivate/Pass | `config/aimsir-programs.json`, `config/scoring.json`, outputs of 1–3 |
| 5 | **Narrative Drafter & Brief Editor** | Aviation-nonprofit grant writing; one-page editorial discipline | First-draft sections, the one-page brief, open-items list, QA (no unsourced claims) | `config/aimsir-profile.json`, outputs of 1–4, Claude |

**Orchestrator (code, not an LLM):** runs 1 → (2 ∥ 3) → 4 → 5, enforces credit caps, stamps retrieval times, retries once on tool failure, and writes the Run record.

**Guardrails common to all agents**
- Aimsir facts come only from the config files; anything else is `[INSERT VERIFIED DATA]`.
- No participant-level detail, especially minors.
- Social-media data = signal only; cannot set deadlines or award facts.
- No outbound communication of any kind.
