'use strict';
// Loads demo data so you can explore the CRM. Usage: npm run seed
// Safe to run again: each part (projects, due diligence, rebates & utilities) is only added when it's empty.
const { db, hashPassword } = require('./db');

const seedPipeline = db.prepare('SELECT COUNT(*) c FROM projects').get().c === 0;
const seedDiligence = db.prepare("SELECT COUNT(*) c FROM projects WHERE phase = 'diligence'").get().c === 0;
const seedDirectory = db.prepare('SELECT COUNT(*) c FROM rebates').get().c === 0;
if (!seedPipeline && !seedDiligence && !seedDirectory) {
  console.log('Demo data already loaded – nothing to add.');
  process.exit(0);
}

const milestones = db.prepare('SELECT * FROM milestones ORDER BY position').all();

// staff, with a territory each
const staff = [
  ['Maya Chen', 'maya@eviumcharging.com', 'staff', 'TX'],
  ['Jordan Reyes', 'jordan@eviumcharging.com', 'staff', 'NY,NJ,CT'],
  ['Sam Patel', 'sam@eviumcharging.com', 'staff', 'CA,IL'],
];
const userIds = staff.map(([name, email, role, states]) => {
  const ex = db.prepare('SELECT id, states FROM users WHERE email = ?').get(email);
  if (ex) { if (!ex.states) db.prepare('UPDATE users SET states = ? WHERE id = ?').run(states, ex.id); return ex.id; }
  return db.prepare('INSERT INTO users (name, email, password_hash, role, states) VALUES (?,?,?,?,?)').run(name, email, hashPassword('changeme123'), role, states).lastInsertRowid;
});
const admin = db.prepare("SELECT id FROM users WHERE role = 'admin' ORDER BY id LIMIT 1").get()?.id || userIds[0];
const jojo = db.prepare('SELECT id FROM users WHERE email = ?').get('jojo@eviumcharging.com')?.id
  ?? db.prepare("INSERT INTO users (name, email, password_hash, role, can_review) VALUES ('JoJo', 'jojo@eviumcharging.com', ?, 'staff', 1)").run(hashPassword('changeme123')).lastInsertRowid;
// what each person is responsible for (shapes their dashboard), only where nothing is set yet
{
  const msId = (n) => milestones.find((m) => m.name === n)?.id;
  const setDuty = db.prepare("UPDATE users SET dd_assessor = ?, milestone_ids = ? WHERE id = ? AND COALESCE(milestone_ids, '') = '' AND dd_assessor = 0");
  // the admin login stands in for the account manager: assesses due diligence, sends proposals, does contracts
  setDuty.run(1, [msId('Send proposal'), msId('Contract')].filter(Boolean).join(','), admin);
  // state managers handle the field work in their territory
  // project managers: site walk & proposal, then the field work, in their territory
  userIds.forEach((id) => setDuty.run(0, ['Site walk & proposal', 'Permitting', 'Approvals', 'Installation'].map(msId).filter(Boolean).join(','), id));
}

// ---------- utility directory (sample entries: add your own contacts) ----------
const UTILITIES = [
  ['Con Edison', 'NY', 'https://www.coned.com'], ['National Grid', 'NY', 'https://www.nationalgridus.com'],
  ['PSE&G', 'NJ', 'https://nj.pseg.com'], ['JCP&L', 'NJ', 'https://www.firstenergycorp.com'], ['Atlantic City Electric', 'NJ', 'https://www.atlanticcityelectric.com'],
  ['Oncor', 'TX', 'https://www.oncor.com'], ['CenterPoint Energy', 'TX', 'https://www.centerpointenergy.com'], ['Austin Energy', 'TX', 'https://austinenergy.com'],
  ['Central Texas Electric Co-op', 'TX', null],
  ['PG&E', 'CA', 'https://www.pge.com'], ['SCE', 'CA', 'https://www.sce.com'], ['SDG&E', 'CA', 'https://www.sdge.com'], ['SMUD', 'CA', 'https://www.smud.org'],
  ['Eversource', 'CT', 'https://www.eversource.com'], ['United Illuminating', 'CT', 'https://www.uinet.com'],
  ['ComEd', 'IL', 'https://www.comed.com'], ['Ameren Illinois', 'IL', 'https://www.ameren.com'],
];
const utilId = {};
const findUtil = db.prepare('SELECT id FROM utilities WHERE name = ?');
const insUtil = db.prepare('INSERT INTO utilities (name, states, website, notes, updated_by) VALUES (?,?,?,?,?)');
db.transaction(() => UTILITIES.forEach(([name, st, web]) => {
  utilId[name] = findUtil.get(name)?.id ?? insUtil.run(name, st, web, 'Sample entry: add your contact here and how long approvals usually take.', admin).lastInsertRowid;
}))();

