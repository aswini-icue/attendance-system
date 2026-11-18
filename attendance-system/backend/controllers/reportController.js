const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const User = require('../models/User');
const Attendance = require('../models/Attendance');
const asyncHandler = require('../utils/asyncHandler');
const HttpError = require('../utils/httpError');
const { todayStr, isValidDateStr, weekRange, monthRange, eachDay, formatTime } = require('../utils/time');
const { workingDaysBetween } = require('../utils/calendar');

const company = () => process.env.COMPANY_NAME || 'Company';
const hours = (mins) => Math.round(((mins || 0) / 60) * 100) / 100;

function resolveRange(q) {
  const type = q.type || 'daily';
  const today = todayStr();
  let from;
  let to;
  let label;

  if (type === 'daily') {
    from = to = q.date || today;
    if (!isValidDateStr(from)) throw new HttpError(400, 'Invalid date');
    label = `Daily Attendance Report - ${from}`;
  } else if (type === 'weekly') {
    const base = q.date || today;
    if (!isValidDateStr(base)) throw new HttpError(400, 'Invalid date');
    ({ from, to } = weekRange(base));
    label = `Weekly Attendance Report - ${from} to ${to}`;
  } else if (type === 'monthly') {
    const month = q.month || today.slice(0, 7);
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new HttpError(400, 'Month must be YYYY-MM');
    ({ from, to } = monthRange(month));
    label = `Monthly Attendance Report - ${month}`;
  } else if (type === 'custom') {
    from = q.from;
    to = q.to;
    if (!isValidDateStr(from) || !isValidDateStr(to) || to < from) throw new HttpError(400, 'Invalid date range');
    if (eachDay(from, to).length > 366) throw new HttpError(400, 'Range cannot exceed one year');
    label = `Attendance Report - ${from} to ${to}`;
  } else {
    throw new HttpError(400, 'Report type must be daily, weekly, monthly or custom');
  }
  return { type, from, to, label };
}

async function buildReport(q) {
  const { type, from, to, label } = resolveRange(q);

  const empFilter = { role: 'employee', $or: [{ joinDate: '' }, { joinDate: { $lte: to } }] };
  if (q.department) empFilter.department = q.department;
  if (q.employee) empFilter._id = q.employee;
  const employees = await User.find(empFilter).select('name employeeId department designation status').sort({ name: 1 });
  const ids = employees.map((e) => e._id);

  const records = await Attendance.find({ employee: { $in: ids }, date: { $gte: from, $lte: to } }).sort({ date: 1 });

  // Working days that have already happened (future days are not counted as missing)
  const today = todayStr();
  const elapsedWorkingDays = await workingDaysBetween(from, to < today ? to : today);
  const workingDaySet = new Set(elapsedWorkingDays);

  const empById = new Map(employees.map((e) => [String(e._id), e]));
  const summaryMap = new Map(
    employees.map((e) => [
      String(e._id),
      {
        employeeId: e.employeeId,
        name: e.name,
        department: e.department || '-',
        Present: 0,
        Late: 0,
        'Half-day': 0,
        Absent: 0,
        Leave: 0,
        workMinutes: 0,
        otMinutes: 0,
        recordedWorkingDays: 0,
      },
    ])
  );

  const details = [];
  for (const r of records) {
    const s = summaryMap.get(String(r.employee));
    if (!s) continue;
    s[r.status] += 1;
    s.workMinutes += r.workMinutes || 0;
    s.otMinutes += r.otMinutes || 0;
    if (workingDaySet.has(r.date)) s.recordedWorkingDays += 1;
    const e = empById.get(String(r.employee));
    details.push({
      id: r._id,
      date: r.date,
      employeeId: e.employeeId,
      name: e.name,
      department: e.department || '-',
      status: r.status,
      checkIn: r.checkIn,
      checkOut: r.checkOut,
      checkInText: formatTime(r.checkIn),
      checkOutText: formatTime(r.checkOut),
      workHours: hours(r.workMinutes),
      otHours: hours(r.otMinutes),
      remarks: r.remarks || (r.autoHalf && r.status === 'Half-day' ? 'Half-day set automatically (missed shift)' : ''),
    });
  }

  const workingDays = elapsedWorkingDays.length;
  const summary = [...summaryMap.values()].map((s) => {
    const attended = s.Present + s.Late + 0.5 * s['Half-day'];
    return {
      employeeId: s.employeeId,
      name: s.name,
      department: s.department,
      present: s.Present,
      late: s.Late,
      halfDay: s['Half-day'],
      absent: s.Absent,
      leave: s.Leave,
      notMarked: Math.max(0, workingDays - s.recordedWorkingDays),
      workHours: hours(s.workMinutes),
      otHours: hours(s.otMinutes),
      attendancePct: workingDays ? Math.round((attended / workingDays) * 1000) / 10 : 0,
    };
  });

  const totals = summary.reduce(
    (t, s) => {
      ['present', 'late', 'halfDay', 'absent', 'leave', 'notMarked', 'workHours', 'otHours'].forEach((k) => {
        t[k] = Math.round((t[k] + s[k]) * 100) / 100;
      });
      return t;
    },
    { present: 0, late: 0, halfDay: 0, absent: 0, leave: 0, notMarked: 0, workHours: 0, otHours: 0 }
  );

  return { type, label, from, to, workingDays, employees: employees.length, summary, totals, details };
}

