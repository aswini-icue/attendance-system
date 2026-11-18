// Attendance Kiosk: a shared device (tablet / PC at the entrance) where every person
// registers their own attendance by tapping their name and entering their 4-digit PIN.
//
// Security model
//  - An admin activates the device once (email + password) -> long-lived kiosk token.
//    The kiosk token can ONLY call /api/kiosk/* (it is not a user session).
//  - Every action needs the person's PIN. After 5 wrong PINs that person is locked
//    out of the kiosk for 5 minutes.
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const asyncHandler = require('../utils/asyncHandler');
const HttpError = require('../utils/httpError');
const ops = require('../utils/attendanceOps');
const { isReg, shiftOf } = require('../utils/attendanceRules');
const Attendance = require('../models/Attendance');
const { todayStr } = require('../utils/time');

const MAX_TRIES = 5;
const LOCK_MS = 5 * 60 * 1000;
const failures = new Map(); // userId -> { count, until }

// POST /api/kiosk/activate { email, password }  (admin credentials)
exports.activate = asyncHandler(async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) throw new HttpError(400, 'Admin email and password are required');
  const admin = await User.findOne({ email: String(email).toLowerCase().trim(), role: 'admin' }).select('+password');
  if (!admin || !(await admin.comparePassword(String(password)))) throw new HttpError(401, 'Invalid admin credentials');
  if (admin.status !== 'active') throw new HttpError(403, 'Admin account is inactive');
  const token = jwt.sign({ kiosk: true, by: admin._id }, process.env.JWT_SECRET, {
    expiresIn: process.env.KIOSK_TOKEN_EXPIRES_IN || '90d',
  });
  res.json({ token, activatedBy: admin.name });
});

// Middleware: valid kiosk token required
exports.kioskAuth = asyncHandler(async (req, _res, next) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) throw new HttpError(401, 'Kiosk is not activated on this device');
  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    throw new HttpError(401, 'Kiosk activation expired. Ask an admin to activate it again.');
  }
  if (!payload.kiosk) throw new HttpError(401, 'Not a kiosk token');
  const admin = await User.findOne({ _id: payload.by, role: 'admin', status: 'active' });
  if (!admin) throw new HttpError(401, 'The admin who activated this kiosk is no longer active');
  next();
});

function statusLabel(record) {
  const sessions = record?.sessions || [];
  if (sessions.some((s) => !isReg(s) && !s.out)) return ['OT running', 'ot'];
  const open = sessions.find((s) => isReg(s) && !s.out);
  if (open) return [`Working · ${shiftOf(open.shift)?.label || open.shift}`, 'in'];
  if (record?.status === 'Leave') return ['On leave', 'off'];
  if (record?.source === 'admin' && !sessions.length) return [`Marked ${record.status}`, 'off'];
  if (sessions.some(isReg)) return ['Clocked out', 'out'];
  return ['Not clocked in', 'none'];
}

// GET /api/kiosk/people
exports.people = asyncHandler(async (_req, res) => {
  const users = await User.find({ status: 'active' }).select('name employeeId department designation +pinHash').sort({ name: 1 });
  const records = await Attendance.find({ date: todayStr(), employee: { $in: users.map((u) => u._id) } });
  const byEmp = new Map(records.map((r) => [String(r.employee), r]));
  const people = users.map((u) => {
      const [label, tone] = statusLabel(byEmp.get(String(u._id)));
      return { _id: u._id, name: u.name, employeeId: u.employeeId, department: u.department, designation: u.designation, hasPin: !!u.pinHash, status: label, tone };
  });
  res.json(people);
});

async function verifyPin(userId, pin) {
  const f = failures.get(String(userId));
  if (f && f.until > Date.now()) {
    const mins = Math.ceil((f.until - Date.now()) / 60000);
    throw new HttpError(429, `Too many wrong PINs. Try again in ${mins} minute(s) or ask HR.`);
  }
  const user = await User.findOne({ _id: userId, status: 'active' }).select('+pinHash');
  if (!user) throw new HttpError(404, 'Person not found');
  if (!user.pinHash) throw new HttpError(400, 'No kiosk PIN set for you yet. Ask HR to set one.');
  if (!(await user.comparePin(pin))) {
    const count = (f && f.until <= Date.now() ? 0 : f?.count || 0) + 1;
    failures.set(String(userId), { count, until: count >= MAX_TRIES ? Date.now() + LOCK_MS : 0 });
    throw new HttpError(401, count >= MAX_TRIES ? 'Too many wrong PINs. Locked for 5 minutes.' : `Wrong PIN (${MAX_TRIES - count} tries left)`);
  }
  failures.delete(String(userId));
  return user;
}

// POST /api/kiosk/state { userId, pin }  -> person's day + available actions
exports.state = asyncHandler(async (req, res) => {
  const { userId, pin } = req.body || {};
  const user = await verifyPin(userId, pin);
  const state = await ops.todayState(user);
  res.json({ person: { _id: user._id, name: user.name, employeeId: user.employeeId, designation: user.designation }, ...state });
});

// POST /api/kiosk/action { userId, pin, op: 'clock-in'|'clock-out'|'ot-start'|'ot-stop' }
exports.action = asyncHandler(async (req, res) => {
  const { userId, pin, op } = req.body || {};
  const fn = { 'clock-in': ops.clockIn, 'clock-out': ops.clockOut, 'ot-start': ops.otStart, 'ot-stop': ops.otStop }[op];
  if (!fn) throw new HttpError(400, 'Unknown action');
  const user = await verifyPin(userId, pin);
  const message = await fn(user);
  res.json({ message, person: { name: user.name } });
});