// ---------- rebate board (SAMPLES: every entry is marked "needs checking") ----------
// Programs, amounts and statuses change often. These show what the board looks like;
// the grant manager should confirm each one on the official page and tick "checked".
const R = (o) => o;
const REBATES = [
  R({ key: 'nyCRNY', name: 'Charge Ready NY 2.0', state: 'NY', provider: 'NYSERDA', kind: 'rebate', status: 'open', charger_types: 'L2', site_types: 'workplace, multifamily, public',
    amount_text: 'Per-port rebate for networked Level 2 chargers (higher in disadvantaged communities)', url: 'https://www.nyserda.ny.gov/All-Programs/Charge-Ready-NY',
    summary: 'New York State rebate for installing networked Level 2 chargers at workplaces, multifamily buildings and public locations.',
    offer: 'Level 2 only. Plan on up to 10 ports per site; DC fast chargers are not covered.',
    requirements: 'Networked Level 2 charger from the eligible equipment list\nWorkplace, multifamily or public site\nChargers stay in service and networked for the program term\nShare charging data with the program' }),
  R({ key: 'nyConEd', name: 'Con Edison PowerReady (EV make-ready)', state: 'NY', provider: 'Con Edison', kind: 'make_ready', status: 'open', charger_types: 'L2,DCFC', utility: 'Con Edison',
    amount_text: 'Pays a large share of the make-ready (electrical upgrade) cost', url: 'https://www.coned.com/en/our-energy-future/electric-vehicles/power-ready-program',
    summary: 'Con Edison make-ready program: the utility covers much of the wiring and electrical infrastructure needed to install chargers.',
    offer: 'Level 2 and DC fast. Pairs well with Charge Ready NY on Level 2 sites.',
    requirements: 'Con Edison electric customer\nWork done by an approved contractor\nPre-approval before construction starts' }),
  R({ key: 'njGrant', name: 'It Pay$ to Plug In – EV charger grants', state: 'NJ', provider: 'NJ Board of Public Utilities (NJ Clean Energy)', kind: 'grant', status: 'open', charger_types: 'L2,DCFC',
    site_types: 'workplace, multifamily, public', amount_text: 'Per-port grants for Level 2 and DC fast chargers (check current amounts)', url: 'https://www.njcleanenergy.com',
    summary: 'New Jersey grants toward the cost of buying and installing EV chargers at workplaces, multifamily properties and public places.',
    offer: 'Level 2 at most sites; DC fast where there is enough power.',
    requirements: 'Site in New Jersey\nApply and be approved before buying equipment\nChargers stay in service for the program term' }),
  R({ key: 'njPSEG', name: 'PSE&G EV charger make-ready program', state: 'NJ', provider: 'PSE&G', kind: 'make_ready', status: 'open', charger_types: 'L2,DCFC', utility: 'PSE&G',
    amount_text: 'Covers part of the electrical infrastructure cost', url: 'https://nj.pseg.com/saveenergyandmoney/electricvehicles',
    summary: 'PSE&G pays toward the wiring and electrical upgrades needed for chargers at its customers\' sites.',
    offer: 'Level 2 and DC fast for PSE&G customers.', requirements: 'PSE&G electric customer\nPre-approval before work starts' }),
  R({ key: 'txAE', name: 'Austin Energy commercial EV charging rebate', state: 'TX', provider: 'Austin Energy', kind: 'rebate', status: 'open', charger_types: 'L2,DCFC', utility: 'Austin Energy',
    amount_text: 'Rebate per charging port for commercial sites (check current amounts)', url: 'https://austinenergy.com',
    summary: 'Austin Energy rebate for businesses and property owners in its service area who install EV chargers.',
    offer: 'Level 2 at retail, workplace and multifamily sites.', requirements: 'Austin Energy customer\nNetworked charger\nApply before installation' }),
  R({ key: 'txTERP', name: 'TCEQ Alternative Fueling Facilities Program (TERP)', state: 'TX', provider: 'Texas Commission on Environmental Quality', kind: 'grant', status: 'upcoming', charger_types: 'DCFC',
    amount_text: 'Grant toward a share of eligible project costs (opens in funding rounds)', url: 'https://www.tceq.texas.gov/airquality/terp',
    summary: 'Texas grant for building alternative fueling and EV charging facilities, offered in funding rounds.',
    offer: 'Best for DC fast chargers on major corridors and fleet depots.', requirements: 'Site in an eligible Texas county\nApply during an open funding round\nOperate the station for the required period' }),
  R({ key: 'caCALeVIP', name: 'CALeVIP', state: 'CA', provider: 'California Energy Commission', kind: 'rebate', status: 'waitlist', charger_types: 'L2,DCFC',
    amount_text: 'Regional rebates for Level 2 and DC fast chargers (amounts vary by project)', url: 'https://calevip.org',
    summary: 'California Electric Vehicle Infrastructure Project: regional rebate projects for public and shared chargers.',
    offer: 'Level 2 and DC fast, depending on which regional project is open.', requirements: 'Site inside an active project region\nPublicly accessible chargers\nReserve funds before buying equipment' }),
  R({ key: 'caSCE', name: 'SCE Charge Ready', state: 'CA', provider: 'Southern California Edison', kind: 'make_ready', status: 'open', charger_types: 'L2,DCFC', utility: 'SCE',
    amount_text: 'SCE builds and pays for much of the make-ready infrastructure', url: 'https://www.sce.com/business/electric-cars/charge-ready',
    summary: 'Southern California Edison program that covers the electrical infrastructure for chargers at customer sites.',
    offer: 'Level 2 and DC fast at SCE sites.', requirements: 'SCE customer\nMinimum number of ports per site' }),
  R({ key: 'ctEVCP', name: 'CT EV Charging Program (EVCP)', state: 'CT', provider: 'Eversource & United Illuminating', kind: 'rebate', status: 'open', charger_types: 'L2,DCFC',
    site_types: 'workplace, multifamily, public', amount_text: 'Incentives per port for Level 2 and DC fast chargers (check current amounts)', url: 'https://www.eversource.com',
    summary: 'Connecticut utility incentives for chargers at public, workplace and multifamily sites in Eversource and UI territory.',
    offer: 'Level 2 at most sites; DC fast at public corridor sites.', requirements: 'Eversource or United Illuminating customer\nNetworked charger\nPre-approval before installation' }),
  R({ key: 'ilComEd', name: 'ComEd business & public sector EV make-ready rebates', state: 'IL', provider: 'ComEd', kind: 'make_ready', status: 'open', charger_types: 'L2,DCFC', utility: 'ComEd',
    amount_text: 'Rebates toward make-ready and charger costs (check current amounts)', url: 'https://www.comed.com/clean-energy/electric-vehicles',
    summary: 'ComEd rebates for businesses and public-sector sites in northern Illinois that install EV charging.',
    offer: 'Level 2 and DC fast for ComEd customers in Chicago and the suburbs.', requirements: 'ComEd customer\nApply before installation\nExtra support in equity-eligible communities' }),
  R({ key: 'ilEPA', name: 'Illinois EPA Level 2 charging grants', state: 'IL', provider: 'Illinois EPA', kind: 'grant', status: 'closed', charger_types: 'L2',
    amount_text: 'Grants toward public Level 2 chargers (funding rounds)', url: 'https://epa.illinois.gov',
    summary: 'State grants for publicly accessible Level 2 charging, offered in funding rounds.',
    offer: 'Level 2 at public sites.', requirements: 'Publicly accessible\nSite in Illinois\nApply during an open round' }),
  // tax credits
  R({ key: 'us30C', name: 'Federal 30C charger tax credit', state: 'US', provider: 'IRS', kind: 'tax_credit', status: 'closed', charger_types: 'L2,DCFC',
    amount_text: 'Up to 30% of the cost per charger in eligible census tracts', url: 'https://www.irs.gov/credits-deductions/alternative-fuel-vehicle-refueling-property-credit',
    summary: 'Federal tax credit for EV charging equipment in eligible (low-income or non-urban) census tracts.',
    offer: 'Applies to the charging equipment the customer owns.',
    requirements: 'Site in an eligible census tract\nCharger placed in service before the credit ended',
    notes: 'As we understand it, a 2025 federal law ended this credit for chargers placed in service after June 30, 2026. Confirm with a tax advisor before quoting it.' }),
  R({ key: 'nyTax', name: 'NY alternative fuel vehicle recharging property credit', state: 'NY', provider: 'NY State Dept. of Taxation', kind: 'tax_credit', status: 'open', charger_types: 'L2,DCFC',
    amount_text: 'State tax credit on charging station costs (check the current cap and end date)', url: 'https://www.tax.ny.gov',
    summary: 'New York State business tax credit for installing EV charging property.', offer: 'Applies to chargers the customer owns in New York.',
    requirements: 'Charger located in New York\nCheck the program end date before quoting' }),
];
const rebateId = {};
const insRebate = db.prepare(`INSERT INTO rebates (name, state, provider, kind, status, amount_text, charger_types, site_types, utility_id, url, summary, offer, requirements, notes, verified, updated_by)
  VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,?)`);
