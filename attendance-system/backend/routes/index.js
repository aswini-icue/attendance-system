const express = require('express');
const { protect, authorize } = require('../middleware/auth');
const auth = require('../controllers/authController');
const employees = require('../controllers/employeeController');
const attendance = require('../controllers/attendanceController');
const leaves = require('../controllers/leaveController');
const reports = require('../controllers/reportController');
const dashboard = require('../controllers/dashboardController');
const workspace = require('../controllers/workspaceController');
const holidays = require('../controllers/holidayController');
const kiosk = require('../controllers/kioskController');
const documents = require('../controllers/documentController');
const employeeDash = require('../controllers/employeeDashboardController');
const multer = require('multer');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

const router = express.Router();
const admin = [protect, authorize('admin')];
const self = [protect]; // any logged-in user (employees and admins have a workspace)

/* Auth */
router.post('/auth/login', auth.login);
router.get('/auth/me', protect, auth.me);
router.put('/auth/password', protect, auth.changePassword);

/* My Workspace (self-service) */
router.get('/workspace/summary', ...self, workspace.summary);
router.get('/workspace/payslip', ...self, workspace.payslip);
router.get('/workspace/payslip/pdf', ...self, workspace.payslipPdf);

/* Attendance - self-service shifts */
router.get('/attendance/today', ...self, attendance.today);
router.post('/attendance/clock-in', ...self, attendance.clockIn);
router.post('/attendance/clock-out', ...self, attendance.clockOut);
router.post('/attendance/ot/start', ...self, attendance.otStart); // start overtime timer
router.post('/attendance/ot/stop', ...self, attendance.otStop);
router.post('/attendance/out-time', ...self, attendance.outTime); // OT (Out Time)
router.get('/attendance/me', ...self, attendance.myHistory);

/* Attendance - admin */
router.get('/attendance/team', ...admin, attendance.team);
router.get('/attendance/employee/:id', ...admin, attendance.employeeMonth);
router.get('/attendance/register', ...admin, attendance.register);
router.post('/attendance/bulk', ...admin, attendance.bulkMark);
router.post('/attendance/mark-absent', ...admin, attendance.markAbsent);
router.delete('/attendance/:id', ...admin, attendance.remove);

/* Dashboard */
router.get('/dashboard', ...admin, dashboard.summary);

/* Employees (admin) */
router.get('/employees', ...admin, employees.list);
router.get('/employees/departments', ...admin, employees.departments);
router.post('/employees', ...admin, employees.create);
router.get('/employees/:id', ...admin, employees.getOne);
router.get('/employees/:id/overview', ...admin, employeeDash.overview);
router.get('/employees/:id/payslip', ...admin, employeeDash.payslip);
router.get('/employees/:id/documents', ...admin, documents.list);
router.post('/employees/:id/documents', ...admin, upload.single('file'), documents.upload);
router.get('/documents/:id/download', ...admin, documents.download);
router.delete('/documents/:id', ...admin, documents.remove);
router.put('/employees/:id', ...admin, employees.update);
router.delete('/employees/:id', ...admin, employees.remove);

/* Leaves */
router.post('/leaves', ...self, leaves.apply);
router.get('/leaves/me', ...self, leaves.mine);
router.delete('/leaves/:id', ...self, leaves.cancel);
router.get('/leaves', ...admin, leaves.list);
router.patch('/leaves/:id/review', ...admin, leaves.review);

/* Holidays */
router.get('/holidays', ...self, holidays.list);
router.post('/holidays', ...admin, holidays.create);
router.delete('/holidays/:id', ...admin, holidays.remove);

/* Reports (admin) */
router.get('/reports', ...admin, reports.getReport);
router.get('/reports/export/excel', ...admin, reports.exportExcel);
router.get('/reports/export/pdf', ...admin, reports.exportPdf);

/* Attendance Kiosk (shared device; every person uses their own PIN) */
router.post('/kiosk/activate', kiosk.activate);
router.get('/kiosk/people', kiosk.kioskAuth, kiosk.people);
router.post('/kiosk/state', kiosk.kioskAuth, kiosk.state);
router.post('/kiosk/action', kiosk.kioskAuth, kiosk.action);

module.exports = router;
