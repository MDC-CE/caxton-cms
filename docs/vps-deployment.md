# VPS deployment (pointer)

This document used to describe the legacy `website-v3` / `_WEBSITE_*` deploy path. This repo deploys **Caxton** on the MDC droplet (`learning.mdc.edu`).

Use:

- [`docs/vps.md`](vps.md) — canonical atomic deploy, disk layout, systemd, secrets
- [`docs/learning-mdc-caxton.md`](learning-mdc-caxton.md) — nginx domain root, env, verify checklist
- [`.github/workflows/deploy-caxton-learning.yml`](../.github/workflows/deploy-caxton-learning.yml) — Actions → SSH → `/opt/caxton`

Secrets: `LEARNING_DEPLOY_*` + `_CAXTON_*` (no `_CAXTON_APP_BASE` for domain root).
