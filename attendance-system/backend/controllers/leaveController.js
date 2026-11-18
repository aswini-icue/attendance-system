const Leave = require('../models/Leave');
const Attendance = require('../models/Attendance');
const asyncHandler = require('../utils/asyncHandler');
const HttpError = require('../utils/httpError');
const { LEAVE_TYPES } = require('../models/Leave');
const { isValidDateStr } = require('../utils/time');
const { workingDaysBetween } = require('../utils/calendar');

// POST /api/leaves  (employee)
exports.apply = asyncHandler(async (req, res) => {
  const { leaveType, fromDate, toDate, reason } = req.body || {};
  if (!LEAVE_TYPES.includes(leaveType)) throw new HttpError(400, 'Invalid leave type');
  if (!isValidDateStr(fromDate) || !isValidDateStr(toDate)) throw new HttpError(400, 'Invalid dates');
  if (toDate < fromDate) throw new HttpError(400, 'End date cannot be before start date');
  if (!reason || !String(reason).trim()) throw new HttpError(400, 'Please provide a reason');

  const days = (await workingDaysBetween(fromDate, toDate)).length;
  if (days === 0) throw new HttpError(400, 'Selected range has no working days');
  if (days > 60) throw new HttpError(400, 'Leave request cannot exceed 60 working days');

  const overlap = await Leave.exists({
    employee: req.user._id,
    status: { $in: ['Pending', 'Approved'] },
    fromDate: { $lte: toDate },
    toDate: { $gte: fromDate },
  });
  if (overlap) throw new HttpError(409, 'You already have a leave request overlapping these dates');

  const leave = await Leave.create({ employee: req.user._id, leaveType, fromDate, toDate, days, reason });
  res.status(201).json(leave);
});

// GET /api/leaves/me
exports.mine = asyncHandler(async (req, res) => {
  const leaves = await Leave.find({ employee: req.user._id }).sort({ createdAt: -1 }).populate('reviewedBy', 'name');
  const used = leaves.filter((l) => l.status === 'Approved').reduce((sum, l) => sum + l.days, 0);
  res.json({ items: leaves, approvedDays: used });
});

// DELETE /api/leaves/:id  (employee cancels own pending request)
exports.cancel = asyncHandler(async (req, res) => {
  const leave = await Leave.findOne({ _id: req.params.id, employee: req.user._id });
  if (!leave) throw new HttpError(404, 'Leave request not found');
  if (leave.status !== 'Pending') throw new HttpError(400, 'Only pending requests can be cancelled');
  leave.status = 'Cancelled';
  await leave.save();
  res.json({ message: 'Leave request cancelled' });
});

// GET /api/leaves?status=Pending  (admin)
exports.list = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.status && req.query.status !== 'All') filter.status = req.query.status;
  if (req.query.employee) filter.employee = req.query.employee;
  const items = await Leave.find(filter)
    .sort({ status: 1, createdAt: -1 })
    .limit(500)
    .populate('employee', 'name employeeId department designation')
    .populate('reviewedBy', 'name');
  const pending = await Leave.countDocuments({ status: 'Pending' });
  res.json({ items, pending });
});

// PATCH /api/leaves/:id/review { status: 'Approved'|'Rejected', adminComment }  (admin)
exports.review = asyncHandler(async (req, res) => {
  const { status, adminComment = '' } = req.body || {};
  if (!['Approved', 'Rejected'].includes(status)) throw new HttpError(400, 'Status must be Approved or Rejected');

  const leave = await Leave.findById(req.params.id);
  if (!leave) throw new HttpError(404, 'Leave request not found');
  if (leave.status !== 'Pending') throw new HttpError(400, `This request is already ${leave.status.toLowerCase()}`);

  leave.status = status;
  leave.adminComment = String(adminComment).slice(0, 300);
  leave.reviewedBy = req.user._id;
  leave.reviewedAt = new Date();
  await leave.save();

  // Approved leave is written into the attendance register (except days the employee actually worked)
  if (status === 'Approved') {
    const days = await workingDaysBetween(leave.fromDate, leave.toDate);
    const worked = await Attendance.find({
      employee: leave.employee,
      date: { $in: days },
      checkIn: { $ne: null },
    }).distinct('date');
    const workedSet = new Set(worked);
    const ops = days
      .filter((d) => !workedSet.has(d))
      .map((date) => ({
        updateOne: {
          filter: { employee: leave.employee, date },
          update: {
            $set: {
              status: 'Leave',
              sessions: [],
              otMinutes: 0,
              autoHalf: false,
              checkIn: null,
              checkOut: null,
              workMinutes: 0,
              remarks: `${leave.leaveType} leave`,
              source: 'leave',
              markedBy: req.user._id,
            },
          },
          upsert: true,
        },
      }));
    if (ops.length) await Attendance.bulkWrite(ops, { ordered: false });
  }

  res.json({ message: `Leave ${status.toLowerCase()}`, leave });
});
