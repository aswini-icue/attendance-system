const User = require('../models/User');
const Attendance = require('../models/Attendance');
const Leave = require('../models/Leave');
const Holiday = require('../models/Holiday');
const asyncHandler = require('../utils/asyncHandler');
const { todayStr, addDays, eachDay, dayOfWeek } = require('../utils/time');

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// GET /api/dashboard
exports.summary = asyncHandler(async (_req, res) => {
  const today = todayStr();
  const weekStart = addDays(today, -6);

  const [employees, todayRecs, pendingLeaves, trendAgg, inactive, holiday] = await Promise.all([
    User.find({ role: 'employee', status: 'active' }).select('name employeeId department designation'),
    Attendance.find({ date: today }).populate('employee', 'name employeeId department designation status'),
    Leave.find({ status: 'Pending' }).sort({ createdAt: -1 }).limit(5).populate('employee', 'name employeeId department'),
    Attendance.aggregate([
      { $match: { date: { $gte: weekStart, $lte: today } } },
      { $group: { _id: { date: '$date', status: '$status' }, count: { $sum: 1 } } },
    ]),
    User.countDocuments({ role: 'employee', status: 'inactive' }),
    Holiday.findOne({ date: today }),
  ]);

  const activeIds = new Set(employees.map((e) => String(e._id)));
  const recs = todayRecs.filter((r) => r.employee && activeIds.has(String(r.employee._id)));

  const counts = { Present: 0, Late: 0, 'Half-day': 0, Absent: 0, Leave: 0 };
  recs.forEach((r) => {
    counts[r.status] += 1;
  });
  const total = employees.length;
  const notMarked = Math.max(0, total - recs.length);
  const attended = counts.Present + counts.Late + counts['Half-day'];

  // 7-day trend
  const trend = eachDay(weekStart, today).map((date) => ({
    date,
    label: `${DAY_NAMES[dayOfWeek(date)]} ${date.slice(8)}`,
    Present: 0,
    Late: 0,
    'Half-day': 0,
    Absent: 0,
    Leave: 0,
  }));
  const trendByDate = new Map(trend.map((t) => [t.date, t]));
  trendAgg.forEach(({ _id, count }) => {
    const row = trendByDate.get(_id.date);
    if (row) row[_id.status] = count;
  });

  // Department breakdown for today
  const deptMap = new Map();
  employees.forEach((e) => {
    const d = e.department || 'Unassigned';
    if (!deptMap.has(d)) deptMap.set(d, { department: d, total: 0, present: 0, absent: 0, leave: 0 });
    deptMap.get(d).total += 1;
  });
  recs.forEach((r) => {
    const d = deptMap.get(r.employee.department || 'Unassigned');
    if (!d) return;
    if (['Present', 'Late', 'Half-day'].includes(r.status)) d.present += 1;
    else if (r.status === 'Absent') d.absent += 1;
    else if (r.status === 'Leave') d.leave += 1;
  });

  const recentCheckIns = recs
    .filter((r) => r.checkIn)
    .sort((a, b) => b.checkIn - a.checkIn)
    .slice(0, 8)
    .map((r) => ({ id: r._id, employee: r.employee, status: r.status, checkIn: r.checkIn, checkOut: r.checkOut, working: r.sessions?.some((x) => !x.out) }));

  res.json({
    date: today,
    holiday: holiday?.name || null,
    totals: {
      employees: total,
      inactive,
      present: counts.Present,
      late: counts.Late,
      halfDay: counts['Half-day'],
      absent: counts.Absent,
      leave: counts.Leave,
      notMarked,
      workingNow: recs.filter((r) => r.sessions?.some((x) => !x.out)).length,
      attendanceRate: total ? Math.round((attended / total) * 1000) / 10 : 0,
      pendingLeaves: await Leave.countDocuments({ status: 'Pending' }),
    },
    trend,
    departments: [...deptMap.values()].sort((a, b) => b.total - a.total),
    recentCheckIns,
    pendingLeaves,
  });
});