if (seedDirectory) {
  db.transaction(() => REBATES.forEach((r) => {
    rebateId[r.key] = insRebate.run(r.name, r.state, r.provider, r.kind, r.status, r.amount_text, r.charger_types, r.site_types || null,
      r.utility ? utilId[r.utility] : null, r.url, r.summary, r.offer, r.requirements, r.notes || null, admin).lastInsertRowid;
  }))();
}

// Milestone codes, one letter per default milestone in order
// (Site walk & proposal, Send proposal, Contract, Permitting, Approvals, Installation):
//   D = done, I = in progress, N = not needed, - = not started.
// They deliberately don't all follow the same order — e.g. approvals done before permitting.
// [name, customer, contact, email, phone, address, city, state, zip, site type, charger type, ports, kW, value,
//  milestone code, status, priority, days the in-progress milestone(s) have run, lat, lng, utility, rebates]
const projects = [
  ['Riverside Plaza Garage', 'Riverside Retail LLC', 'Dana Morris', 'dana@riverside.example', '555-0101', '120 River St', 'Austin', 'TX', '78701', 'retail', 'L2', 12, 115, 84000, 'DDDID-', 'active', 'high', 41, 30.2672, -97.7431, 'Austin Energy', ['txAE']],
  ['Harbor Logistics Fleet Depot', 'Harbor Logistics', 'Luis Ortega', 'luis@harbor.example', '555-0102', '9 Dock Rd', 'Houston', 'TX', '77002', 'fleet', 'DCFC', 8, 1200, 960000, 'DDDDI-', 'blocked', 'urgent', 63, 29.7499, -95.3584, 'CenterPoint Energy', ['txTERP']],
  ['Oakwood Apartments', 'Oakwood Residential', 'Priya Nair', 'priya@oakwood.example', '555-0103', '44 Oak Ave', 'Yonkers', 'NY', '10701', 'multifamily', 'L2', 20, 144, 112000, 'DI-I--', 'active', 'medium', 9, 40.9312, -73.8988, 'Con Edison', ['nyCRNY']],
  ['Boardwalk Hotel & Suites', 'Boardwalk Hospitality', 'Tom Becker', 'tom@boardwalk.example', '555-0104', '800 Pacific Ave', 'Atlantic City', 'NJ', '08401', 'hospitality', 'L2 + DCFC', 10, 420, 310000, 'DDD---', 'active', 'high', 3, 39.3593, -74.4313, 'Atlantic City Electric', ['njGrant']],
  ['City Hall Public Lot', 'City of Round Rock', 'Angela Kim', 'akim@roundrock.example', '555-0105', '221 E Main St', 'Round Rock', 'TX', '78664', 'municipal', 'L2', 6, 43, 52000, 'I---N-', 'on_hold', 'medium', 22, 30.5083, -97.6789, 'Oncor', []],
  ['QuickFuel Travel Center', 'QuickFuel Inc', 'Ray Dawson', 'ray@quickfuel.example', '555-0106', 'I-35 Exit 250', 'Georgetown', 'TX', '78626', 'fuel_station', 'DCFC', 6, 1800, 1150000, 'DDDDDI', 'active', 'high', 12, 30.6333, -97.6772, 'Oncor', ['txTERP']],
  ['Harbor Point Campus', 'Harbor Point Holdings', 'Ellen Wu', 'ellen@harborpoint.example', '555-0107', '5 Innovation Way', 'Stamford', 'CT', '06902', 'workplace', 'L2', 30, 216, 165000, 'DDDNDD', 'active', 'medium', 4, 41.0402, -73.5418, 'Eversource', ['ctEVCP']],
  ['Lakeshore Medical Center', 'Lakeshore Health', 'Dr. Omar Haddad', 'ohaddad@lakeshore.example', '555-0108', '300 E Superior St', 'Chicago', 'IL', '60611', 'workplace', 'L2', 16, 115, 98000, 'DDDDDD', 'won', 'low', 30, 41.8958, -87.6206, 'ComEd', ['ilComEd']],
  ['Market Street Parking Structure', 'Market Street Parking Co', 'Kevin Lee', 'kevin@marketst.example', '555-0109', '77 Market St', 'Newark', 'NJ', '07102', 'parking', 'L2', 24, 173, 140000, 'I-----', 'active', 'medium', 2, 40.7357, -74.1724, 'PSE&G', ['njPSEG']],
  ['Greenway Grocers #14', 'Greenway Grocers', 'Sofia Alvarez', 'sofia@greenway.example', '555-0110', '1400 W Ogden Ave', 'Naperville', 'IL', '60563', 'retail', 'DCFC', 4, 600, 420000, 'DIIN--', 'active', 'high', 15, 41.7720, -88.1739, 'ComEd', ['ilComEd']],
  ['Northgate Office Park', 'Northgate REIT', 'Brian Cole', 'bcole@northgate.example', '555-0111', '2 Northgate Ct', 'Frisco', 'TX', '75034', 'workplace', 'L2', 14, 101, 76000, 'DDD-I-', 'active', 'medium', 26, 33.1507, -96.8236, 'Oncor', []],
  ['Bayview Transit Hub', 'Bayview Transit Authority', 'Grace Park', 'gpark@bayview.example', '555-0112', '1 Harbor Dr', 'San Diego', 'CA', '92101', 'municipal', 'DCFC', 10, 1500, 1020000, 'DDIIN-', 'active', 'high', 18, 32.7157, -117.1611, 'SDG&E', ['caCALeVIP']],
  ['Atlantic Commons Shopping Center', 'Atlantic Commons Retail', 'Marco Silva', 'msilva@atlanticcommons.example', '555-0113', '550 Atlantic Ave', 'Brooklyn', 'NY', '11217', 'retail', 'L2 + DCFC', 12, 480, 365000, 'D-----', 'active', 'medium', 6, 40.6846, -73.9776, 'Con Edison', ['nyConEd', 'nyCRNY']],
];

