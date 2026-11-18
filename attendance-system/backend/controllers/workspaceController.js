// "My Workspace": personal summary cards and salary slip (for any logged-in user)
const PDFDocument = require('pdfkit');
const Attendance = require('../models/Attendance');
const Leave = require('../models/Leave');
const asyncHandler = require('../utils/asyncHandler');
const HttpError = require('../utils/httpError');
const { getSettings } = require('../config/settings');
const { workingDaysBetween } = require('../utils/calendar');
const { todayStr, monthRange } = require('../utils/time');

const hm = (m) => `${Math.floor((m || 0) / 60)}h ${String(Math.round(m || 0) % 60).padStart(2, '0')}m`;
const monthLabel = (ym) => new Date(`${ym}-01T00:00:00Z`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' });

async function buildPayslip(user, ym) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(ym)) throw new HttpError(400, 'Month must be YYYY-MM');
  const s = getSettings();
  const { from, to } = monthRange(ym);
  const wd = (await workingDaysBetween(from, to)).length;
  const gross = user.salary || 0;

  const [records, unpaidLeaves] = await Promise.all([
    Attendance.find({ employee: user._id, date: { $gte: from, $lte: to } }).lean(),
    Leave.find({ employee: user._id, status: 'Approved', leaveType: 'Unpaid', fromDate: { $lte: to }, toDate: { $gte: from } }).lean(),
  ]);
  const isUnpaid = (d) => unpaidLeaves.some((l) => l.fromDate <= d && l.toDate >= d);

  const c = { present: 0, late: 0, halfDay: 0, absent: 0, leave: 0, unpaidLeave: 0, otMinutes: 0 };
  for (const r of records) {
    if (r.status === 'Absent') c.absent += 1;
    else if (r.status === 'Half-day') c.halfDay += 1;
    else if (r.status === 'Leave') {
      c.leave += 1;
      if (isUnpaid(r.date)) c.unpaidLeave += 1;
    } else if (r.status === 'Late') c.late += 1;
    else c.present += 1;
    c.otMinutes += r.otMinutes || 0;
  }

  // Loss of pay = absent + unpaid leave + half of each half day
  const lopDays = c.absent + c.unpaidLeave + c.halfDay * 0.5;
  const perDay = wd ? gross / wd : 0;
  const lopAmount = Math.round(lopDays * perDay);
  const earnings = [
    ['Basic Salary', Math.round(gross * 0.5)],
    ['House Rent Allowance', Math.round(gross * 0.2)],
    ['Conveyance Allowance', Math.round(gross * 0.1)],
  ];
  earnings.push(['Special Allowance', gross - earnings.reduce((a, e) => a + e[1], 0)]);
  const pt = gross >= s.professionalTaxThreshold ? s.professionalTax : 0;
  const deductions = [
    ['Loss of Pay', lopAmount],
    ['Professional Tax', pt],
  ];
  const totalDeductions = lopAmount + pt;

  return {
    month: ym,
    monthLabel: monthLabel(ym),
    employee: {
      name: user.name,
      employeeId: user.employeeId,
      designation: user.designation,
      department: user.department,
    },
    workingDays: wd,
    paidDays: wd - lopDays,
    lopDays,
    perDayRate: Math.round(perDay),
    counts: c,
    gross,
    earnings,
    deductions,
    totalDeductions,
    netPay: gross - totalDeductions,
    inProgress: ym === todayStr().slice(0, 7),
  };
}

// GET /api/workspace/summary
exports.summary = asyncHandler(async (req, res) => {
  const today = todayStr();
  const ym = today.slice(0, 7);
  const { from } = monthRange(ym);
  const [records, pending, payslip] = await Promise.all([
    Attendance.find({ employee: req.user._id, date: { $gte: from, $lte: today } }).lean(),
    Leave.find({ employee: req.user._id, status: 'Pending' }).lean(),
    buildPayslip(req.user, ym),
  ]);
  res.json({
    daysWorked: records.filter((r) => ['Present', 'Late', 'Half-day'].includes(r.status)).length,
    halfDays: records.filter((r) => r.status === 'Half-day').length,
    leaveTaken: records.filter((r) => r.status === 'Leave').length,
    leavePendingDays: pending.reduce((a, l) => a + l.days, 0),
    netPay: payslip.netPay,
    lopDays: payslip.lopDays,
  });
});