// GET /api/reports
exports.getReport = asyncHandler(async (req, res) => {
  res.json(await buildReport(req.query));
});

/* ---------------- Excel export ---------------- */

const SUMMARY_COLS = [
  { header: 'Emp ID', key: 'employeeId', width: 12 },
  { header: 'Name', key: 'name', width: 26 },
  { header: 'Department', key: 'department', width: 18 },
  { header: 'Present', key: 'present', width: 10 },
  { header: 'Late', key: 'late', width: 8 },
  { header: 'Half-day', key: 'halfDay', width: 10 },
  { header: 'Absent', key: 'absent', width: 9 },
  { header: 'Leave', key: 'leave', width: 8 },
  { header: 'Not Marked', key: 'notMarked', width: 12 },
  { header: 'Work Hrs', key: 'workHours', width: 10 },
  { header: 'OT Hrs', key: 'otHours', width: 9 },
  { header: 'Attendance %', key: 'attendancePct', width: 13 },
];

const DETAIL_COLS = [
  { header: 'Date', key: 'date', width: 12 },
  { header: 'Emp ID', key: 'employeeId', width: 12 },
  { header: 'Name', key: 'name', width: 26 },
  { header: 'Department', key: 'department', width: 18 },
  { header: 'Status', key: 'status', width: 11 },
  { header: 'Check In', key: 'checkInText', width: 11 },
  { header: 'Check Out', key: 'checkOutText', width: 11 },
  { header: 'Work Hrs', key: 'workHours', width: 10 },
  { header: 'OT Hrs', key: 'otHours', width: 9 },
  { header: 'Remarks', key: 'remarks', width: 30 },
];

const STATUS_FILL = {
  Present: 'FFDCFCE7',
  Late: 'FFFEF3C7',
  'Half-day': 'FFE0E7FF',
  Absent: 'FFFEE2E2',
  Leave: 'FFE0F2FE',
};

function addSheet(wb, name, title, subtitle, columns, rows, statusKey) {
  const ws = wb.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 4 }] });
  ws.columns = columns.map((c) => ({ key: c.key, width: c.width }));
  const lastCol = String.fromCharCode(64 + columns.length);

  ws.mergeCells(`A1:${lastCol}1`);
  ws.getCell('A1').value = `${company()} - ${title}`;
  ws.getCell('A1').font = { bold: true, size: 14, color: { argb: 'FF1E293B' } };
  ws.mergeCells(`A2:${lastCol}2`);
  ws.getCell('A2').value = subtitle;
  ws.getCell('A2').font = { size: 10, color: { argb: 'FF64748B' } };

  const header = ws.getRow(4);
  columns.forEach((c, i) => {
    const cell = header.getCell(i + 1);
    cell.value = c.header;
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F1F23' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    cell.border = { bottom: { style: 'thin', color: { argb: 'FF94A3B8' } } };
  });
  header.height = 22;

  rows.forEach((r) => {
    const row = ws.addRow(r);
    row.eachCell((cell) => {
      cell.border = { bottom: { style: 'hair', color: { argb: 'FFE2E8F0' } } };
    });
    if (statusKey && STATUS_FILL[r[statusKey]]) {
      const idx = columns.findIndex((c) => c.key === statusKey) + 1;
      row.getCell(idx).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: STATUS_FILL[r[statusKey]] } };
    }
  });
  ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: columns.length } };
  return ws;
}

// GET /api/reports/export/excel
exports.exportExcel = asyncHandler(async (req, res) => {
  const report = await buildReport(req.query);
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Attendance Management System';
  wb.created = new Date();
  const subtitle = `Period: ${report.from} to ${report.to}  |  Working days: ${report.workingDays}  |  Employees: ${report.employees}  |  Generated: ${new Date().toLocaleString('en-IN')}`;

  const ws = addSheet(wb, 'Summary', report.label, subtitle, SUMMARY_COLS, report.summary);
  const totalRow = ws.addRow({ name: 'TOTAL', ...report.totals });
  totalRow.font = { bold: true };
  totalRow.eachCell((c) => {
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
  });

  addSheet(wb, 'Details', report.label, subtitle, DETAIL_COLS, report.details, 'status');

  const filename = `attendance-${report.type}-${report.from}${report.from !== report.to ? `_to_${report.to}` : ''}.xlsx`;
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  await wb.xlsx.write(res);
  res.end();
});

/* ---------------- PDF export ---------------- */

