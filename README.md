# AttendPro: Employee Attendance Management System

A full-stack attendance system built with **React (Vite)**, **Node.js + Express**, and **MongoDB Atlas**.

## Features

| Area | What it does |
|---|---|
| **Secure login** | JWT auth, bcrypt (12 rounds) password hashing, login rate-limiting (10 failed tries / 15 min), Helmet security headers, role-based access (admin / employee) |
| **Employee management** | Add, edit, deactivate, delete. Search, filter by department or status, pagination, password reset |
| **My Workspace** (everyone) | Summary cards (days worked, leave taken, leave pending, net monthly pay) and tabs for **My Attendance, My Timesheet, My Leave and My Salary Slip** |
| **Shifts + auto clock-out** | Morning (09:00–13:00) and afternoon (15:00–19:00) shifts. Clock-in opens 30 min before each shift, with a live "time left in shift" countdown. A background job **clocks people out automatically at shift end** |
| **OT button** (next to Clock In / Out) | **Start OT / Stop OT** runs a separate overtime timer (outside shift hours, or any time on holidays, weekly offs and leave days). **Record out time** sets the real out time of a shift: later than the shift end counts as overtime |
| **Attendance Kiosk** | A shared tablet or PC at the entrance. An admin activates the device once; then **each person taps their name and enters their own 4-digit PIN** to clock in, clock out or start/stop OT. PINs are stored hashed, and 5 wrong PINs lock that person out for 5 minutes |
| **Employee Dashboard** (admin) | A view of one employee at a time: monthly Attendance Rate chart (on time / late / absent), Recent Payroll with Paid / Pending and salary slips, Documents with real file upload and download (stored in MongoDB, max 5 MB), and Vacation, Sick, Overtime and Absences tiles. "Next employee" moves through the team |
| **OT (Out Time)** | An employee records the time they actually stopped working. Later than the shift end counts as **overtime**; earlier records leaving early; it also fixes a forgotten clock-out. Each entry needs a reason and can carry a note |
| **Team Timesheets** (admin) | Every employee's morning and afternoon in/out times, hours, OT and live "Working" status for any date |
| **Holidays** (admin) | A holiday calendar that working-day counts, leave days and salary use |
| **Salary slip** | Earnings (Basic, HRA, Conveyance, Special), deductions (Loss of Pay, Professional Tax) and net pay, with a PDF download |
| **Daily attendance register** | Admin marks any date with one-click status pills, check-in/out times, remarks, bulk "unmarked → Present/Absent" |
| **Statuses** | Present, Absent, Late, Half-day, Leave. Late and Half-day are calculated automatically from office rules |
| **Check-in / check-out** | Employees get a live clock with one-tap check-in/out, a live worked-hours counter and monthly history |
| **Leave management** | Employees apply or cancel. Admin approves or rejects with a comment. Approved leave is written into the register automatically |
| **Reports** | Daily, weekly, monthly and custom range. Filter by department or employee. Shows a per-employee summary with attendance % and day-wise details |
| **Export** | Styled **Excel** (Summary + Details sheets, colour-coded) and **PDF** (landscape, branded header, page numbers) |
| **Dashboard** | KPI cards, a 7-day stacked trend chart, today's status donut, a department breakdown, recent check-ins and pending leaves |

## Attendance rules (configurable in `backend/.env`)

