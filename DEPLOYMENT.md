# FormFlow: Deployment Guide

Placeholders such as `forms.example.com` must be replaced with your own values.

## Prerequisites

| Requirement | Version |
|---|---|
| Docker + Docker Compose | v2.x |
| OR Node.js (Windows path) | 20 LTS |
| PostgreSQL | 16 or newer |
| Redis-compatible server | Redis >= 5 (e.g. Redis 7, Memurai on Windows) |

The legacy Microsoft Redis 3.x port for Windows does not work with BullMQ.

## Environment variables

See `.env.example`. Never commit your real `.env`.

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string. Percent-encode special characters in the password (e.g. `$` becomes `%24`) |
| `REDIS_URL` | Redis connection URL |
| `NEXTAUTH_SECRET` | Random 32+ char string (`openssl rand -base64 32`) |
| `NEXTAUTH_URL` | Public URL of the app, e.g. `https://forms.example.com` |
| `LDAP_URL` | e.g. `ldaps://dc01.example.com:636` (use `ldaps` in production) |
| `LDAP_BASE_DN` | e.g. `DC=example,DC=com` |
| `LDAP_BIND_DN` / `LDAP_BIND_PASSWORD` | Read-only service account |
| `LDAP_ALLOW_INSECURE` | `false` in production |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_FROM` | Internal SMTP relay (no auth) |
| `UPLOAD_DIR` | Absolute path for attachments, outside any web root |
| `MAX_UPLOAD_MB` | Max upload size (default `10`) |
| `DEV_MOCK_LDAP` | `true` only for local dev. **Never in production** |
| `SSO_DOMAIN` / `SSO_SHARED_SECRET` | Optional Windows SSO. NetBIOS domain name (the `EXAMPLE` in `EXAMPLE\user`) and a 32+ char hex secret. Both must be set; either blank means SSO is off. Written by `scripts/enable-sso-iis.ps1` |

**Gotcha:** Next.js expands `$VAR` sequences in `.env` values, even when quoted. A password containing `$` must be written with a backslash escape (`pa\$word`). The worker loads `.env` through the same loader (`src/worker/bootstrap.ts`), so one form works for both processes.

LDAP and SMTP settings can also be edited in Admin, then Settings. Values saved there override `.env`; secrets are stored AES-256-GCM encrypted with a key derived from `NEXTAUTH_SECRET` (rotating it means re-entering them).

## Option A: Docker Compose

```bash
git clone <your-repo-url> formflow && cd formflow
cp .env.example .env        # edit values
docker compose up -d --build
docker compose exec app npx prisma migrate deploy
docker compose exec app npm run db:seed   # optional demo data
```

Containers: `app` (Next.js, port 3000), `worker` (BullMQ), `postgres`, `redis`. Volumes: `postgres_data` and `uploads` (mounted at `/data/uploads`). Back up both.

Terminate TLS in front of the app with a reverse proxy, e.g. nginx:

```nginx
server {
    listen 443 ssl http2;
    server_name forms.example.com;
    ssl_certificate     /etc/ssl/certs/forms.example.com.crt;
    ssl_certificate_key /etc/ssl/private/forms.example.com.key;
    client_max_body_size 15m;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
    }
}
server {
    listen 80;
    server_name forms.example.com;
    return 301 https://$host$request_uri;
}
```

## Option B: Windows Server

Run the app and the worker as two Windows services. Do not use PM2 started from a remote session: its processes are killed when that session ends. NSSM (or `node-windows`) works reliably.

```powershell
git clone <your-repo-url> C:\FormFlow
cd C:\FormFlow
copy .env.example .env      # edit values
npm ci --legacy-peer-deps
npx prisma generate
npx prisma migrate deploy
npm run build
```

Create the services (adjust paths):

```powershell
nssm install FormFlowApp    "C:\Program Files\nodejs\node.exe" "node_modules\next\dist\bin\next" start -p 3833
nssm install FormFlowWorker "C:\Program Files\nodejs\node.exe" "node_modules\tsx\dist\cli.mjs" src\worker\bootstrap.ts
nssm set FormFlowApp    AppDirectory C:\FormFlow
nssm set FormFlowWorker AppDirectory C:\FormFlow
nssm set FormFlowApp    Start SERVICE_AUTO_START
nssm set FormFlowWorker Start SERVICE_AUTO_START
nssm start FormFlowApp
nssm start FormFlowWorker
```

Configure crash recovery for the app, worker and Redis services, otherwise Windows will not restart a crashed service:

```powershell
sc.exe failure FormFlowApp reset= 86400 actions= restart/60000/restart/60000/restart/120000
sc.exe failure FormFlowWorker reset= 86400 actions= restart/60000/restart/60000/restart/120000
sc.exe failure <RedisServiceName> reset= 86400 actions= restart/60000/restart/60000/restart/120000
```

### IIS reverse proxy (optional)

Enable Application Request Routing, create a site pointing at a folder containing only `public_iis\web.config`, bind HTTPS with your certificate, and set the upstream port in `web.config` to match `next start`. The sample rules redirect HTTP to HTTPS and proxy everything to `127.0.0.1:3833`.

### Windows single sign-on (optional)

Domain users on a domain PC are signed in automatically. Everyone else, and any failure, falls back to the username/password form, which always keeps working. Requires the IIS layout above on a domain-joined server.

**How it works.** `/api/sso/windows` is protected by IIS Windows Authentication and rewritten to a small ASP.NET page (`public_iis\_authbridge\negotiate.aspx`). That page runs inside IIS, reads the authenticated `DOMAIN\user`, and calls the app's internal `/api/sso/ticket` over loopback with a shared secret. The app returns a 60-second single-use ticket that the login page redeems through NextAuth. The identity cannot be passed to the app from a URL Rewrite rule: `{LOGON_USER}` is expanded before Windows authentication runs and is always blank.

**Enable.** Deploy and build the code, then on the server, in an elevated PowerShell:

```powershell
.\scripts\enable-sso-iis.ps1 -Domain EXAMPLE     # NetBIOS name, not the DNS name (see `whoami` on a domain PC)
```

The script installs the Windows Authentication and ASP.NET 4.5 role services, unlocks the IIS auth sections, sets the site's app pool to .NET v4.0 (needed to run the `.aspx`), writes `SSO_DOMAIN` / `SSO_SHARED_SECRET` to `.env`, writes the bridge page and `web.config`, restarts the app and prints self-checks. It is idempotent; `-Disable` removes the env vars and turns SSO off.

**Notes**
- Browsers send Windows credentials automatically only to Intranet-zone sites. Add the site to the zone (Group Policy, *Site to Zone Assignment List*) if users get a credential prompt.
- The SSO path is NTLM only. Kerberos needs an SPN registered for the site name (`setspn -S HTTP/<host> <server>`); after that, remove the `<providers>` block from `web.config`.
- Do not start Next.js with `-H 127.0.0.1` behind IIS: redirects then point at `https://localhost:<port>/...`.
- Do not read a service's `AppParameters` with `nssm get` in Windows PowerShell 5.1 (UTF-16 output corrupts it on `nssm set`); read the registry instead. Use `nssm stop` + `nssm start`; `restart` fails on a throttled service.
- Do not add an IIS custom 401 error page on the SSO path; IIS turns the Windows-auth challenge into a 500.
- Accounts with a local password are never signed in through SSO.
- Troubleshooting: in the IIS log, `401.2` is a plain challenge, `401.1` plus a win32 code means credentials were rejected, and a username present means IIS authenticated the request. The app logs `[sso] rejected: <reason>` (never the secret).

