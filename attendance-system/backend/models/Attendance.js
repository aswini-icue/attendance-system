const mongoose = require('mongoose');
const { STATUSES } = require('../utils/attendanceRules');

// One clock-in/clock-out pair inside a shift
const sessionSchema = new mongoose.Schema(
  {
    shift: { type: String, required: true }, // 'morning' | 'afternoon'
    in: { type: Date, required: true },
    out: { type: Date, default: null },
    auto: { type: Boolean, default: false }, // closed automatically at shift end
    manual: { type: Boolean, default: false }, // out time entered via OT (Out Time)
    reason: { type: String, trim: true, maxlength: 100, default: '' },
    note: { type: String, trim: true, maxlength: 200, default: '' },
  },
  { _id: false }
);

const attendanceSchema = new mongoose.Schema(
  {
    employee: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    date: { type: String, required: true }, // YYYY-MM-DD in company timezone
    status: { type: String, enum: STATUSES, required: true },
    sessions: { type: [sessionSchema], default: [] },
    checkIn: { type: Date, default: null }, // first clock-in of the day
    checkOut: { type: Date, default: null }, // last clock-out of the day
    workMinutes: { type: Number, default: 0 },
    otMinutes: { type: Number, default: 0 }, // time worked beyond shift end
    autoHalf: { type: Boolean, default: false }, // Half-day set automatically (missed a shift)
    remarks: { type: String, trim: true, maxlength: 300, default: '' },
    source: { type: String, enum: ['self', 'admin', 'leave', 'system'], default: 'self' },
    markedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

// One attendance record per employee per day
attendanceSchema.index({ employee: 1, date: 1 }, { unique: true });
attendanceSchema.index({ date: 1, status: 1 });
attendanceSchema.index({ 'sessions.out': 1 });

module.exports = mongoose.model('Attendance', attendanceSchema);