- **Shifts**: `MORNING_SHIFT_START/END` (09:00–13:00) and `AFTERNOON_SHIFT_START/END` (15:00–19:00). Expected day = `EXPECTED_DAILY_HOURS` (8)
- **Clock-in window** opens `CLOCK_IN_OPENS_MINUTES_BEFORE` (30) minutes before each shift and closes at shift end
- **Auto clock-out**: any open session is closed at its shift end, checked every minute by the server
- **Late**: first clock-in after shift start + `LATE_GRACE_MINUTES` (15)
- **Half Day (set automatically)**: one of the two shifts was missed
- **Overtime** = time after a shift's end (via Record out time) + every minute of a Start OT / Stop OT timer. An open OT timer closes automatically at 23:59
- **Overtime-only day**: Present on holidays and weekly offs. On a working day where both shifts were missed, it is Absent
- **Weekly off**: `WEEKLY_OFF_DAYS` (default `0` = Sunday). Weekly offs and **holidays** are skipped in leave counts, reports and salary
- **Loss of pay** = absent days + unpaid leave + ½ per half day. Per-day rate = monthly salary ÷ working days in the month
- **Timezone**: all "days" use `TIMEZONE` (default `Asia/Kolkata`), so dates never shift because of UTC

## Project structure

```
attendance-system/
├── backend/
│   ├── config/        db.js, settings.js
│   ├── controllers/   auth, employee, attendance, leave, report, dashboard, workspace, holiday
│   ├── middleware/    auth.js (JWT + roles), error.js
│   ├── models/        User, Attendance (with shift sessions), Leave, Holiday
│   ├── routes/        index.js (all API routes)
│   ├── utils/         time helpers, shift rules, auto clock-out job, holiday calendar
│   ├── seed.js        optional demo data
│   └── server.js
└── frontend/
    └── src/
        ├── api/         axios client + file download helper
        ├── context/     AuthContext
        ├── components/  Layout, ProtectedRoute, UI kit,
        │   └── workspace/   AttendanceTab, TimesheetTab, LeaveTab, SalaryTab, OutTimeModal
        ├── pages/       Login, Workspace, Dashboard, Employees, AttendanceRegister,
        │                TeamTimesheets, Leaves, Holidays, Reports, Profile
        └── styles.css
```

## Setup

### 1. MongoDB Atlas
1. Create a free cluster at <https://cloud.mongodb.com>.
2. **Database Access**: add a database user.
3. **Network Access**: add your IP (or `0.0.0.0/0` for testing).
4. **Connect → Drivers**: copy the connection string.

### 2. Backend
```bash
cd backend
cp .env.example .env        # then edit MONGO_URI, JWT_SECRET, ADMIN_EMAIL, ADMIN_PASSWORD
npm install
npm run seed                # optional: 12 demo employees, holidays + 40 days of shift attendance
npm run dev                 # API on http://localhost:5000
```
The first admin account is created automatically from `ADMIN_EMAIL` / `ADMIN_PASSWORD` the first time the server starts.

Generate a strong JWT secret:
```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

### 3. Frontend
```bash
cd frontend
cp .env.example .env
npm install
npm run dev                 # http://localhost:5173 (proxies /api to :5000)
```

### Attendance Kiosk
1. On the shared tablet or PC, open `http://<your-site>/kiosk` (or press **Open Attendance Kiosk** on the login page).
2. An admin enters their email and password **once** to activate the device.
3. From then on, each employee taps their name and enters their **own 4-digit PIN**. Set or change a person's PIN on **Employees → Edit → Kiosk PIN**. New employees get `DEFAULT_KIOSK_PIN` (1234) until HR changes it.

### Logins
- **Admin**: the `ADMIN_EMAIL` / `ADMIN_PASSWORD` from `.env` (default `admin@company.com` / `Admin@12345`). **Change this after the first login.**
- **Demo employees** (after seeding): `firstname@company.com` / `Employee@123` (for example `priya@company.com`). Kiosk PIN for everyone: `1234`

## API reference

All routes are prefixed with `/api`. 🔒 = any logged-in user (employees and admins), 👑 = admin only.