// Properties in due diligence:
// [name, address, city, state, zip, site type, property owner, owner contact, typed rebate, rebate $, utility, days ago, lat, lng, rebates,
//  stage (new / review / passed), rating, insight, reviewer note]
const diligence = [
  ['Lakeview Retail Center', '3100 N Clark St', 'Chicago', 'IL', '60657', 'retail', 'Lakeview Holdings LLC', '312-555-0140', null, 45000, 'ComEd', 5, 41.9390, -87.6447, ['ilComEd'],
    'review', 4, 'Busy Clark St corridor with steady evening traffic. 60-space surface lot and a 400A service with room to spare. Owner already asked about chargers for tenants. ComEd make-ready should cover most of the electrical work. Only concern is the lot gets tight on weekends.', null],
  ['Shoreline Medical Plaza', '150 Boston Post Rd', 'Milford', 'CT', '06460', 'workplace', 'Shoreline Properties', '203-555-0190', null, 30000, 'United Illuminating', 7, 41.2223, -73.0565, ['ctEVCP'],
    'review', 5, 'Medical office with 200+ staff and patients parked 1–3 hours: ideal dwell time for Level 2. New switchgear installed last year. Owner is motivated (ESG reporting) and CT EVCP fits well. Strong candidate for 12–16 ports.', null],
  ['Harborside Apartments', '200 Hudson St', 'Jersey City', 'NJ', '07311', 'multifamily', 'Harborside Residential', 'leasing@harborside.example', null, null, 'PSE&G', 3, 40.7178, -74.0335, [],
    'new', null, null, null],
  ['Riverbend Business Park', '2400 Commerce Dr', 'Plano', 'TX', '75074', 'workplace', 'Riverbend Partners', '972-555-0133', null, null, 'Oncor', 1, 33.0198, -96.6989, [],
    'new', null, null, null],
  ['Sacramento Logistics Yard', '4800 Power Inn Rd', 'Sacramento', 'CA', '95826', 'fleet', null, null, 'HVIP + SMUD fleet electrification', 250000, 'SMUD', 9, 38.5371, -121.4171, [],
    'new', 3, 'Big fleet opportunity, but we still don\'t know who owns the yard versus the operator.', 'Find out who owns the yard and whether SMUD has capacity for DC fast before we go further.'],
  ['Hill Country Inn', '250 Main St', 'Fredericksburg', 'TX', '78624', 'hospitality', 'Hill Country Hospitality', '830-555-0177', 'None', null, 'Central Texas Electric Co-op', 12, 30.2752, -98.8720, [],
    'passed', 2, 'Small inn with 18 spaces and an old 200A panel. Little traffic outside weekends and no rebate in this co-op territory.', 'Too small and no rebate to make the numbers work. Revisit if the co-op launches a program.'],
];

