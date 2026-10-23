# API skills

This repo contains reusable, data-only skills for reverse-engineered APIs. Return raw and structured API data; let the calling agent decide analysis and presentation. Do not add UI, display templates, rankings or recommendation policies.

Use Bun and TypeScript. See CLAUDE.md for source paths and protocol invariants. Keep skills under `skills/<name>/`, clients under `src/<name>/`, and raw captures under ignored `data/`. Never commit secrets or session proofs.

Tests belong top-level and exercise the system end to end. Do not add tests while a skill is being designed or prototyped. Preserve other sessions' working edits; never stash or reset a whole checkout. Complete authorized work through commit, push, local installation and verification.