function drawTable(doc, columns, rows, { statusKey } = {}) {
  const startX = doc.page.margins.left;
  const usable = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const totalW = columns.reduce((s, c) => s + c.width, 0);
  const cols = columns.map((c) => ({ ...c, w: (c.width / totalW) * usable }));
  const rowH = 20;
  const bottom = () => doc.page.height - doc.page.margins.bottom - 20;

  const drawHeader = () => {
    let x = startX;
    const y = doc.y;
    doc.rect(startX, y, usable, rowH).fill('#1F1F23');
    doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(8.5);
    cols.forEach((c) => {
      doc.text(c.header, x + 4, y + 6, { width: c.w - 8, ellipsis: true, lineBreak: false });
      x += c.w;
    });
    doc.y = y + rowH;
  };

  drawHeader();
  rows.forEach((r, i) => {
    if (doc.y + rowH > bottom()) {
      doc.addPage();
      drawHeader();
    }
    const y = doc.y;
    if (i % 2 === 1) doc.rect(startX, y, usable, rowH).fill('#F8FAFC');
    if (r.__total) doc.rect(startX, y, usable, rowH).fill('#E2E8F0');
    let x = startX;
    cols.forEach((c) => {
      const val = r[c.key] ?? '-';
      const color = statusKey && c.key === statusKey ? STATUS_TEXT[val] || '#0F172A' : '#0F172A';
      doc
        .fillColor(color)
        .font(r.__total || (statusKey && c.key === statusKey) ? 'Helvetica-Bold' : 'Helvetica')
        .fontSize(8.5)
        .text(String(val), x + 4, y + 6, { width: c.w - 8, ellipsis: true, lineBreak: false });
      x += c.w;
    });
    doc.moveTo(startX, y + rowH).lineTo(startX + usable, y + rowH).lineWidth(0.4).strokeColor('#E2E8F0').stroke();
    doc.y = y + rowH;
  });
  doc.x = startX;
}

const STATUS_TEXT = {
  Present: '#15803D',
  Late: '#B45309',
  'Half-day': '#4338CA',
  Absent: '#B91C1C',
  Leave: '#0369A1',
};

// GET /api/reports/export/pdf
exports.exportPdf = asyncHandler(async (req, res) => {
  const report = await buildReport(req.query);
  const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 36, bufferPages: true });

  const filename = `attendance-${report.type}-${report.from}${report.from !== report.to ? `_to_${report.to}` : ''}.pdf`;
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  doc.pipe(res);

  // Header band
  doc.rect(0, 0, doc.page.width, 70).fill('#0E0E10');
  doc.rect(0, 70, doc.page.width, 3).fill('#E5564B');
  doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(18).text(company(), 36, 18);
  doc.font('Helvetica').fontSize(11).fillColor('#CBD5E1').text(report.label, 36, 42);
  doc.y = 88;

  // KPI line
  const t = report.totals;
  doc
    .fillColor('#334155')
    .fontSize(9.5)
    .text(
      `Period: ${report.from} to ${report.to}    Working days: ${report.workingDays}    Employees: ${report.employees}    ` +
        `Present: ${t.present}   Late: ${t.late}   Half-day: ${t.halfDay}   Absent: ${t.absent}   Leave: ${t.leave}   Not marked: ${t.notMarked}   OT hrs: ${t.otHours}`,
      36,
      doc.y
    );
  doc.moveDown(1);

  doc.fillColor('#0F172A').font('Helvetica-Bold').fontSize(12).text('Employee Summary');
  doc.moveDown(0.4);
  drawTable(doc, SUMMARY_COLS, [
    ...report.summary.map((s) => ({ ...s, attendancePct: `${s.attendancePct}%` })),
    { __total: true, name: 'TOTAL', ...report.totals, employeeId: '', department: '', attendancePct: '' },
  ]);

  // Day-wise details are included for daily and weekly reports (monthly details live in the Excel export)
  if (report.type === 'daily' || report.type === 'weekly' || report.details.length <= 300) {
    doc.moveDown(1.2);
    if (doc.y > doc.page.height - 120) doc.addPage();
    doc.fillColor('#0F172A').font('Helvetica-Bold').fontSize(12).text('Attendance Details', 36);
    doc.moveDown(0.4);
    if (report.details.length) {
      drawTable(doc, DETAIL_COLS, report.details, { statusKey: 'status' });
    } else {
      doc.font('Helvetica').fontSize(10).fillColor('#64748B').text('No attendance records for this period.');
    }
  }

  // Footer with page numbers
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i += 1) {
    doc.switchToPage(i);
    const y = doc.page.height - 28;
    doc
      .font('Helvetica')
      .fontSize(8)
      .fillColor('#94A3B8')
      .text(`Generated ${new Date().toLocaleString('en-IN')}  |  Page ${i + 1} of ${range.count}`, 36, y, {
        width: doc.page.width - 72,
        align: 'right',
        lineBreak: false,
      });
  }
  doc.end();
});
