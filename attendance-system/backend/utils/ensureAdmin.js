const User = require('../models/User');

// Creates the first admin account from .env if no admin exists yet
async function ensureAdmin() {
  const exists = await User.exists({ role: 'admin' });
  if (exists) return;
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) {
    console.warn('No admin found and ADMIN_EMAIL/ADMIN_PASSWORD not set - skipping admin creation.');
    return;
  }
  const admin = new User({
    name: process.env.ADMIN_NAME || 'Administrator',
    email,
    password,
    role: 'admin',
    designation: process.env.ADMIN_DESIGNATION || 'Administrator',
    employeeId: process.env.ADMIN_EMPLOYEE_ID || 'ADM001',
    salary: Number(process.env.ADMIN_SALARY || 0),
  });
  await admin.setPin(process.env.DEFAULT_KIOSK_PIN || '1234');
  await admin.save();
  console.log(`Default admin created: ${email}  (change the password after first login)`);
}

module.exports = ensureAdmin;
