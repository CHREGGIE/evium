# Evium CRM

Internal project CRM and ticketing admin for **Evium Charging** ([eviumcharging.com](https://eviumcharging.com)), an EV charge point operator.
Only Evium staff sign in. Customers are stored as contacts on each project and never get a login.

## Features

- **Projects (sites)**: customer and contact details, site address, site type, charger type and port count, kW, estimated value, owner, priority, target go-live date. Each project gets a code like `EV-0001`.
- **Due Diligence**: new properties come in with their information (owner, utility, rebate…). Three tabs:
  - **To assess**: rate each site **1 to 5** and write your **insight** (why that rating). Save a draft or send it to the review.
  - **10:30 review**: the daily review list, highest rated first. Reviewers (e.g. JoJo) pick **Approve for site walk** (with optional notes for the walk), **Needs more info** (goes back to To assess with the note, and the assessor is notified) or **Pass**.
  - **Passed**: sites we're not pursuing, with the reason. Reopen any of them.
  Approving moves the site straight to the Pipeline with the **Site walk** milestone in progress, posts the reviewer's notes in the site walk discussion, makes that state's manager the site owner, and **notifies the manager(s) for that state** (anyone with that state in their territory). Who can review is a checkbox on each user in **Admin**; admins always can.
- **Milestones, not a fixed funnel**: projects don't all follow the same order, so there is no single stage. Every project tracks each milestone on its own: **Site walk & proposal, Send proposal, Contract, Permitting, Approvals, Installation**. Each one is *Not started*, *In progress*, *Done* or *Not needed*, and they can be finished in any order (e.g. approvals before permitting). A project is **Live** when every milestone is done or not needed. Admins can rename, reorder, add or remove milestones.
- **Milestone pages**: on a project, each milestone is a row showing its status, how many steps are done and how many files it has. Click it to open that milestone's own page with: a **checklist of steps** (who ticked each one, and when; add extra steps for one site), its own **documents** (proposals, contracts, electrical quotes, permit drawings…), a status picker, its discussion and its reminders. Ticking the first step moves a milestone to *In progress*; when every step is ticked it offers *Mark done*. Admins set each milestone's default steps in **Admin → Milestones → Steps**.
- **Handoffs**: the project manager owns **Site walk & proposal** (walk the site, then create the proposal: layout, electrical quote, rebate, pricing; a proposal document is needed to finish it). The account manager owns **Send proposal** (review, send, follow up, accepted). When any milestone is marked done, whoever owns the **next** unfinished milestone for that site's state gets a notification ("Send proposal is up to you now"). When everything is done, the site's owner is told it's live. Approving a site in due diligence pings the owner(s) of Site walk & proposal for that state, falling back to the state's territory managers. Who owns what is set per person with **Customize** on the dashboard or in **Admin**.
- **Pipeline**: a list with one row per site address, grouped into one section per US state (click a state chip to show only that state). Each row shows a small chip per milestone (✓ done, ● in progress, ○ not started, – not needed) and how many are done. Click a milestone to open its page, or a row to see all of them. Filter by milestone ("Permitting still to do"), by progress, status or owner.
- **Site chat**: every site has a main chat (the **Chat** tab on its project page). Clicking any milestone (its name on the project page, or its chip on a Pipeline row) opens a chat just for that milestone. Everything written there also shows in the site's main chat, tagged with the milestone, so all the conversations for a site are in one place. Milestone status changes appear in the chat as small grey lines. From the main chat you can also tag a message to a milestone. Chats refresh every 10 seconds, and people can delete their own messages (admins can delete any).
- **Running late**: every milestone has a target number of days. A milestone that stays *in progress* longer than that is flagged red, and every change is kept in the project's milestone history.
- **Statuses**: Active, On hold, Blocked, Won, Lost, Cancelled. On hold and blocked projects carry a reason.
- **Ticketing**: tickets on each project (task, issue, site survey, permit, utility, installation, commissioning, maintenance, billing). Each ticket has a status (open → in progress → waiting → resolved → closed), a priority, an assignee, a due date, comments and file attachments. There is also a global ticket queue with filters ("assigned to me", unassigned, overdue).
- **Documents**: drag-and-drop upload on each project, sorted into categories (contract, proposal, site plan, photo, permit, utility, engineering, invoice, commissioning). Files can be viewed or downloaded, and can also be attached to a specific ticket.
- **Dashboard**: made of widgets: due diligence to assess, 10:30 review, rebates, a widget for any milestone (in progress and up next, limited to your territory), my sites, reminders, tickets, recent activity, company numbers, the milestone chart and needs attention. Click **Customize** to add widgets, remove them, move them up or down, or move them between the two columns; the layout is saved to your account (**Reset to default** goes back to the starting layout for your job). The **Viewing** dropdown switches to anyone else's dashboard, with their layout, work, reminders and tickets (view only). Duties (what you're responsible for) are under **Customize → What I'm responsible for** and decide your default widgets and who gets handoff notifications.
- **Activity log and notes** on each project. **CSV export** of all projects.
- **Rebates board**: rebates, grants, make-ready programs and tax credits, grouped by state (plus Federal). Each one has what it is, **chargers we can offer** (internal, for sales), a requirements checklist, amount, deadline, status and a link to the official page. Anyone can add or edit them, and each shows who last updated it. Entries can be marked "needs checking" until someone confirms them. The demo data's rebates are samples and are all marked "needs checking".
- **Rebates on each site**: a property's "Rebate we're going after" dropdown lists only the rebates for that site's state (plus federal), with a ⓘ button for the details. You can stack more than one. Click a rebate on any site to see its details. The New property form also has a **Tax credit** section (which credit, eligible yes / no / not checked, estimated amount).
- **Utility directory**: each utility's states, phone, website, your contact there, make-ready program, typical approval time and notes, plus the sites and rebates linked to it. Sites pick their utility from the directory (or add a new one on the spot).
- **Notifications and @mentions**: type `@` in any chat to mention someone. The 🔔 in the sidebar collects @mentions, messages on sites you own, reminders that are due, and new sites in your territory.
- **Follow-up reminders**: the ⏰ next to any milestone (or **+ Add** on a project) sets a reminder for you or a teammate. Due reminders show on the Dashboard and in notifications, and can be marked done or pushed back a week.
- **Map**: every site on a map, coloured by progress (due diligence, in progress, running late, on hold, live). Pins are looked up from the address automatically using the free US Census geocoder (no API key). If an address can't be found, use **Place pin**, or drag any pin to the right spot. The map uses Leaflet (from cdnjs) and OpenStreetMap tiles, so the browser needs internet access.
- **Required documents**: a milestone can require a kind of document before it can be marked done (by default: Site walk → photo, Proposal → proposal, Contract → contract, Permitting → permit, Installation → photo). Trying to mark it done without one opens an upload box. Admins change this in **Admin → Milestones**.
- **Territories**: in **Admin**, give each person their states. Their states are listed first on the Pipeline and Due Diligence pages, they get a **★ My territory** filter, and they're notified when a site is added in their states.
- **Electricians and quotes**: project managers don't walk the sites themselves. Outside electricians do, and each one quotes the job. The **Electricians** page is the directory (company, contact, phone, email, states, license, notes) with each electrician's quotes, jobs won and bookings. On a site's **Site walk & proposal** page, the **Electrical quotes** section lists the electricians quoting it (usually 3): book each one's site walk, enter their quote (amount, scope, date, and the quote PDF), see the lowest marked, and **Choose** the best. The chosen electrician becomes the site's electrician, the other quotes are marked not chosen, and they're pre-filled when booking the installation. Bookings carry the electrician, with an **Email the electrician** button, and an electrician booked twice at the same time is flagged.
- **Calendar**: a month and week calendar of site walks, installations, inspections, meetings and other bookings, colour-coded by type, filterable by person and type. Book from the calendar (+ Book, or click a day), from a site's page, or from the Site walk / Installation milestone pages. The people who handle that site for its state are pre-ticked, double-bookings are flagged before saving, and everyone on a booking is notified when it's made, moved or cancelled. Booking a site walk or installation starts that milestone and ticks its "schedule" step. Each booking can be downloaded as an .ics file for Outlook, Google Calendar or Apple Calendar. Times are in the site's local time. A **Coming up** dashboard widget shows the next two weeks.
- **Team and roles**: each person has a job title (CEO, Executive, Account manager, Senior project manager, Project manager, Grants manager). Picking a title in Admin ticks that job's usual duties. **Executives** (and admins) get a **Team** page: everyone's workload, what's running late, open tickets and when they were last active. Click a person to see their dashboard as they see it. The **Grants manager** gets a Rebates card (deadlines in the next 60 days, sites with no rebate yet, rebates that still need checking) and is notified whenever a site picks a rebate. The 10:30 review list shows only for people set to run it.
- **Admin**: manage staff users (admin or staff role, territory, deactivate, reset password) and configure the milestones.

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
