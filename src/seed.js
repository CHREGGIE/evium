'use strict';
// Loads demo data so you can explore the CRM. Usage: npm run seed
const { db, hashPassword } = require('./db');

const seedPipeline = db.prepare('SELECT COUNT(*) c FROM projects').get().c === 0;
const seedDiligence = db.prepare("SELECT COUNT(*) c FROM projects WHERE phase = 'diligence'").get().c === 0;
if (!seedPipeline && !seedDiligence) {
  console.log('Demo data already loaded – nothing to add.');
  process.exit(0);
}

const milestones = db.prepare('SELECT * FROM milestones ORDER BY position').all();

const staff = [
  ['Maya Chen', 'maya@eviumcharging.com', 'staff'],
  ['Jordan Reyes', 'jordan@eviumcharging.com', 'staff'],
  ['Sam Patel', 'sam@eviumcharging.com', 'staff'],
];
const userIds = staff.map(([name, email, role]) => {
  const ex = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  return ex ? ex.id : db.prepare('INSERT INTO users (name, email, password_hash, role) VALUES (?,?,?,?)').run(name, email, hashPassword('changeme123'), role).lastInsertRowid;
});

// Milestone codes, one letter per default milestone in order
// (Site walk, Proposal, Contract, Permitting, Approvals, Installation):
//   D = done, I = in progress, N = not needed, - = not started.
// They deliberately don't all follow the same order — e.g. approvals done before permitting.
// The last number is how many days the in-progress milestone(s) have been running.
const projects = [
  ['Riverside Plaza Garage', 'Riverside Retail LLC', 'Dana Morris', 'dana@riverside.example', '555-0101', '120 River St', 'Austin', 'TX', '78701', 'retail', 'L2', 12, 115, 84000, 'DDDID-', 'active', 'high', 41],
  ['Harbor Logistics Fleet Depot', 'Harbor Logistics', 'Luis Ortega', 'luis@harbor.example', '555-0102', '9 Dock Rd', 'Houston', 'TX', '77002', 'fleet', 'DCFC', 8, 1200, 960000, 'DDDDI-', 'blocked', 'urgent', 63],
  ['Oakwood Apartments', 'Oakwood Residential', 'Priya Nair', 'priya@oakwood.example', '555-0103', '44 Oak Ave', 'Dallas', 'TX', '75201', 'multifamily', 'L2', 20, 144, 112000, 'DI-I--', 'active', 'medium', 9],
  ['Sunset Hotel & Suites', 'Sunset Hospitality', 'Tom Becker', 'tom@sunset.example', '555-0104', '800 Sunset Blvd', 'San Antonio', 'TX', '78205', 'hospitality', 'L2 + DCFC', 10, 420, 310000, 'DDD---', 'active', 'high', 3],
  ['City Hall Public Lot', 'City of Round Rock', 'Angela Kim', 'akim@roundrock.example', '555-0105', '221 E Main St', 'Round Rock', 'TX', '78664', 'municipal', 'L2', 6, 43, 52000, 'I---N-', 'on_hold', 'medium', 22],
  ['QuickFuel Travel Center', 'QuickFuel Inc', 'Ray Dawson', 'ray@quickfuel.example', '555-0106', 'I-35 Exit 250', 'Georgetown', 'TX', '78626', 'fuel_station', 'DCFC', 6, 1800, 1150000, 'DDDDDI', 'active', 'high', 12],
  ['TechPark Campus B', 'TechPark Holdings', 'Ellen Wu', 'ellen@techpark.example', '555-0107', '5 Innovation Way', 'Austin', 'TX', '78758', 'workplace', 'L2', 30, 216, 165000, 'DDDNDD', 'active', 'medium', 4],
  ['Lakeside Medical Center', 'Lakeside Health', 'Dr. Omar Haddad', 'ohaddad@lakeside.example', '555-0108', '300 Lake Dr', 'Austin', 'TX', '78746', 'workplace', 'L2', 16, 115, 98000, 'DDDDDD', 'won', 'low', 30],
  ['Midtown Parking Structure', 'Midtown Parking Co', 'Kevin Lee', 'kevin@midtown.example', '555-0109', '77 5th St', 'Houston', 'TX', '77003', 'parking', 'L2', 24, 173, 140000, 'I-----', 'active', 'medium', 2],
  ['Greenway Grocers #14', 'Greenway Grocers', 'Sofia Alvarez', 'sofia@greenway.example', '555-0110', '1400 Greenway Pkwy', 'Plano', 'TX', '75024', 'retail', 'DCFC', 4, 600, 420000, 'DIIN--', 'active', 'high', 15],
  ['Westfield Office Park', 'Westfield REIT', 'Brian Cole', 'bcole@westfield.example', '555-0111', '2 Westfield Ct', 'Frisco', 'TX', '75034', 'workplace', 'L2', 14, 101, 76000, 'DDD-I-', 'active', 'medium', 26],
  ['Bayview Transit Hub', 'Bayview Transit Authority', 'Grace Park', 'gpark@bayview.example', '555-0112', '1 Harbor Dr', 'San Diego', 'CA', '92101', 'municipal', 'DCFC', 10, 1500, 1020000, 'DDIIN-', 'active', 'high', 18],
  ['Palm Grove Shopping Center', 'Palm Grove Retail', 'Marco Silva', 'msilva@palmgrove.example', '555-0113', '5500 Palm Ave', 'Orlando', 'FL', '32801', 'retail', 'L2 + DCFC', 12, 480, 365000, 'DI----', 'active', 'medium', 6],
];

