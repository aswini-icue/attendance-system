// Background job: every minute, close sessions whose shift has ended and
// re-evaluate recent statuses (e.g. a missed afternoon shift => Half-day).
const Attendance = require('../models/Attendance');
const { holidayMap } = require('./calendar');
const { syncRecord } = require('./attendanceRules');
const { todayStr, addDays, isWeeklyOff } = require('./time');

async function runAutoClockOut() {
  const now = new Date();
  const since = addDays(todayStr(), -1);
  const records = await Attendance.find({
    $or: [{ sessions: { $elemMatch: { out: null } } }, { date: { $gte: since }, source: 'self' }],
  });
  const holidays = await holidayMap(since, todayStr());
  let updated = 0;
  for (const rec of records) {
    if (syncRecord(rec, now, { dayOff: holidays.has(rec.date) || isWeeklyOff(rec.date) })) {
      await rec.save();
      updated += 1;
    }
  }
  return updated;
}

function startAutoClockOut(intervalMs = 60 * 1000) {
  const tick = () =>
    runAutoClockOut()
      .then((n) => n && console.log(`[auto clock-out] updated ${n} record(s)`))
      .catch((err) => console.error('[auto clock-out] failed:', err.message));
  tick();
  return setInterval(tick, intervalMs);
}

module.exports = { runAutoClockOut, startAutoClockOut };
