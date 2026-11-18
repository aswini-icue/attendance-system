import { useCallback, useEffect, useState } from 'react';
import { Check, X } from 'lucide-react';
import toast from 'react-hot-toast';
import api, { errMsg } from '../api/client';
import { EmptyState, Modal, PageHeader, PersonCell } from '../components/UI';
import Loader from '../components/Loader';
import { formatDate } from '../utils/format';
import { LeaveStatus } from '../components/workspace/LeaveTab';

const TABS = ['Pending', 'Approved', 'Rejected', 'All'];


export default function Leaves() {
  return <AdminLeaves />;
}

/* ---------------- Admin: approve / reject ---------------- */
function AdminLeaves() {
  const [tab, setTab] = useState('Pending');
  const [data, setData] = useState(null);
  const [review, setReview] = useState(null); // { leave, status }
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setData(null);
    api
      .get('/leaves', { params: { status: tab } })
      .then(({ data: d }) => setData(d))
      .catch((e) => toast.error(errMsg(e)));
  }, [tab]);

  useEffect(load, [load]);

  const submitReview = async () => {
    setBusy(true);
    try {
      const { data: d } = await api.patch(`/leaves/${review.leave._id}/review`, {
        status: review.status,
        adminComment: comment,
      });
      toast.success(d.message);
      setReview(null);
      setComment('');
      load();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader title="Leave Requests" subtitle="Review and approve employee leave applications" />

      <div className="tabs">
        {TABS.map((t) => (
          <button key={t} className={`tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>
            {t}
            {t === 'Pending' && data?.pending > 0 && <span className="tab-count">{data.pending}</span>}
          </button>
        ))}
      </div>

      <div className="card">
        {!data ? (
          <Loader />
        ) : data.items.length === 0 ? (
          <EmptyState title={`No ${tab === 'All' ? '' : tab.toLowerCase()} requests`} />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Type</th>
                  <th>From</th>
                  <th>To</th>
                  <th>Days</th>
                  <th>Reason</th>
                  <th>Status</th>
                  <th className="right">Action</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((l) => (
                  <tr key={l._id}>
                    <td>
                      <PersonCell
                        name={l.employee?.name || 'Deleted employee'}
                        sub={[l.employee?.employeeId, l.employee?.department].filter(Boolean).join(' · ')}
                      />
                    </td>
                    <td>{l.leaveType}</td>
                    <td>{formatDate(l.fromDate)}</td>
                    <td>{formatDate(l.toDate)}</td>
                    <td>{l.days}</td>
                    <td className="wrap">{l.reason}</td>
                    <td>
                      <LeaveStatus status={l.status} />
                      {l.reviewedBy && <div className="muted small">by {l.reviewedBy.name}</div>}
                    </td>
                    <td className="right nowrap">
                      {l.status === 'Pending' ? (
                        <>
                          <button
                            className="btn btn-success btn-sm"
                            onClick={() => setReview({ leave: l, status: 'Approved' })}
                          >
                            <Check size={14} /> Approve
                          </button>{' '}
                          <button
                            className="btn btn-danger-ghost btn-sm"
                            onClick={() => setReview({ leave: l, status: 'Rejected' })}
                          >
                            <X size={14} /> Reject
                          </button>
                        </>
                      ) : (
                        <span className="muted small">{l.adminComment || '—'}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal
        open={!!review}
        title={review?.status === 'Approved' ? 'Approve leave' : 'Reject leave'}
        onClose={() => setReview(null)}
        width={480}
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setReview(null)}>
              Cancel
            </button>
            <button
              className={`btn ${review?.status === 'Approved' ? 'btn-success' : 'btn-danger'}`}
              onClick={submitReview}
              disabled={busy}
            >
              {busy ? 'Saving…' : review?.status === 'Approved' ? 'Approve' : 'Reject'}
            </button>
          </>
        }
      >
        {review && (
          <>
            <p>
              <strong>{review.leave.employee?.name}</strong> · {review.leave.leaveType} leave ·{' '}
              {formatDate(review.leave.fromDate)} – {formatDate(review.leave.toDate)} ({review.leave.days} day
              {review.leave.days > 1 ? 's' : ''})
            </p>
            {review.status === 'Approved' && (
              <p className="muted small">The attendance register will be marked “Leave” for these working days.</p>
            )}
            <label className="field">
              <span>Comment (optional)</span>
              <textarea rows={3} value={comment} onChange={(e) => setComment(e.target.value)} maxLength={300} />
            </label>
          </>
        )}
      </Modal>
    </>
  );
}