// Properties still in due diligence: [name, address, city, state, zip, site type, property owner, owner contact, rebate, rebate $, utility, days ago]
const diligence = [
  ['Desert Ridge Marketplace', '21001 N Tatum Blvd', 'Phoenix', 'AZ', '85050', 'retail', 'Desert Ridge Holdings LLC', '602-555-0140', 'SRP Business EV Rebate', 45000, 'Salt River Project (SRP)', 5],
  ['Coral Bay Apartments', '900 Biscayne Blvd', 'Miami', 'FL', '33132', 'multifamily', 'Coral Bay Residential', 'leasing@coralbay.example', null, null, 'Florida Power & Light (FPL)', 3],
  ['Sacramento Logistics Yard', '4800 Power Inn Rd', 'Sacramento', 'CA', '95826', 'fleet', null, null, 'HVIP + SMUD Fleet Electrification', 250000, 'SMUD', 9],
  ['Hill Country Inn', '250 Main St', 'Fredericksburg', 'TX', '78624', 'hospitality', 'Hill Country Hospitality', '830-555-0177', 'None', null, 'Central Texas Electric Co-op', 12],
];

const insP = db.prepare(`INSERT INTO projects (name, customer_name, contact_name, contact_email, contact_phone, address, city, state, zip, site_type,
  charger_type, charger_count, power_kw, estimated_value, phase, status, priority, owner_id, stage_entered_at, created_at, hold_reason, target_live_date)
  VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?, 'pipeline', ?,?,?, datetime('now', ?), datetime('now', ?), ?, date('now', ?))`);
const insM = db.prepare(`INSERT INTO project_milestones (project_id, milestone_id, status, started_at, completed_at, updated_at)
  VALUES (?,?,?, datetime('now', ?), datetime('now', ?), datetime('now', ?))`);
const insMH = db.prepare(`INSERT INTO milestone_history (project_id, milestone_id, milestone_name, from_status, to_status, user_id, changed_at)
  VALUES (?,?,?,?,?,?, datetime('now', ?))`);
const insT = db.prepare('INSERT INTO tickets (project_id, title, type, priority, status, assignee_id, due_date, created_by, description) VALUES (?,?,?,?,?,?, date(\'now\', ?),?,?)');
const insA = db.prepare('INSERT INTO activity (project_id, user_id, action, detail) VALUES (?,?,?,?)');
const CODE = { D: 'done', I: 'in_progress', N: 'not_needed' };