## Backup

```bash
# PostgreSQL
pg_dump -h localhost -U formflow -Fc formflow > formflow_$(date +%Y%m%d).dump

# Uploads (Docker volume)
docker run --rm -v formflow_uploads:/data -v $(pwd):/backup alpine \
  tar czf /backup/uploads_$(date +%Y%m%d).tar.gz /data
```

On Windows copy the `UPLOAD_DIR` folder. Keep backups **outside** the application folder, or TypeScript may pick up copied source files. Schedule dailies via cron or Task Scheduler.

Restore: `pg_restore -d formflow --clean formflow_YYYYMMDD.dump`, and extract the uploads archive back into the volume.

## First-time admin setup

1. Sign in as a `SUPER_ADMIN` (seed user, or create one with `npx tsx --env-file .env scripts/create-local-admin.ts <username> <password>`; bootstrap/emergency use only).
2. Admin, Settings: test LDAP and SMTP connectivity.
3. Admin, Organisation: create companies, departments and designations.
4. Admin, Role Mappings: map AD groups to roles.
5. Department admins can then build, wire workflows for, and publish forms at `/builder`.

## Upgrading

```bash
git pull
npm ci --legacy-peer-deps
npx prisma migrate status         # check what is pending
npx prisma migrate deploy
npm run build
```

Then restart the app and worker. A deploy that runs `prisma generate` needs both services stopped first, because the Prisma query engine DLL is locked on Windows. Docker: `docker compose build app worker && docker compose up -d app worker`.

Take a database and uploads backup before any upgrade that includes a migration.

## Troubleshooting

- **Stuck "in progress" submissions after a Redis outage:** the worker runs a reconciliation job every 10 minutes that re-queues submissions whose workflow never started.
- **"PDF is being generated" never finishes:** check the worker's error log for the PDF job's error. Downloading again re-queues a failed PDF job. To force a rebuild, set `Submission.pdfPath` to `NULL`; the next download regenerates it.
- **Brief 500s while `next build` runs on a live server:** expected when building in place; they clear on restart.
- **Only some users cannot sign in:** verify `objectGUID` is requested as a binary attribute (`explicitBufferAttributes`) in any new LDAP search.