| Method | Route | Access | Purpose |
|---|---|---|---|
| POST | `/auth/login` | public | Log in and get a JWT |
| GET | `/auth/me` | 🔒 | Current user + attendance settings |
| PUT | `/auth/password` | 🔒 | Change password |
| GET | `/dashboard` | 👑 | Dashboard stats |
| GET/POST | `/employees` | 👑 | List (q, department, status, page, limit) / create |
| GET/PUT/DELETE | `/employees/:id` | 👑 | Read / update / delete |
| GET | `/employees/departments` | 👑 | Department list |
| GET | `/workspace/summary` | 🔒 | Workspace summary cards |
| GET | `/workspace/payslip?month=` · `/workspace/payslip/pdf?month=` | 🔒 | Salary slip (JSON / PDF) |
| GET | `/attendance/today` | 🔒 | Today's record, shift phase, shift times |
| POST | `/attendance/clock-in` · `/attendance/clock-out` | 🔒 | Clock in or out for the current shift |
| POST | `/attendance/out-time` | 🔒 | **OT (Out Time)** `{shift, time:'HH:mm', reason, note}` |
| POST | `/attendance/ot/start` · `/attendance/ot/stop` | 🔒 | Start / stop the overtime timer |
| GET | `/attendance/me?month=` or `?from=&to=` | 🔒 | Own history plus holidays |
| GET | `/attendance/employee/:id?month=` | 👑 | One employee's month |
| GET | `/employees/:id/overview` · `/employees/:id/payslip?month=` | 👑 | Employee Dashboard data / salary slip |
| GET · POST | `/employees/:id/documents` | 👑 | List / upload (multipart `file`, `folder`) |
| GET · DELETE | `/documents/:id/download` · `/documents/:id` | 👑 | Download / delete a document |
| POST | `/kiosk/activate` | public (admin credentials) | Activate a device as a kiosk and return a kiosk token |
| GET · POST | `/kiosk/people` · `/kiosk/state` · `/kiosk/action` | 🖥 kiosk token + PIN | Kiosk list, a person's day, and clock-in / clock-out / ot-start / ot-stop |
| GET | `/attendance/team?date=` | 👑 | Team timesheet for a day |
| GET | `/attendance/register?date=` | 👑 | Register for a date |
| POST | `/attendance/bulk` | 👑 | Save the register `{date, records[]}` |
| POST | `/attendance/mark-absent` | 👑 | Mark all unmarked employees Absent |
| DELETE | `/attendance/:id` | 👑 | Delete a record |
| POST | `/leaves` · GET `/leaves/me` · DELETE `/leaves/:id` | 🔒 | Apply / list own / cancel pending |
| GET | `/holidays?year=` | 🔒 | Holiday list |
| POST · DELETE | `/holidays` · `/holidays/:id` | 👑 | Add / remove a holiday |
| GET | `/leaves?status=` | 👑 | All requests |
| PATCH | `/leaves/:id/review` | 👑 | Approve or reject |
| GET | `/reports?type=daily\|weekly\|monthly\|custom` | 👑 | Report JSON (`date`, `month`, `from`, `to`, `department`, `employee`) |
| GET | `/reports/export/excel` · `/export/pdf` | 👑 | Download (same query params) |

## Production deployment

**Option A: single server.** Build the frontend and let Express serve it:
```bash
cd frontend && npm run build
cd ../backend && NODE_ENV=production npm start
```

**Option B: separate hosts** (for example Vercel/Netlify for the frontend and Render/Railway for the API):
- Frontend: set `VITE_API_URL=https://your-api.example.com/api`
- Backend: set `CLIENT_URL=https://your-frontend.example.com`
- For SPA hosting, add a rewrite of all routes to `/index.html`.

### Security checklist
- [ ] Strong, unique `JWT_SECRET`
- [ ] Change the default admin password
- [ ] Restrict Atlas Network Access to your server IPs
- [ ] Serve over HTTPS
- [ ] Keep `.env` files out of git (already in `.gitignore`)

## Ideas for next steps
- Leave balances per type and year
- An overtime pay rule on the salary slip (OT hours are already tracked)
- Email notifications for leave decisions
- Geo-fencing or IP restriction for check-in
- Audit log of register edits
