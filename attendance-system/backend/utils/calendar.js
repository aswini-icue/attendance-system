// Holiday-aware calendar helpers (holidays live in MongoDB)
const Holiday = require('../models/Holiday');
const { eachDay, isWeeklyOff } = require('./time');

async function holidayMap(from, to) {
  const list = await Holiday.find({ date: { $gte: from, $lte: to } }).lean();
  return new Map(list.map((h) => [h.date, h.name]));
}

async function workingDaysBetween(from, to) {
  if (to < from) return [];
  const holidays = await holidayMap(from, to);
  return eachDay(from, to).filter((d) => !isWeeklyOff(d) && !holidays.has(d));
}

module.exports = { holidayMap, workingDaysBetween };
