function notFound(req, res) {
  res.status(404).json({ message: `Route not found: ${req.method} ${req.originalUrl}` });
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, _req, res, _next) {
  let status = err.status || 500;
  let message = err.message || 'Server error';

  if (err.code === 11000) {
    status = 409;
    const field = Object.keys(err.keyValue || {})[0] || 'field';
    message = `A record with this ${field} already exists`;
  } else if (err.name === 'ValidationError') {
    status = 400;
    message = Object.values(err.errors).map((e) => e.message).join(', ');
  } else if (err.name === 'MulterError') {
    status = 400;
    message = err.code === 'LIMIT_FILE_SIZE' ? 'File is larger than 5 MB' : err.message;
  } else if (err.name === 'CastError') {
    status = 400;
    message = `Invalid ${err.path}`;
  }

  if (status >= 500) console.error(err);
  res.status(status).json({
    message: status >= 500 && process.env.NODE_ENV === 'production' ? 'Server error' : message,
  });
}

module.exports = { notFound, errorHandler };
