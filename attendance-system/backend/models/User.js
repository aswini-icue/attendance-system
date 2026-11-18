const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: [true, 'Name is required'], trim: true, maxlength: 100 },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email'],
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: [8, 'Password must be at least 8 characters'],
      select: false,
    },
    role: { type: String, enum: ['admin', 'employee'], default: 'employee' },
    employeeId: { type: String, trim: true, uppercase: true, unique: true, sparse: true },
    department: { type: String, trim: true, default: '' },
    designation: { type: String, trim: true, default: '' },
    phone: { type: String, trim: true, default: '' },
    joinDate: { type: String, default: '' }, // YYYY-MM-DD
    salary: { type: Number, min: 0, default: 0 }, // gross monthly salary (INR)
    pinHash: { type: String, select: false }, // 4-digit Attendance Kiosk PIN (bcrypt hash)
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
    lastLoginAt: Date,
  },
  { timestamps: true }
);

userSchema.index({ role: 1, status: 1, department: 1 });

userSchema.pre('save', async function hashPassword(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

userSchema.methods.comparePassword = function comparePassword(candidate) {
  return bcrypt.compare(candidate, this.password);
};

// Kiosk PIN: exactly 4 digits, stored hashed
userSchema.methods.setPin = async function setPin(pin) {
  if (!/^\d{4}$/.test(String(pin))) {
    const err = new Error('Kiosk PIN must be exactly 4 digits');
    err.status = 400;
    throw err;
  }
  this.pinHash = await bcrypt.hash(String(pin), 10);
};
userSchema.methods.comparePin = function comparePin(pin) {
  return this.pinHash ? bcrypt.compare(String(pin), this.pinHash) : Promise.resolve(false);
};

userSchema.set('toJSON', {
  transform(_doc, ret) {
    delete ret.password;
    ret.hasPin = !!ret.pinHash;
    delete ret.pinHash;
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model('User', userSchema);
