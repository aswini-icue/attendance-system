const User = require('../models/User');
const Attendance = require('../models/Attendance');
const Leave = require('../models/Leave');
const asyncHandler = require('../utils/asyncHandler');
const HttpError = require('../utils/httpError');
const { isValidDateStr } = require('../utils/time');

const EDITABLE = ['name', 'email', 'employeeId', 'department', 'designation', 'phone', 'joinDate', 'status', 'salary'];
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function pick(body) {
  const data = {};
  for (const key of EDITABLE) if (body[key] !== undefined) data[key] = typeof body[key] === 'string' ? body[key].trim() : body[key];
  if (data.joinDate && !isValidDateStr(data.joinDate)) throw new HttpError(400, 'Join date must be YYYY-MM-DD');
  if (data.salary !== undefined) {
    data.salary = Number(data.salary) || 0;
    if (data.salary < 0) throw new HttpError(400, 'Salary cannot be negative');
  }
  return data;
}

// GET /api/employees?q=&department=&status=&page=&limit=
exports.list = asyncHandler(async (req, res) => {
  const { q, department, status } = req.query;
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(1000, Math.max(1, parseInt(req.query.limit, 10) || 10));

  const filter = { role: 'employee' };
  if (department) filter.department = department;
  if (status) filter.status = status;
  if (q) {
    const rx = new RegExp(escapeRegex(String(q).trim()), 'i');
    filter.$or = [{ name: rx }, { email: rx }, { employeeId: rx }, { designation: rx }];
  }

  const [items, total] = await Promise.all([
    User.find(filter).sort({ name: 1 }).skip((page - 1) * limit).limit(limit),
    User.countDocuments(filter),
  ]);
  res.json({ items, total, page, pages: Math.ceil(total / limit) || 1 });
});

// GET /api/employees/departments
exports.departments = asyncHandler(async (_req, res) => {
  const list = await User.distinct('department', { role: 'employee', department: { $ne: '' } });
  res.json(list.sort());
});

// GET /api/employees/:id
exports.getOne = asyncHandler(async (req, res) => {
  const emp = await User.findOne({ _id: req.params.id, role: 'employee' });
  if (!emp) throw new HttpError(404, 'Employee not found');
  res.json(emp);
});

// POST /api/employees
exports.create = asyncHandler(async (req, res) => {
  const data = pick(req.body);
  if (!data.employeeId) throw new HttpError(400, 'Employee ID is required');
  if (!req.body.password) throw new HttpError(400, 'Password is required');
  const emp = new User({ ...data, password: String(req.body.password), role: 'employee' });
  await emp.setPin(req.body.pin || process.env.DEFAULT_KIOSK_PIN || '1234');
  await emp.save();
  res.status(201).json(emp);
});

// PUT /api/employees/:id
exports.update = asyncHandler(async (req, res) => {
  const emp = await User.findOne({ _id: req.params.id, role: 'employee' });
  if (!emp) throw new HttpError(404, 'Employee not found');
  Object.assign(emp, pick(req.body));
  if (req.body.password) emp.password = String(req.body.password); // optional reset
  if (req.body.pin) await emp.setPin(req.body.pin); // optional kiosk PIN change
  await emp.save();
  res.json(emp);
});

// DELETE /api/employees/:id  (also removes the employee's attendance & leave history)
exports.remove = asyncHandler(async (req, res) => {
  const emp = await User.findOneAndDelete({ _id: req.params.id, role: 'employee' });
  if (!emp) throw new HttpError(404, 'Employee not found');
  await Promise.all([Attendance.deleteMany({ employee: emp._id }), Leave.deleteMany({ employee: emp._id })]);
  res.json({ message: 'Employee deleted' });
});
