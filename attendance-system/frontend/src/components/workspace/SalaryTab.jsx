import { useEffect, useMemo, useState } from 'react';
import { FileText } from 'lucide-react';
import toast from 'react-hot-toast';
import api, { downloadFile, errMsg } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import Loader from '../Loader';
import { minutesToHM, money, monthLabel, todayInTz } from '../../utils/format';

export default function SalaryTab() {
  const { settings } = useAuth();
  const thisMonth = todayInTz(settings.timezone).slice(0, 7);
  const months = useMemo(() => {
    const [y, m] = thisMonth.split('-').map(Number);
    return Array.from({ length: 6 }, (_, i) => {
      const d = new Date(Date.UTC(y, m - 1 - i, 1));
      return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    });
  }, [thisMonth]);
  const [month, setMonth] = useState(thisMonth);
  const [p, setP] = useState(null);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    setP(null);
    api
      .get('/workspace/payslip', { params: { month } })
      .then(({ data }) => setP(data))
      .catch((e) => toast.error(errMsg(e)));
  }, [month]);

  const download = async () => {
    setDownloading(true);
    try {
      await downloadFile('/workspace/payslip/pdf', { month }, `salary-slip-${month}.pdf`);
      toast.success('Salary slip downloaded');
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="card">
      <div className="card-head">
        <div>
          <h3>Salary slip · {monthLabel(month)}</h3>
          {p?.inProgress && <span className="muted small">Month in progress: figures update as attendance is recorded</span>}
        </div>
        <div className="page-actions">
          <select value={month} onChange={(e) => setMonth(e.target.value)}>
            {months.map((m) => (
              <option key={m} value={m}>
                {monthLabel(m)}
              </option>
            ))}
          </select>
          <button className="btn btn-outline" onClick={download} disabled={downloading || !p}>
            <FileText size={16} /> {downloading ? 'Preparing…' : 'Download PDF'}
          </button>
        </div>
      </div>

      {!p ? (
        <Loader />
      ) : (
        <>
          <div className="slip-meta">
            {[
              ['Employee', p.employee.name],
              ['Employee ID', p.employee.employeeId || '—'],
              ['Designation', p.employee.designation || '—'],
              ['Department', p.employee.department || '—'],
              ['Working days', p.workingDays],
              ['Paid days', p.paidDays],
              ['LOP days', p.lopDays],
              ['Overtime logged', minutesToHM(p.counts.otMinutes)],
            ].map(([k, v]) => (
              <div key={k}>
                <span>{k}</span>
                <strong>{v}</strong>
              </div>
            ))}
          </div>

          <div className="grid-2 slip-grid">
            {[
              ['Earnings', p.earnings, 'Gross earnings', p.gross],
              ['Deductions', p.deductions, 'Total deductions', p.totalDeductions],
            ].map(([title, rows, totalLabel, total]) => (
              <table key={title} className="table slip">
                <thead>
                  <tr>
                    <th>{title}</th>
                    <th className="num">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(([n, v]) => (
                    <tr key={n}>
                      <td>{n}</td>
                      <td className="num">{money(v)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td>
                      <strong>{totalLabel}</strong>
                    </td>
                    <td className="num">
                      <strong>{money(total)}</strong>
                    </td>
                  </tr>
                </tfoot>
              </table>
            ))}
          </div>

          <div className="net-pay">
            <span>Net pay</span>
            <strong>{money(p.netPay)}</strong>
          </div>
          <p className="muted small" style={{ margin: '10px 0 0' }}>
            LOP = absent days + unpaid leave + ½ per half day. Per-day rate {money(p.perDayRate)} ({money(p.gross)} ÷ {p.workingDays} working
            days). Overtime is shown for reference.
          </p>
        </>
      )}
    </div>
  );
}
