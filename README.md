# FormFlow

Self-hosted enterprise portal that digitizes paper request forms. Department admins build forms with drag-and-drop, attach a visual approval workflow, and publish to an audience (company / department / designation). Users sign in with their Active Directory credentials, fill the form, and a workflow engine routes it through approvals automatically, with a full audit trail and a printable approved PDF.

Designed to run 100% on-premises: no cloud services, CDNs or external calls at runtime.

## Features

- Drag-and-drop form builder (dnd-kit): 25+ field types, conditional visibility, multi-page forms, selection limits
- Visual workflow designer (React Flow): approval, decision, notify and end nodes; parallel/any-one approval; SLA reminders and escalation; delegation
- LDAP / Active Directory sign-in (`ldapts` + NextAuth), role-based access (`SUPER_ADMIN`, `DEPT_ADMIN`, approver, user)
- Optional Windows single sign-on behind IIS (NTLM), with the password form as automatic fallback
- Audience targeting by company, department, designation and AD group
- Approval inbox, return-to-submitter, cancel, resubmit
- Append-only audit log; approved-form PDF with approval trail (`pdf-lib`)
- Reports with CSV / Excel export and per-field answer breakdown
- In-portal preview of image, PDF, docx, xlsx and eml attachments
- Form privacy rules: anonymous, one-submission-per-person, confidential
- Admin console: organisation management, role mappings, reassignment, LDAP/SMTP settings

## Tech stack

Next.js 14 (App Router, TypeScript), Tailwind CSS + shadcn/ui, PostgreSQL + Prisma, BullMQ + Redis, Nodemailer, `pdf-lib`, SheetJS.

A separate worker process (`src/worker`) runs workflow steps, emails, SLA timers and PDF generation.

## Quick start (development)

Requirements: Node.js 20, PostgreSQL 16, Redis >= 5 (or `docker compose up -d redis postgres`).

```bash
npm install --legacy-peer-deps
node scripts/download-fonts.js        # one-time, self-hosted Inter font
cp .env.example .env                  # edit values; set DEV_MOCK_LDAP=true for local dev
npx prisma generate
npx prisma migrate dev
npm run db:seed

npm run dev                           # terminal 1: web app
npm run worker                        # terminal 2: BullMQ worker
```

With `DEV_MOCK_LDAP=true` the seed provides demo users such as `superadmin` / `Admin@123` and `jdoe` / `User@123`. These are demo credentials for local development only; never enable mock LDAP in production.

## Deployment

See [DEPLOYMENT.md](DEPLOYMENT.md) for Docker Compose and Windows Server instructions, environment variables, backups and upgrades.

## Project layout

```
prisma/      schema and migrations
scripts/     seed and maintenance scripts
src/app/     Next.js routes (portal, builder, admin, API)
src/lib/     auth, authz, workflow engine, PDF, audience rules, config
src/worker/  BullMQ processors
```

## License

[MIT](LICENSE)
