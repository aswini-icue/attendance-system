const jwt = require('jsonwebtoken');
const User = require('../models/User');
const asyncHandler = require('../utils/asyncHandler');
const HttpError = require('../utils/httpError');
const { getSettings } = require('../config/settings');

const signToken = (user) =>
  jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '8h',
  });

// POST /api/auth/login
exports.login = asyncHandler(async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) throw new HttpError(400, 'Email and password are required');

  const user = await User.findOne({ email: String(email).toLowerCase().trim() }).select('+password');
  // Same message for unknown email / wrong password to avoid user enumeration
  if (!user || !(await user.comparePassword(String(password)))) {
    throw new HttpError(401, 'Invalid email or password');
  }
  if (user.status !== 'active') throw new HttpError(403, 'Your account is inactive. Contact the administrator.');

  user.lastLoginAt = new Date();
  await user.save({ validateBeforeSave: false });

  res.json({ token: signToken(user), user: user.toJSON(), settings: getSettings() });
});

// GET /api/auth/me
exports.me = asyncHandler(async (req, res) => {
  res.json({ user: req.user, settings: getSettings() });
});

// PUT /api/auth/password
exports.changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword) throw new HttpError(400, 'Both current and new password are required');
  if (String(newPassword).length < 8) throw new HttpError(400, 'New password must be at least 8 characters');

  const user = await User.findById(req.user._id).select('+password');
  if (!(await user.comparePassword(String(currentPassword)))) throw new HttpError(400, 'Current password is incorrect');

  user.password = String(newPassword);
  await user.save();
  res.json({ message: 'Password updated successfully' });
});
