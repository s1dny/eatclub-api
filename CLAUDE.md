Bun + TypeScript. Use `bun`, not Node tooling.

This repository contains data-only skills backed by reverse-engineered APIs. Return original responses and structured data. The caller decides how to use or display them. Do not add UI, answer templates, rankings or recommendation policies to skills.

- `skills/<name>/SKILL.md`: agent entry points. Resolve the real skill directory through symlinks; repository root is `../..`.
- `src/eatclub/`: existing EatClub website/AppSync clients, sync, local walking graph and read-only SQL CLI. `docs/eatclub.md` must match `SCHEMA` in `src/eatclub/db.ts`.
- `src/flights/`: Google Flights client and data-only CLI. Protocol and verified endpoint scope: `skills/flights/references/api.md`.
- `scripts/install.ts`: global skill symlinks; back up differing existing entries.
- Local caches and original responses live under ignored `data/`; never commit secrets, session proofs or personal searches.
- EatClub venue pages contain RSC `$row:path` refs; resolve before parsing. AppSync key is in `.env` as `EATCLUB_APP_API_KEY`. Live availability is today-only and refreshes a shortlist, never every NSW venue for a user query.
- Flight HTTP 200 can contain a gRPC error or no payload. Never turn those into no-flights results. Save partial range checkpoints and stop on errors; do not hammer blocked endpoints.
- Keep tests top-level and end to end. Do not add tests for skills still being prototyped.
