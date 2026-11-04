# Evium CRM

Internal project CRM and ticketing admin for **Evium Charging** ([eviumcharging.com](https://eviumcharging.com)), an EV charge point operator.
Only Evium staff sign in. Customers are stored as contacts on each project and never get a login.

## Features

- **Projects (sites)**: customer and contact details, site address, site type, charger type and port count, kW, estimated value, owner, priority, target go-live date. Each project gets a code like `EV-0001`.
- **Funnel / pipeline**: a Kanban board where you drag a project from one stage to the next. Each move can carry a note. The default stages cover an EV deployment:
  Lead → Qualified → Site Survey → Proposal Sent → Contract Signed → Design & Engineering → Permitting → Utility / Make-Ready → Installation → Commissioning → Live / Operational.
  Admins can rename, reorder, add or remove stages.
- **Where each project is holding**: every stage has an SLA in days. The app shows how many days a project has been in its current stage, flags projects that are over the SLA, and keeps a full stage timeline showing how long the project spent in each stage.
- **Statuses**: Active, On hold, Blocked, Won, Lost, Cancelled. On hold and blocked projects carry a reason.
- **Ticketing**: tickets on each project (task, issue, site survey, permit, utility, installation, commissioning, maintenance, billing). Each ticket has a status (open → in progress → waiting → resolved → closed), a priority, an assignee, a due date, comments and file attachments. There is also a global ticket queue with filters ("assigned to me", unassigned, overdue).
- **Documents**: drag-and-drop upload on each project, sorted into categories (contract, proposal, site plan, photo, permit, utility, engineering, invoice, commissioning). Files can be viewed or downloaded, and can also be attached to a specific ticket.
- **Dashboard**: KPIs (pipeline value, ports in the pipeline, ports live, open and overdue tickets), a funnel chart by stage, a "Needs attention" list of stalled, on hold and blocked projects, your own tickets, and recent activity.
- **Activity log and notes** on each project. **CSV export** of all projects.
- **Admin**: manage staff users (admin or staff role, deactivate, reset password) and configure the funnel.

## Tech

Node.js 18+ with Express, SQLite (`better-sqlite3`) and Multer for uploads. The frontend is plain HTML, CSS and JS with no build step.
Everything (the database plus uploaded files) is stored in `./data`, so back up that folder.

## Run locally

```bash
npm install
npm run seed      # optional: loads demo projects & staff (password: changeme123)
npm start         # http://localhost:3000
```

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

## Deploy

Use any host that gives you a persistent disk (a VPS, Render or Railway with a volume, Fly.io with a volume, and so on):

```bash
docker build -t evium-crm .
docker run -d -p 3000:3000 -v evium-data:/app/data -e ADMIN_PASSWORD='choose-a-strong-one' evium-crm
```

Put it behind HTTPS, for example at `crm.eviumcharging.com`. The session cookie gets the `Secure` flag automatically when the app is served over HTTPS.