const insP = db.prepare(`INSERT INTO projects (name, customer_name, contact_name, contact_email, contact_phone, address, city, state, zip, site_type,
  charger_type, charger_count, power_kw, estimated_value, phase, status, priority, owner_id, stage_entered_at, created_at, hold_reason, target_live_date,
  lat, lng, geocoded_at, utility_id, utility_company, property_owner, tax_credit_id, tax_credit_eligible)
  VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?, 'pipeline', ?,?,?, datetime('now', ?), datetime('now', ?), ?, date('now', ?), ?, ?, datetime('now'), ?, ?, ?, ?, ?)`);
const insM = db.prepare(`INSERT INTO project_milestones (project_id, milestone_id, status, started_at, completed_at, updated_at)
  VALUES (?,?,?, datetime('now', ?), datetime('now', ?), datetime('now', ?))`);
const insMH = db.prepare(`INSERT INTO milestone_history (project_id, milestone_id, milestone_name, from_status, to_status, user_id, changed_at)
  VALUES (?,?,?,?,?,?, datetime('now', ?))`);
const insT = db.prepare('INSERT INTO tickets (project_id, title, type, priority, status, assignee_id, due_date, created_by, description) VALUES (?,?,?,?,?,?, date(\'now\', ?),?,?)');
const insA = db.prepare('INSERT INTO activity (project_id, user_id, action, detail) VALUES (?,?,?,?)');
const insPR = db.prepare('INSERT OR IGNORE INTO project_rebates (project_id, rebate_id, position) VALUES (?,?,?)');
const linkRebates = (pid, keys) => keys.forEach((k, i) => rebateId[k] && insPR.run(pid, rebateId[k], i));
const CODE = { D: 'done', I: 'in_progress', N: 'not_needed' };
// the owner of each site is whoever covers that state
const ownerFor = (state, i) => userIds[staff.findIndex((s) => s[3].split(',').includes(state))] || userIds[i % userIds.length];

