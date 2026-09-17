# Caxton on learning.mdc.edu (domain root)

**Sole deploy target for this repo.** Full CMS behind nginx at `https://learning.mdc.edu/` (or `http://` until TLS) on the DigitalOcean droplet.

Atomic deploy / disk layout / secrets: [`docs/vps.md`](vps.md).

Caxton owns the **entire** vhost. There is no `/caxton` subpath and no static `/aielite` site on this host.

## Architecture

```text
Browser → learning.mdc.edu
       → Nginx :80/:443
       → location /  →  http://127.0.0.1:5001
       → Express (APP_BASE empty / domain root)
```

| Piece | Value |
|-------|--------|
| Public URL | `https://learning.mdc.edu/` (set `SITE_URL` to match scheme) |
| `APP_BASE` | empty / unset (not `/caxton`) |
| `SITE_URL` | `https://learning.mdc.edu` or `http://learning.mdc.edu` |
| `PORT` | `5001` |
| App root | `/opt/caxton/{persistent,releases,current}` |
| systemd | `caxton.service` (Sidequest optional / off in lab) |

## Nginx

Canonical file: [`docs/nginx-caxton-learning.conf`](nginx-caxton-learning.conf).

- Proxy **`/`** to Node on `127.0.0.1:5001`.
- Do **not** use `alias /var/www/aielite/` or `/var/www/caxton/`.
- Optional 301s from legacy `/caxton` to `/` (included in the conf).

```bash
sudo cp docs/nginx-caxton-learning.conf /etc/nginx/sites-available/learn-mdc
# sites-enabled/learn-mdc should already symlink to sites-available/learn-mdc
sudo nginx -t && sudo systemctl reload nginx
```


## systemd unit

Install as `/etc/systemd/system/caxton.service`:

```ini
[Unit]
Description=Caxton CMS (learning.mdc.edu)
After=network.target postgresql.service
Wants=network-online.target

[Service]
Type=simple
User=website-runtime
Group=website-runtime
WorkingDirectory=/opt/caxton/current
EnvironmentFile=/opt/caxton/current/.env
Environment=NODE_ENV=production
ExecStart=/usr/bin/bash /opt/caxton/current/scripts/start-production.sh
Restart=on-failure
RestartSec=5
UMask=0002

[Install]
WantedBy=multi-user.target
```

## Runtime `.env` (packed as `_CAXTON_*` in Actions)

Minimum:

- **Do not set** `APP_BASE` (or set empty) — Vite `base` must be `/` at build time
- `SITE_URL=http://learning.mdc.edu` (or `https://…` after certbot)
- `PORT=5001`
- `DATABASE_URL=...`
- `SESSION_SECRET=...`
- `TURNSTILE_SITE_KEY` / `TURNSTILE_SECRET_KEY`
- `GITHUB_TOKEN` (+ content `github_repo_url` in `sites.yml`) when pulling real content

If an old release was built with `APP_BASE=/caxton`, **rebuild** after clearing `APP_BASE` (assets would otherwise still point at `/caxton/...`).

## Cutover from `/caxton` subpath (ops)

1. Update GitHub secrets: remove `_CAXTON_APP_BASE` or set empty; set `_CAXTON_SITE_URL` to the apex URL.
2. Update `/opt/caxton/current/.env` and `/opt/caxton/.env` the same way.
3. Install root nginx conf; reload nginx.
4. Rebuild release with empty `APP_BASE` (or run learning deploy workflow).
5. Restart `caxton`.
6. Verify: `curl -sI http://learning.mdc.edu/` and `/en/home`.

## CI

Workflow: [`.github/workflows/deploy-caxton-learning.yml`](../.github/workflows/deploy-caxton-learning.yml)

Secrets: `LEARNING_DEPLOY_*` + `_CAXTON_*` (no `_CAXTON_APP_BASE` for root).

## Verify

```bash
curl -sI http://learning.mdc.edu/ | head -15
curl -sI http://learning.mdc.edu/en/home | head -15
curl -fsS http://127.0.0.1:5001/health
# Legacy paths should 301 to /
curl -sI http://learning.mdc.edu/caxton/ | head -10
```

## Education (staff / agents)

- **Staff:** This environment is the site at the domain root (`learning.mdc.edu`), not under `/caxton`. Public links and cookies use `/`.
- **Agents:** `SITE_URL` is the apex (no `/caxton` segment). Do not prefix tool/OAuth paths with `/caxton`.