if (seedPipeline) db.transaction(() => {
  projects.forEach((p, i) => {
    const [name, cust, cn, ce, cp, addr, city, state, zip, site, ctype, count, kw, value, code, status, prio, daysIn] = p;
    const owner = userIds[i % userIds.length];
    const done = [...code].filter((c) => c === 'D').length;
    const createdDaysAgo = daysIn + done * 10 + 5;
    const hold = status === 'blocked' ? 'Waiting on utility transformer upgrade – CenterPoint ETA unknown' : status === 'on_hold' ? 'City council budget vote pending' : null;
    const pid = insP.run(name, cust, cn, ce, cp, addr, city, state, zip, site, ctype, count, kw, value, status, prio, owner,
      `-${createdDaysAgo} days`, `-${createdDaysAgo} days`, hold, `+${(code.length - done) * 25 + 10} days`).lastInsertRowid;
    db.prepare('UPDATE projects SET code = ? WHERE id = ?').run(`EV-${String(pid).padStart(4, '0')}`, pid);
    insA.run(pid, owner, 'project_created', name);
    let k = 0;
    [...code].forEach((c, mi) => {
      const st = CODE[c]; if (!st) return;
      const m = milestones[mi]; if (!m) return;
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
    [2, 'Escalate transformer upgrade with utility', 'utility', 'urgent', 'waiting', 1, '+1 days'],
    [2, 'Confirm DCFC dispenser delivery date', 'installation', 'medium', 'open', 2, '+10 days'],
    [3, 'Follow up on proposal – revised pricing', 'task', 'medium', 'open', 2, '+2 days'],
    [4, 'Kick-off meeting & schedule site walk', 'task', 'high', 'open', 0, '+5 days'],
    [5, 'Site survey photos & panel capacity check', 'site_survey', 'medium', 'waiting', 1, '+14 days'],
    [6, 'Trenching inspection', 'installation', 'high', 'in_progress', 2, '+1 days'],
    [7, 'OCPP backend onboarding & test sessions', 'commissioning', 'medium', 'in_progress', 0, '+4 days'],
    [8, 'Port 7 intermittent fault', 'maintenance', 'medium', 'resolved', 1, '-5 days'],
    [10, 'Prepare make-ready rebate application', 'utility', 'high', 'open', 2, '+7 days'],
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
    [1, 4, 0, 'Sent the revised load calc this morning.', '-1 days'],
    [2, 5, 1, 'CenterPoint still has no date for the transformer upgrade. Escalated to our utility rep.', '-10 days'],
    [2, 0, 2, 'Customer is asking if we can start trenching while we wait on the utility.', '-2 days'],
  ].forEach(([pi, pos, ui, body, ago]) => {
    const m = pos ? milestones[pos - 1] : null;
    insMsg.run(pi, m?.id ?? null, m?.name ?? null, userIds[ui], body, ago);
  });
})();

const insD = db.prepare(`INSERT INTO projects (name, address, city, state, zip, site_type, property_owner, property_owner_contact, rebate_program,
  rebate_amount, utility_company, phase, status, priority, owner_id, stage_entered_at, created_at)
  VALUES (?,?,?,?,?,?,?,?,?,?,?, 'diligence', 'active', 'medium', ?, datetime('now', ?), datetime('now', ?))`);
if (seedDiligence) db.transaction(() => {
  diligence.forEach((d, i) => {
    const [name, addr, city, state, zip, site, owner, contact, rebate, rebateAmt, utility, daysAgo] = d;
    const pid = insD.run(name, addr, city, state, zip, site, owner, contact, rebate, rebateAmt, utility, userIds[i % userIds.length], `-${daysAgo} days`, `-${daysAgo} days`).lastInsertRowid;
    db.prepare('UPDATE projects SET code = ? WHERE id = ?').run(`EV-${String(pid).padStart(4, '0')}`, pid);
    insA.run(pid, userIds[i % userIds.length], 'project_created', `${name} (added to due diligence)`);
  });
})();

if (seedPipeline) console.log(`Seeded ${projects.length} demo projects and staff users (password: changeme123).`);
if (seedDiligence) console.log(`Added ${diligence.length} demo properties to Due Diligence.`);
