// Employee Dashboard (admin 360° view of one person):
// attendance rate by month, payroll history, leave balances, overtime, absences, document counts.
const User = require('../models/User');
const Attendance = require('../models/Attendance');
const Leave = require('../models/Leave');
const Document = require('../models/Document');
const asyncHandler = require('../utils/asyncHandler');
const HttpError = require('../utils/httpError');
const { buildPayslip } = require('./workspaceController');
const { workingDaysBetween } = require('../utils/calendar');
const { todayStr, monthRange, addDays } = require('../utils/time');

const allowance = () => ({
  vacation: Number(process.env.VACATION_DAYS_PER_YEAR || 18),
  sick: Number(process.env.SICK_DAYS_PER_YEAR || 9),
});

function lastMonths(n, fromYm) {
  const [y, m] = fromYm.split('-').map(Number);
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(y, m - 1 - (n - 1 - i), 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  });
}

async function findEmployee(id) {
  const e = await User.findOne({ _id: id, role: { $in: ['employee', 'admin'] } });
  if (!e) throw new HttpError(404, 'Employee not found');
  return e;
}

// GET /api/employees/:id/overview
exports.overview = asyncHandler(async (req, res) => {
  const e = await findEmployee(req.params.id);
  const today = todayStr();
  const ym = today.slice(0, 7);
  const months = lastMonths(12, ym);
  const year = today.slice(0, 4);

  // Attendance rate per month (share of recorded working days)
  const records = await Attendance.find({ employee: e._id, date: { $gte: `${months[0]}-01`, $lte: today } })
    .select('date status otMinutes')
    .lean();
  const rates = months.map((m) => {
    const rs = records.filter((r) => r.date.startsWith(m));
    const on = rs.filter((r) => r.status === 'Present').length;
    const late = rs.filter((r) => r.status === 'Late' || r.status === 'Half-day').length;
    const absent = rs.filter((r) => r.status === 'Absent').length;
    const total = on + late + absent;
    const pct = (n) => (total ? Math.round((n / total) * 1000) / 10 : 0);
    return { month: m, onTime: pct(on), late: pct(late), absent: pct(absent), days: total };
  });

  // Leave balances (calendar year) from approved / pending leave requests
  const leaves = await Leave.find({ employee: e._id, status: { $in: ['Approved', 'Pending'] }, toDate: { $gte: `${year}-01-01` } }).lean();
  let vacUsed = 0;
  let sickUsed = 0;
  let vacSched = 0;
  let sickSched = 0;
  for (const l of leaves) {
    const from = l.fromDate < `${year}-01-01` ? `${year}-01-01` : l.fromDate;
    const past = l.status === 'Approved' && from <= today ? (await workingDaysBetween(from, l.toDate < today ? l.toDate : today)).length : 0;
    const future = l.toDate > today ? (await workingDaysBetween(from > today ? from : addDays(today, 1), l.toDate)).length : 0;
    if (l.leaveType === 'Sick') {
      sickUsed += past;
      sickSched += future;
    } else {
      vacUsed += past;
      vacSched += future;
    }
  }
  const a = allowance();
  const yearRecs = records.filter((r) => r.date.startsWith(year));

  // Payroll: last 12 months since joining (net pay from the salary-slip rules)
  const joinYm = (e.joinDate || '1970-01').slice(0, 7);
  const payMonths = months.filter((m) => m >= joinYm).reverse();
  const payroll = [];
  for (const m of payMonths) {
    const p = await buildPayslip(e, m);
    payroll.push({ month: m, label: `${p.monthLabel} salary`, payDate: m === ym ? null : monthRange(m).to, amount: p.netPay, status: m === ym ? 'Pending' : 'Paid' });
  }

  const docCounts = await Document.aggregate([{ $match: { employee: e._id } }, { $group: { _id: '$folder', count: { $sum: 1 } } }]);

  res.json({
    employee: e,
    rates,
    payroll,
    balances: {
      vacationHours: Math.max(0, a.vacation - vacUsed) * 8,
      vacationScheduledHours: vacSched * 8,
      vacationUsedDays: vacUsed,
      sickHours: Math.max(0, a.sick - sickUsed) * 8,
      sickScheduledHours: sickSched * 8,
      sickUsedDays: sickUsed,
      allowance: a,
      absencesThisYear: yearRecs.filter((r) => r.status === 'Absent').length,
      otMinutesThisMonth: yearRecs.filter((r) => r.date.startsWith(ym)).reduce((s, r) => s + (r.otMinutes || 0), 0),
      otMinutesThisYear: yearRecs.reduce((s, r) => s + (r.otMinutes || 0), 0),
    },
    documents: Object.fromEntries(docCounts.map((d) => [d._id, d.count])),
  });
});

// GET /api/employees/:id/payslip?month=YYYY-MM
exports.payslip = asyncHandler(async (req, res) => {
  const e = await findEmployee(req.params.id);
  res.json(await buildPayslip(e, req.query.month || todayStr().slice(0, 7)));
});
