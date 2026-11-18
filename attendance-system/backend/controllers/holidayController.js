const Holiday = require('../models/Holiday');
const asyncHandler = require('../utils/asyncHandler');
const HttpError = require('../utils/httpError');
const { isValidDateStr } = require('../utils/time');

// GET /api/holidays?year=2026
exports.list = asyncHandler(async (req, res) => {
  const year = /^\d{4}$/.test(req.query.year || '') ? req.query.year : String(new Date().getFullYear());
  const items = await Holiday.find({ date: { $gte: `${year}-01-01`, $lte: `${year}-12-31` } }).sort({ date: 1 });
  res.json(items);
});

// POST /api/holidays { date, name }  (admin)
exports.create = asyncHandler(async (req, res) => {
  const { date, name } = req.body || {};
  if (!isValidDateStr(date)) throw new HttpError(400, 'Date must be YYYY-MM-DD');
  if (!name || !String(name).trim()) throw new HttpError(400, 'Holiday name is required');
  res.status(201).json(await Holiday.create({ date, name: String(name).trim() }));
});

// DELETE /api/holidays/:id  (admin)
exports.remove = asyncHandler(async (req, res) => {
  const h = await Holiday.findByIdAndDelete(req.params.id);
  if (!h) throw new HttpError(404, 'Holiday not found');
  res.json({ message: 'Holiday removed' });
});