if (seedPipeline) db.transaction(() => {
  projects.forEach((p, i) => {
    const [name, cust, cn, ce, cp, addr, city, state, zip, site, ctype, count, kw, value, code, status, prio, daysIn, lat, lng, utility, rebates] = p;
    const owner = ownerFor(state, i);
    const done = [...code].filter((c) => c === 'D').length;
    const createdDaysAgo = daysIn + done * 10 + 5;
    const hold = status === 'blocked' ? 'Waiting on utility transformer upgrade – CenterPoint ETA unknown' : status === 'on_hold' ? 'City council budget vote pending' : null;
    const tax = ['NY'].includes(state) ? rebateId.nyTax : rebateId.us30C;
    const pid = insP.run(name, cust, cn, ce, cp, addr, city, state, zip, site, ctype, count, kw, value, status, prio, owner,
      `-${createdDaysAgo} days`, `-${createdDaysAgo} days`, hold, `+${(code.length - done) * 25 + 10} days`,
      lat, lng, utilId[utility] ?? null, utility, cust, tax ?? null, tax ? 'unknown' : 'unknown').lastInsertRowid;
    db.prepare('UPDATE projects SET code = ? WHERE id = ?').run(`EV-${String(pid).padStart(4, '0')}`, pid);
    insA.run(pid, owner, 'project_created', name);
    linkRebates(pid, rebates);
    let k = 0;
    [...code].forEach((c, mi) => {
      const st = CODE[c]; if (!st) return;
      const m = milestones[mi]; if (!m) return;
      // copy the milestone's steps: all ticked when done, about half ticked when in progress
      const tmpl = db.prepare('SELECT label, position FROM milestone_steps WHERE milestone_id = ? ORDER BY position').all(m.id);
      if (st !== 'not_needed') {
        const ticked = st === 'done' ? tmpl.length : Math.floor(tmpl.length / 2);
        tmpl.forEach((s, si) => db.prepare(`INSERT INTO project_steps (project_id, milestone_id, label, position, done_at, done_by)
          VALUES (?,?,?,?, ${si < ticked ? `datetime('now', '-${Math.max(1, daysIn - si)} days')` : 'NULL'}, ?)`)
          .run(pid, m.id, s.label, s.position, si < ticked ? owner : null));
      }
      if (st === 'done') {
        const startAgo = createdDaysAgo - 3 - k * 8; const endAgo = Math.max(daysIn + 1, startAgo - 7); k++;
        insM.run(pid, m.id, st, `-${startAgo} days`, `-${endAgo} days`, `-${endAgo} days`);
        insMH.run(pid, m.id, m.name, 'not_started', 'done', owner, `-${endAgo} days`);
      } else if (st === 'in_progress') {
        insM.run(pid, m.id, st, `-${daysIn} days`, null, `-${daysIn} days`);
        insMH.run(pid, m.id, m.name, 'not_started', 'in_progress', owner, `-${daysIn} days`);
      } else {
        insM.run(pid, m.id, st, null, null, `-${createdDaysAgo - 1} days`);
        insMH.run(pid, m.id, m.name, 'not_started', 'not_needed', owner, `-${createdDaysAgo - 1} days`);
      }
    });
  });

  const t = [
    [1, 'Submit electrical permit to City of Austin', 'permit', 'high', 'in_progress', 0, '+3 days'],
    [1, 'Respond to plan-review comments (load calc)', 'permit', 'urgent', 'open', 0, '-2 days'],
    [2, 'Escalate transformer upgrade with utility', 'utility', 'urgent', 'waiting', 0, '+1 days'],
    [2, 'Confirm DCFC dispenser delivery date', 'installation', 'medium', 'open', 0, '+10 days'],
    [3, 'Follow up on proposal – revised pricing', 'task', 'medium', 'open', 1, '+2 days'],
    [4, 'Kick-off meeting & schedule site walk', 'task', 'high', 'open', 1, '+5 days'],
    [5, 'Site survey photos & panel capacity check', 'site_survey', 'medium', 'waiting', 0, '+14 days'],
    [6, 'Trenching inspection', 'installation', 'high', 'in_progress', 0, '+1 days'],
    [7, 'OCPP backend onboarding & test sessions', 'commissioning', 'medium', 'in_progress', 1, '+4 days'],
    [8, 'Port 7 intermittent fault', 'maintenance', 'medium', 'resolved', 2, '-5 days'],
    [10, 'Prepare ComEd make-ready rebate application', 'utility', 'high', 'open', 2, '+7 days'],
  ];
  t.forEach(([pi, title, type, prio, status, ui, due]) => {
    insT.run(pi, title, type, prio, status, userIds[ui], due, userIds[0], null);
    insA.run(pi, userIds[0], 'ticket_created', title);
  });

  // a few chat messages: [project, milestone position (0 = general site chat), staff index, text, days ago]
  const insMsg = db.prepare(`INSERT INTO messages (project_id, milestone_id, milestone_name, user_id, body, created_at)
    VALUES (?,?,?,?,?, datetime('now', ?))`);
  [
    [1, 0, 0, 'Kicked this one off with Dana. She wants chargers live before the holiday rush.', '-60 days'],
    [1, 4, 0, 'Permit submitted to the City of Austin. Their portal says 4–6 weeks.', '-40 days'],
    [1, 5, 1, 'Landlord approval came back early, so approvals are done even though the permit is still out.', '-30 days'],
    [1, 4, 2, 'Plan review came back with comments on the load calc. Working on a response.', '-3 days'],
    [1, 4, 0, 'Sent the revised load calc this morning. @Jordan Reyes can you double-check the panel schedule?', '-1 days'],
    [2, 5, 0, 'CenterPoint still has no date for the transformer upgrade. Escalated to our utility rep.', '-10 days'],
    [2, 0, 0, 'Customer is asking if we can start trenching while we wait on the utility.', '-2 days'],
    [13, 0, 1, 'Stacking Con Ed PowerReady with Charge Ready NY here. Owner is happy with the numbers.', '-4 days'],
  ].forEach(([pi, pos, ui, body, ago]) => {
    const m = pos ? milestones[pos - 1] : null;
    insMsg.run(pi, m?.id ?? null, m?.name ?? null, userIds[ui], body, ago);
  });

  // follow-up reminders (one due today for the admin, so the Dashboard shows it)
  const insRem = db.prepare(`INSERT INTO reminders (project_id, milestone_id, user_id, created_by, due_on, text) VALUES (?,?,?,?, date('now', ?), ?)`);
  insRem.run(1, milestones[3]?.id ?? null, admin, admin, '+0 days', 'Chase City of Austin on the plan review');
  insRem.run(2, milestones[4]?.id ?? null, userIds[0], admin, '+2 days', 'Call CenterPoint for a transformer date');
  insRem.run(3, milestones[1]?.id ?? null, userIds[1], admin, '-1 days', 'Send Oakwood the revised proposal');
})();

