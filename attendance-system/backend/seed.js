// Optional demo data: `npm run seed`
// Creates the admin (if missing), 12 sample employees, holidays and ~40 days of
// shift-based attendance history (morning 09:00-13:00, afternoon 15:00-19:00).
require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('./config/db');
const ensureAdmin = require('./utils/ensureAdmin');
const User = require('./models/User');
const Attendance = require('./models/Attendance');
const Leave = require('./models/Leave');
const Holiday = require('./models/Holiday');
const { todayStr, addDays, isWeeklyOff, zonedTimeToUtc } = require('./utils/time');
const { syncRecord } = require('./utils/attendanceRules');

const SAMPLE = [
  ['EMP001', 'Priya Sharma', 'Engineering', 'Site Engineer', 13000],
  ['EMP002', 'Rahul Verma', 'Engineering', 'Frontend Developer', 42000],
  ['EMP003', 'Anjali Nair', 'Human Resources', 'HR Executive', 28000],
  ['EMP004', 'Karthik Reddy', 'Sales', 'Sales Manager', 55000],
  ['EMP005', 'Sneha Iyer', 'Finance', 'Accountant', 32000],
  ['EMP006', 'Arjun Patel', 'Engineering', 'QA Engineer', 36000],
  ['EMP007', 'Divya Menon', 'Marketing', 'Marketing Lead', 48000],
  ['EMP008', 'Vikram Singh', 'Operations', 'Site Supervisor', 26000],
  ['EMP009', 'Meera Pillai', 'Sales', 'Sales Executive', 24000],
  ['EMP010', 'Rohan Gupta', 'Finance', 'Financial Analyst', 39000],
  ['EMP011', 'Kavya Rao', 'Marketing', 'Content Strategist', 30000],
  ['EMP012', 'Suresh Kumar', 'Operations', 'Logistics Coordinator', 22000],
];

// Edit these to your company's holiday calendar (or manage them from the Holidays page)
const HOLIDAYS = [
  ['2026-01-26', 'Republic Day'],
  ['2026-08-15', 'Independence Day'],
  ['2026-10-02', 'Gandhi Jayanti'],
  ['2026-11-24', 'Guru Tegh Bahadur Martyrdom Day'],
  ['2026-12-25', 'Christmas'],
  ['2027-01-26', 'Republic Day'],
];

const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const hhmm = (mins) => `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;

(async () => {
  await connectDB();
  await ensureAdmin();

  for (const [date, name] of HOLIDAYS) {
    await Holiday.updateOne({ date }, { $setOnInsert: { date, name } }, { upsert: true });
  }
  const holidaySet = new Set((await Holiday.find().lean()).map((h) => h.date));
  console.log(`Holidays ready (${holidaySet.size})`);

  const employees = [];
  for (const [employeeId, name, department, designation, salary] of SAMPLE) {
    let emp = await User.findOne({ employeeId });
    if (!emp) {
      emp = new User({
        employeeId,
        name,
        department,
        designation,
        salary,
        email: `${name.split(' ')[0].toLowerCase()}@company.com`,
        password: 'Employee@123',
        phone: `98${rand(10000000, 99999999)}`,
        joinDate: '2024-01-15',
      });
      await emp.setPin(process.env.DEFAULT_KIOSK_PIN || '1234');
      await emp.save();
      console.log(`Created employee ${employeeId} ${name}`);
    }
    employees.push(emp);
  }

  const today = todayStr();
  const docs = [];
  for (let i = 40; i >= 1; i -= 1) {
    const date = addDays(today, -i);
    if (isWeeklyOff(date) || holidaySet.has(date)) continue;
    for (const emp of employees) {
      const roll = Math.random();
      if (roll < 0.04) {
        docs.push({ employee: emp._id, date, status: 'Absent', source: 'system' });
        continue;
      }
      if (roll < 0.08) {
        docs.push({ employee: emp._id, date, status: 'Leave', source: 'system', remarks: 'Casual leave' });
        continue;
      }
      const at = (t) => zonedTimeToUtc(date, t);
      const sessions = [{ shift: 'morning', in: at(hhmm(rand(535, 562))), out: at('13:00'), auto: true }];
      if (roll >= 0.13) {
        const s = { shift: 'afternoon', in: at(hhmm(rand(895, 911))), out: at('19:00'), auto: true };
        if (roll > 0.93) Object.assign(s, { out: at(hhmm(rand(1170, 1235))), auto: false, manual: true, reason: 'Worked extra time (overtime)' });
        sessions.push(s);
      }
      if (roll > 0.97) sessions.push({ shift: 'ot', in: at('20:40'), out: at(hhmm(rand(1260, 1290))) }); // evening overtime
      const rec = { employee: emp._id, date, sessions, source: 'self', status: 'Present' };
      syncRecord(rec, new Date());
      docs.push(rec);
    }
  }

  try {
    const res = await Attendance.insertMany(docs, { ordered: false });
    console.log(`Inserted ${res.length} attendance records`);
  } catch (err) {
    console.log(`Inserted ${err.insertedDocs?.length ?? 0} attendance records (existing days skipped)`);
  }

  if (!(await Leave.exists({}))) {
    await Leave.create([
      { employee: employees[1]._id, leaveType: 'Sick', fromDate: addDays(today, 2), toDate: addDays(today, 3), days: 2, reason: 'Medical appointment and recovery' },
      { employee: employees[4]._id, leaveType: 'Casual', fromDate: addDays(today, 7), toDate: addDays(today, 7), days: 1, reason: 'Family function' },
    ]);
    console.log('Created sample leave requests');
  }

  console.log('\nSeed complete. Employee login example: priya@company.com / Employee@123 · Kiosk PIN for everyone: 1234');
  await mongoose.disconnect();
})().catch(async (err) => {
  console.error(err);
  await mongoose.disconnect();
  process.exit(1);
});
