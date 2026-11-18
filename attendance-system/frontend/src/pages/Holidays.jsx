import { useCallback, useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import api, { errMsg } from '../api/client';
import { EmptyState, PageHeader } from '../components/UI';
import Loader from '../components/Loader';
import { formatDate, weekday } from '../utils/format';

export default function Holidays() {
  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState(thisYear);
  const [items, setItems] = useState(null);
  const [form, setForm] = useState({ date: '', name: '' });
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setItems(null);
    api
      .get('/holidays', { params: { year } })
      .then(({ data }) => setItems(data))
      .catch((e) => toast.error(errMsg(e)));
  }, [year]);

  useEffect(load, [load]);

  const add = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post('/holidays', form);
      toast.success('Holiday added');
      setForm({ date: '', name: '' });
      load();
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id) => {
    try {
      await api.delete(`/holidays/${id}`);
      toast.success('Holiday removed');
      load();
    } catch (err) {
      toast.error(errMsg(err));
    }
  };

  return (
    <>
      <PageHeader
        title="Holidays"
        subtitle="Company holidays are skipped in working-day counts, leave days and salary calculations"
        actions={
          <select value={year} onChange={(e) => setYear(Number(e.target.value))}>
            {[thisYear - 1, thisYear, thisYear + 1].map((y) => (
              <option key={y}>{y}</option>
            ))}
          </select>
        }
      />
      <div className="card">
        <form className="toolbar wrap-row" onSubmit={add} style={{ marginTop: 0 }}>
          <label className="field compact">
            <span>Date</span>
            <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required />
          </label>
          <label className="field compact grow">
            <span>Holiday name</span>
            <input value={form.name} maxLength={100} placeholder="e.g. Diwali" onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </label>
          <button className="btn btn-primary align-end" disabled={busy}>
            <Plus size={16} /> Add holiday
          </button>
        </form>
      </div>
      <div className="card flush">
        {!items ? (
          <Loader />
        ) : items.length === 0 ? (
          <EmptyState title={`No holidays for ${year}`} />
        ) : (
          <table className="table ws-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Day</th>
                <th>Holiday</th>
                <th className="right" />
              </tr>
            </thead>
            <tbody>
              {items.map((h) => (
                <tr key={h._id}>
                  <td>{formatDate(h.date)}</td>
                  <td>{weekday(h.date)}</td>
                  <td>{h.name}</td>
                  <td className="right">
                    <button className="icon-btn danger" title="Remove" onClick={() => remove(h._id)}>
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
