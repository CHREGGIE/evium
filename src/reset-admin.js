'use strict';
// Reset (or create) an admin login.
// Usage: npm run reset-admin -- <password> [email]
const { db, hashPassword } = require('./db');

const password = process.argv[2];
const email = process.argv[3] || process.env.ADMIN_EMAIL || 'admin@eviumcharging.com';

if (!password || password.length < 8) {
  console.error('Usage: npm run reset-admin -- <new-password> [email]   (password must be at least 8 characters)');
  process.exit(1);
}

const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
if (existing) {
  db.prepare("UPDATE users SET password_hash = ?, role = 'admin', active = 1 WHERE id = ?").run(hashPassword(password), existing.id);
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(existing.id);
  console.log(`Password reset for ${email}. You can sign in now.`);
} else {
  db.prepare("INSERT INTO users (name, email, password_hash, role) VALUES ('Administrator', ?, ?, 'admin')").run(email, hashPassword(password));
  console.log(`Admin account created: ${email}. You can sign in now.`);
}