const insD = db.prepare(`INSERT INTO projects (name, address, city, state, zip, site_type, property_owner, property_owner_contact, rebate_program,
  rebate_amount, utility_company, utility_id, lat, lng, geocoded_at, phase, status, priority, owner_id, stage_entered_at, created_at,
  dd_stage, dd_rating, dd_insight, dd_assessed_by, dd_assessed_at, dd_review_note, dd_reviewed_by, dd_reviewed_at)
  VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?, datetime('now'), 'diligence', 'active', 'medium', ?, datetime('now', ?), datetime('now', ?),
  ?, ?, ?, ?, datetime('now', '-1 days'), ?, ?, CASE WHEN ? IS NULL THEN NULL ELSE datetime('now', '-1 days') END)`);
if (seedDiligence) db.transaction(() => {
  diligence.forEach((d, i) => {
    const [name, addr, city, state, zip, site, owner, contact, rebate, rebateAmt, utility, daysAgo, lat, lng, rebates, stage, rating, insight, note] = d;
    const who = ownerFor(state, i);
    const pid = insD.run(name, addr, city, state, zip, site, owner, contact, rebate, rebateAmt, utility, utilId[utility] ?? null, lat, lng, who, `-${daysAgo} days`, `-${daysAgo} days`,
      stage, rating, insight, rating ? admin : null, note, note ? jojo : null, note).lastInsertRowid;
    db.prepare('UPDATE projects SET code = ? WHERE id = ?').run(`EV-${String(pid).padStart(4, '0')}`, pid);
    linkRebates(pid, rebates);
    insA.run(pid, who, 'project_created', `${name} (added to due diligence)`);
  });
})();

if (seedPipeline) console.log(`Seeded ${projects.length} demo projects and staff users (password: changeme123).`);
if (seedDiligence) console.log(`Added ${diligence.length} demo properties to Due Diligence.`);
if (seedDirectory) console.log(`Added ${REBATES.length} sample rebates (marked "needs checking") and ${UTILITIES.length} utilities.`);
