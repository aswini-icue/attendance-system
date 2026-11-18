require('dotenv').config();

const path = require('path');
const fs = require('fs');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const connectDB = require('./config/db');
const ensureAdmin = require('./utils/ensureAdmin');
const { startAutoClockOut } = require('./utils/autoClockOut');
const routes = require('./routes');
const { notFound, errorHandler } = require('./middleware/error');

if (!process.env.MONGO_URI || !process.env.JWT_SECRET) {
  console.error('MONGO_URI and JWT_SECRET must be set in backend/.env (see .env.example)');
  process.exit(1);
}

const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');

app.use(helmet());
app.use(
  cors({
    origin: (process.env.CLIENT_URL || 'http://localhost:5173').split(',').map((s) => s.trim()),
    exposedHeaders: ['Content-Disposition'],
  })
);
app.use(express.json({ limit: '1mb' }));
if (process.env.NODE_ENV !== 'production') app.use(morgan('dev'));

// Brute-force protection on login + general API rate limit
app.use(
  '/api/auth/login',
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    message: { message: 'Too many failed login attempts. Please try again in 15 minutes.' },
  })
);
app.use('/api/kiosk/activate', rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false, message: { message: 'Too many activation attempts. Try again later.' } }));
app.use('/api', rateLimit({ windowMs: 60 * 1000, limit: 300, standardHeaders: true, legacyHeaders: false }));

app.get('/api/health', (_req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));
app.use('/api', routes);

// In production, serve the built React app from ../frontend/dist
const clientDist = path.join(__dirname, '..', 'frontend', 'dist');
if (process.env.NODE_ENV === 'production' && fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get(/^\/(?!api).*/, (_req, res) => res.sendFile(path.join(clientDist, 'index.html')));
}

app.use('/api', notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

connectDB()
  .then(ensureAdmin)
  .then(() => {
    app.listen(PORT, () => console.log(`API running on http://localhost:${PORT}`));
    // Closes open shift sessions at shift end, every minute
    startAutoClockOut();
  })
  .catch((err) => {
    console.error('Failed to start server:', err.message);
    process.exit(1);
  });
