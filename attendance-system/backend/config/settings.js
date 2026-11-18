// Central place for company attendance rules (read from .env)
function getSettings() {
  return {
    company: process.env.COMPANY_NAME || 'Company',
    timezone: process.env.TIMEZONE || 'Asia/Kolkata',
    shifts: [
      {
        key: 'morning',
        label: 'Morning',
        start: process.env.MORNING_SHIFT_START || '09:00',
        end: process.env.MORNING_SHIFT_END || '13:00',
      },
      {
        key: 'afternoon',
        label: 'Afternoon',
        start: process.env.AFTERNOON_SHIFT_START || '15:00',
        end: process.env.AFTERNOON_SHIFT_END || '19:00',
      },
    ],
    // Clock-in opens this many minutes before each shift
    openEarlyMinutes: Number(process.env.CLOCK_IN_OPENS_MINUTES_BEFORE || 30),
    // Clock-in later than shift start + grace => Late
    lateGraceMinutes: Number(process.env.LATE_GRACE_MINUTES || 15),
    expectedDailyHours: Number(process.env.EXPECTED_DAILY_HOURS || 8),
    weeklyOffDays: (process.env.WEEKLY_OFF_DAYS ?? '0')
      .split(',')
      .map((d) => d.trim())
      .filter((d) => d !== '')
      .map(Number),
    professionalTax: Number(process.env.PROFESSIONAL_TAX || 200),
    professionalTaxThreshold: Number(process.env.PROFESSIONAL_TAX_THRESHOLD || 15000),
  };
}

module.exports = { getSettings };
