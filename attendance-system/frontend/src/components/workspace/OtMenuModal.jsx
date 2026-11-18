import { useState } from 'react';
import { AlarmClock, Clock, Play } from 'lucide-react';
import toast from 'react-hot-toast';
import api, { errMsg } from '../../api/client';
import { Modal } from '../UI';

// OT button menu: start an overtime timer, or record the out time for a shift.
export default function OtMenuModal({ state, hasShift, onClose, onStarted, onRecordOutTime }) {
  const [busy, setBusy] = useState(false);
  const blocked = state.otBlocked;

  const start = async () => {
    setBusy(true);
    try {
      const { data } = await api.post('/attendance/ot/start');
      onStarted(data);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open title="OT · Overtime & Out Time" onClose={onClose} width={540}>
      <div className={`ot-choice ${blocked ? 'is-off' : ''}`}>
        <div className="ot-choice-icon">
          <Play size={18} />
        </div>
        <div>
          <strong>Start overtime now</strong>
          <p>
            Starts an overtime timer. Everything until you press <em>Stop OT</em> counts as overtime.
          </p>
          {blocked && <p className="tone-text-red small">{blocked}</p>}
        </div>
        <button className="btn btn-ot" onClick={start} disabled={!!blocked || busy}>
          <AlarmClock size={16} /> Start OT
        </button>
      </div>
      <div className={`ot-choice ${hasShift ? '' : 'is-off'}`}>
        <div className="ot-choice-icon">
          <Clock size={18} />
        </div>
        <div>
          <strong>Record out time</strong>
          <p>Enter when you actually stopped a shift: after the shift end counts as overtime, before it means you left early.</p>
          {!hasShift && <p className="muted small">Clock in to a shift first.</p>}
        </div>
        <button className="btn btn-outline" onClick={onRecordOutTime} disabled={!hasShift}>
          Record
        </button>
      </div>
    </Modal>
  );
}
