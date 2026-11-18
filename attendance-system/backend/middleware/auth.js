const jwt = require('jsonwebtoken');
const User = require('../models/User');
const asyncHandler = require('../utils/asyncHandler');
const HttpError = require('../utils/httpError');

const protect = asyncHandler(async (req, _res, next) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) throw new HttpError(401, 'Not authenticated');

  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    throw new HttpError(401, 'Session expired. Please log in again.');
  }

  const user = await User.findById(payload.id);
  if (!user || user.status !== 'active') throw new HttpError(401, 'Account not found or inactive');
  req.user = user;
  next();
});

const authorize = (...roles) => (req, _res, next) => {
  if (!roles.includes(req.user.role)) return next(new HttpError(403, 'You do not have permission for this action'));
  next();
};

module.exports = { protect, authorize };
