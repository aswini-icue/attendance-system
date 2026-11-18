const mongoose = require('mongoose');

const LEAVE_TYPES = ['Casual', 'Sick', 'Earned', 'Unpaid', 'Other'];

const leaveSchema = new mongoose.Schema(
  {
    employee: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    leaveType: { type: String, enum: LEAVE_TYPES, required: true },
    fromDate: { type: String, required: true }, // YYYY-MM-DD
    toDate: { type: String, required: true },
    days: { type: Number, required: true },
    reason: { type: String, trim: true, required: [true, 'Reason is required'], maxlength: 500 },
    status: { type: String, enum: ['Pending', 'Approved', 'Rejected', 'Cancelled'], default: 'Pending' },
    adminComment: { type: String, trim: true, maxlength: 300, default: '' },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    reviewedAt: Date,
  },
  { timestamps: true }
);

leaveSchema.index({ employee: 1, status: 1, fromDate: 1 });

module.exports = mongoose.model('Leave', leaveSchema);
module.exports.LEAVE_TYPES = LEAVE_TYPES;
