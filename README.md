# Evium CRM

Internal project CRM and ticketing admin for **Evium Charging** ([eviumcharging.com](https://eviumcharging.com)), an EV charge point operator.
Only Evium staff sign in. Customers are stored as contacts on each project and never get a login.

## Features

- **Projects (sites)**: customer and contact details, site address, site type, charger type and port count, kW, estimated value, owner, priority, target go-live date. Each project gets a code like `EV-0001`.
- **Due Diligence**: new properties start on the Due Diligence tab. Each one records the **property owner**, the **rebate** the site qualifies for and the **utility company**. Once all three are filled in, **Move to pipeline** sends it into the pipeline, where you can mark any milestones already under way.
- **Milestones, not a fixed funnel**: projects don't all follow the same order, so there is no single stage. Every project tracks each milestone on its own: **Site walk, Proposal, Contract, Permitting, Approvals, Installation**. Each one is *Not started*, *In progress*, *Done* or *Not needed*, and they can be finished in any order (e.g. approvals before permitting). A project is **Live** when every milestone is done or not needed. Admins can rename, reorder, add or remove milestones.
- **Pipeline**: a list with one row per site address, grouped into one section per US state (click a state chip to show only that state). Each row shows a small chip per milestone (✓ done, ● in progress, ○ not started, – not needed) and how many are done. Click a row to switch any milestone's status. Filter by milestone ("Permitting still to do"), by progress, status or owner.
- **Running late**: every milestone has a target number of days. A milestone that stays *in progress* longer than that is flagged red, and every change is kept in the project's milestone history.
- **Statuses**: Active, On hold, Blocked, Won, Lost, Cancelled. On hold and blocked projects carry a reason.
- **Ticketing**: tickets on each project (task, issue, site survey, permit, utility, installation, commissioning, maintenance, billing). Each ticket has a status (open → in progress → waiting → resolved → closed), a priority, an assignee, a due date, comments and file attachments. There is also a global ticket queue with filters ("assigned to me", unassigned, overdue).
- **Documents**: drag-and-drop upload on each project, sorted into categories (contract, proposal, site plan, photo, permit, utility, engineering, invoice, commissioning). Files can be viewed or downloaded, and can also be attached to a specific ticket.
- **Dashboard**: KPIs (pipeline value, ports in the pipeline, ports live, open and overdue tickets), a chart of how far open projects are on each milestone, a "Needs attention" list of projects with late milestones or on hold / blocked, your own tickets, and recent activity.
- **Activity log and notes** on each project. **CSV export** of all projects.
- **Admin**: manage staff users (admin or staff role, deactivate, reset password) and configure the milestones.

## Tech

Node.js 22.13+ with Express, SQLite (built into Node) and Multer for uploads. The frontend is plain HTML, CSS and JS with no build step.
Everything (the database plus uploaded files) is stored in `./data`, so back up that folder.

## Run locally

```bash
npm install
npm run seed      # optional: loads demo projects & staff (password: changeme123)
npm start         # http://localhost:3000
```

Forgot the admin password? Run `npm run reset-admin -- NewPassword123`.

The first time it starts, the app creates an admin account and prints the login to the console:
`admin@eviumcharging.com` with a randomly generated password. To choose the login yourself, set `ADMIN_EMAIL` and `ADMIN_PASSWORD` before the first start.

## Configuration (env vars)

| Var | Default | |
|---|---|---|
| `PORT` | `3000` | HTTP port |
| `DATA_DIR` | `./data` | SQLite DB location |
| `UPLOAD_DIR` | `$DATA_DIR/uploads` | Uploaded documents |
| `MAX_UPLOAD_MB` | `50` | Per-file upload limit |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | – | Initial admin, used only when no users exist |

## Deploy (production)

On a Linux server with Docker, with the DNS for your domain pointing at it:

```bash
cp .env.example .env      # set DOMAIN and ADMIN_PASSWORD
docker compose up -d --build
```

Caddy gets and renews the HTTPS certificate automatically. All data is stored in `./data` on the server, so back that folder up.
See the handoff guide for the full step-by-step setup.
