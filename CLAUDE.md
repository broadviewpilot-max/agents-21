# Project context for Claude (Aimsir Funder Command Center)

Owner: Sean Smith (airline captain/check airman; Founder & Executive Director, The Aimsir Foundation Inc.; FAU grad student). Lead with the answer; plain professional register; never invent facts; never send/submit anything on his behalf.

- Read `docs/PLAYBOOK-multi-agent-build.md` first: original brief, decisions, lessons, and a reusable prompt for similar builds.
- Product docs: `docs/PRD.md`, `docs/AGENTS.md`. Setup: `README.md`.
- Rules: secrets only in Netlify env vars (never in the repo or in committed files); agents are evidence-bound; confirmed facts must cite a source the agent read; scores are computed in code; the app must never send or submit anything.
- Push to `main` only when Sean asks; no pull requests unless he asks. Run `npm test` and `npm run build` before pushing.
- Aimsir facts come only from `config/aimsir-profile.json` and `config/aimsir-programs.json` (confirmed by Sean 2026-10-22). Do not name his airline employer in drafts.