// GET /api/workspace/payslip?month=YYYY-MM
exports.payslip = asyncHandler(async (req, res) => {
  res.json(await buildPayslip(req.user, req.query.month || todayStr().slice(0, 7)));
});

// GET /api/workspace/payslip/pdf?month=YYYY-MM
exports.payslipPdf = asyncHandler(async (req, res) => {
  const p = await buildPayslip(req.user, req.query.month || todayStr().slice(0, 7));
  const rs = (n) => `Rs. ${Math.round(n).toLocaleString('en-IN')}`;
  const doc = new PDFDocument({ size: 'A4', margin: 40 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="salary-slip-${p.employee.employeeId || 'employee'}-${p.month}.pdf"`);
  doc.pipe(res);

  const W = doc.page.width;
  const L = 40;
  const usable = W - 80;

  // Header
  doc.rect(0, 0, W, 70).fill('#0E0E10');
  doc.rect(0, 70, W, 3).fill('#E5564B');
  doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(18).text(getSettings().company, L, 20);
  doc.font('Helvetica').fontSize(11).fillColor('#D4D4D8').text(`Salary Slip - ${p.monthLabel}`, L, 44);

  // Employee details grid
  let y = 95;
  const meta = [
    ['Employee', p.employee.name, 'Employee ID', p.employee.employeeId || '-'],
    ['Designation', p.employee.designation || '-', 'Department', p.employee.department || '-'],
    ['Working days', String(p.workingDays), 'Paid days', String(p.paidDays)],
    ['LOP days', String(p.lopDays), 'Overtime logged', hm(p.counts.otMinutes)],
  ];
  const cw = usable / 4;
  meta.forEach((row) => {
    row.forEach((cell, i) => {
      const x = L + i * cw;
      if (i % 2 === 0) doc.rect(x, y, cw, 24).fill('#F8FAFC');
      doc.rect(x, y, cw, 24).lineWidth(0.5).strokeColor('#E2E8F0').stroke();
      doc.fillColor('#0F172A').font(i % 2 === 0 ? 'Helvetica-Bold' : 'Helvetica').fontSize(9.5).text(cell, x + 8, y + 8, { width: cw - 16, ellipsis: true, lineBreak: false });
    });
    y += 24;
  });

  // Earnings & deductions
  y += 22;
  const half = usable / 2;
  const table = (x, title, rows, totalLabel, total) => {
    let ty = y;
    doc.rect(x, ty, half - 8, 24).fill('#1F1F23');
    doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(9.5).text(title, x + 8, ty + 8);
    doc.text('Amount', x + 8, ty + 8, { width: half - 24, align: 'right' });
    ty += 24;
    rows.forEach(([n, v]) => {
      doc.rect(x, ty, half - 8, 24).lineWidth(0.5).strokeColor('#E2E8F0').stroke();
      doc.fillColor('#0F172A').font('Helvetica').fontSize(9.5).text(n, x + 8, ty + 8);
      doc.text(rs(v), x + 8, ty + 8, { width: half - 24, align: 'right' });
      ty += 24;
    });
    doc.rect(x, ty, half - 8, 24).fill('#F1F5F9');
    doc.fillColor('#0F172A').font('Helvetica-Bold').text(totalLabel, x + 8, ty + 8);
    doc.text(rs(total), x + 8, ty + 8, { width: half - 24, align: 'right' });
    return ty + 24;
  };
  const yA = table(L, 'Earnings', p.earnings, 'Gross earnings', p.gross);
  const yB = table(L + half + 8, 'Deductions', p.deductions, 'Total deductions', p.totalDeductions);
  y = Math.max(yA, yB) + 20;

  // Net pay
  doc.roundedRect(L, y, usable, 44, 6).fill('#FDEEEC');
  doc.fillColor('#7A2016').font('Helvetica-Bold').fontSize(13).text('Net pay', L + 16, y + 15);
  doc.text(rs(p.netPay), L + 16, y + 15, { width: usable - 32, align: 'right' });
  doc.font('Helvetica').fontSize(8.5).fillColor('#64748B')
    .text('LOP = absent days + unpaid leave + half of each half day. This is a system-generated salary slip and does not require a signature.', L, y + 60, { width: usable });
  doc.end();
});

exports.buildPayslip = buildPayslip;
