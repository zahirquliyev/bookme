import React, { useState, useEffect } from 'react';
import api from '../api';

const DAYS = ['Bazar', 'Bazar ertəsi', 'Çərşənbə axşamı', 'Çərşənbə', 'Cümə axşamı', 'Cümə', 'Şənbə'];

export default function SettingsPage() {
  const [tab, setTab] = useState('numbers');
  const [numbers, setNumbers] = useState([]);
  const [hours, setHours] = useState([]);
  const [tenant, setTenant] = useState(null);
  const [numForm, setNumForm] = useState({ number: '', type: 'gsm', provider: 'azercell', isPrimary: false, isFallback: false, gsmPort: '' });
  const [saved, setSaved] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([
      api.get('/tenants/me'),
      api.get('/tenants/numbers'),
      api.get('/tenants/working-hours'),
    ]).then(([t, n, h]) => {
      setTenant(t.data);
      setNumbers(n.data);
      // Fill 7 days
      const existing = h.data;
      const full = Array.from({ length: 7 }, (_, i) => {
        const found = existing.find(e => e.day_of_week === i);
        return found || { day_of_week: i, open_time: '09:00', close_time: '22:00', is_active: i >= 1 && i <= 5 };
      });
      setHours(full);
    });
  }, []);

  const addNumber = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const { data } = await api.post('/tenants/numbers', numForm);
      setNumbers([...numbers, data]);
      setNumForm({ number: '', type: 'gsm', provider: 'azercell', isPrimary: false, isFallback: false, gsmPort: '' });
      setSaved('Nömrə əlavə edildi!');
      setTimeout(() => setSaved(''), 3000);
    } catch (err) {
      setError(err.response?.data?.error || 'Xəta');
    }
  };

  const saveHours = async () => {
    try {
      await api.put('/tenants/working-hours', { hours });
      setSaved('İş saatları yadda saxlandı!');
      setTimeout(() => setSaved(''), 3000);
    } catch (err) {
      setError('Yadda saxlamaq mümkün olmadı');
    }
  };

  const updateHour = (idx, key, val) => {
    const updated = [...hours];
    updated[idx] = { ...updated[idx], [key]: val };
    setHours(updated);
  };

  return (
    <div style={styles.page}>
      <h1 style={styles.heading}>⚙️ Tənzimləmələr</h1>

      {/* Plan info */}
      {tenant && (
        <div style={styles.planCard}>
          <span style={styles.planLabel}>📦 Aktiv plan:</span>
          <span style={styles.planName}>{tenant.plan_name?.toUpperCase()}</span>
          <span style={styles.planMeta}>Max {tenant.max_agents} operator · Max {tenant.max_numbers} nömrə</span>
        </div>
      )}

      {saved && <div style={styles.success}>{saved}</div>}
      {error && <div style={styles.error}>{error}</div>}

      {/* Tabs */}
      <div style={styles.tabs}>
        {[['numbers', '📱 Nömrələr'], ['hours', '🕐 İş Saatları']].map(([key, label]) => (
          <button
            key={key}
            style={{ ...styles.tab, ...(tab === key ? styles.tabActive : {}) }}
            onClick={() => setTab(key)}
          >{label}</button>
        ))}
      </div>

      {/* Phone numbers tab */}
      {tab === 'numbers' && (
        <div>
          {/* Add number form */}
          <div style={styles.card}>
            <h3 style={styles.cardTitle}>Nömrə əlavə et</h3>
            <form onSubmit={addNumber} style={styles.numForm}>
              <div style={styles.field}>
                <label style={styles.label}>Nömrə</label>
                <input value={numForm.number} onChange={e => setNumForm({ ...numForm, number: e.target.value })}
                  style={styles.input} placeholder="+994501234567" required />
              </div>
              <div style={styles.field}>
                <label style={styles.label}>Növ</label>
                <select value={numForm.type} onChange={e => setNumForm({ ...numForm, type: e.target.value })} style={styles.select}>
                  <option value="gsm">GSM</option>
                  <option value="voip">VoIP</option>
                </select>
              </div>
              <div style={styles.field}>
                <label style={styles.label}>Operator</label>
                <select value={numForm.provider} onChange={e => setNumForm({ ...numForm, provider: e.target.value })} style={styles.select}>
                  <option value="azercell">Azercell</option>
                  <option value="bakcell">Bakcell</option>
                  <option value="nar">Nar Mobile</option>
                  <option value="twilio">Twilio</option>
                  <option value="zadarma">Zadarma</option>
                </select>
              </div>
              {numForm.type === 'gsm' && (
                <div style={styles.field}>
                  <label style={styles.label}>GoIP Port</label>
                  <input value={numForm.gsmPort} onChange={e => setNumForm({ ...numForm, gsmPort: e.target.value })}
                    style={styles.input} placeholder="1" type="number" />
                </div>
              )}
              <div style={{ ...styles.field, justifyContent: 'flex-end', flexDirection: 'row', alignItems: 'center', gap: 16 }}>
                <label style={styles.checkLabel}>
                  <input type="checkbox" checked={numForm.isPrimary} onChange={e => setNumForm({ ...numForm, isPrimary: e.target.checked })} />
                  Əsas nömrə
                </label>
                <label style={styles.checkLabel}>
                  <input type="checkbox" checked={numForm.isFallback} onChange={e => setNumForm({ ...numForm, isFallback: e.target.checked })} />
                  Fallback
                </label>
                <button type="submit" style={styles.btnAdd}>+ Əlavə et</button>
              </div>
            </form>
          </div>

          {/* Numbers list */}
          <div style={styles.card}>
            <h3 style={styles.cardTitle}>Mövcud nömrələr</h3>
            {numbers.length === 0
              ? <p style={styles.empty}>Hələ nömrə yoxdur</p>
              : numbers.map(n => (
                <div key={n.id} style={styles.numRow}>
                  <span style={styles.numIcon}>{n.type === 'gsm' ? '📱' : '🌐'}</span>
                  <div style={{ flex: 1 }}>
                    <span style={styles.numVal}>{n.number}</span>
                    <span style={styles.numProvider}> · {n.provider}</span>
                  </div>
                  {n.is_primary && <span style={styles.badge('#22c55e')}>Əsas</span>}
                  {n.is_fallback && <span style={styles.badge('#f59e0b')}>Fallback</span>}
                  <span style={{ ...styles.statusDot, background: n.status === 'active' ? '#22c55e' : '#ef4444' }} />
                </div>
              ))
            }
          </div>
        </div>
      )}

      {/* Working hours tab */}
      {tab === 'hours' && (
        <div style={styles.card}>
          <h3 style={styles.cardTitle}>İş saatları</h3>
          {hours.map((h, idx) => (
            <div key={idx} style={styles.hourRow}>
              <label style={styles.dayCheck}>
                <input type="checkbox" checked={h.is_active} onChange={e => updateHour(idx, 'is_active', e.target.checked)} />
                <span style={{ ...styles.dayName, color: h.is_active ? '#e2e8f0' : '#64748b' }}>{DAYS[idx]}</span>
              </label>
              <input type="time" value={h.open_time} onChange={e => updateHour(idx, 'open_time', e.target.value)}
                style={{ ...styles.timeInput, opacity: h.is_active ? 1 : 0.4 }} disabled={!h.is_active} />
              <span style={styles.timeSep}>—</span>
              <input type="time" value={h.close_time} onChange={e => updateHour(idx, 'close_time', e.target.value)}
                style={{ ...styles.timeInput, opacity: h.is_active ? 1 : 0.4 }} disabled={!h.is_active} />
            </div>
          ))}
          <button style={styles.btnSave} onClick={saveHours}>💾 Yadda saxla</button>
        </div>
      )}
    </div>
  );
}

const styles = {
  page: { maxWidth: 800, margin: '0 auto' },
  heading: { color: '#e2e8f0', fontSize: 24, fontWeight: 700, marginBottom: 20 },
  planCard: { background: '#1e3a5f', borderRadius: 10, padding: '14px 20px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 12 },
  planLabel: { color: '#94a3b8', fontSize: 13 },
  planName: { color: '#60a5fa', fontSize: 15, fontWeight: 700 },
  planMeta: { color: '#64748b', fontSize: 12, marginLeft: 'auto' },
  success: { background: '#14532d', color: '#86efac', padding: '10px 16px', borderRadius: 8, marginBottom: 16, fontSize: 14 },
  error: { background: '#7f1d1d', color: '#fca5a5', padding: '10px 16px', borderRadius: 8, marginBottom: 16, fontSize: 14 },
  tabs: { display: 'flex', gap: 4, marginBottom: 20, background: '#0f172a', borderRadius: 10, padding: 4 },
  tab: { flex: 1, padding: '10px', background: 'transparent', border: 'none', color: '#64748b', borderRadius: 8, cursor: 'pointer', fontSize: 14, fontWeight: 500 },
  tabActive: { background: '#1e293b', color: '#e2e8f0' },
  card: { background: '#1e293b', borderRadius: 12, padding: 24, marginBottom: 16 },
  cardTitle: { color: '#e2e8f0', fontSize: 15, fontWeight: 600, marginBottom: 16 },
  numForm: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, alignItems: 'end' },
  field: { display: 'flex', flexDirection: 'column', gap: 6 },
  label: { color: '#94a3b8', fontSize: 12, fontWeight: 500 },
  input: { background: '#0f172a', border: '1px solid #334155', borderRadius: 8, padding: '9px 12px', color: '#e2e8f0', fontSize: 13, outline: 'none' },
  select: { background: '#0f172a', border: '1px solid #334155', borderRadius: 8, padding: '9px 12px', color: '#e2e8f0', fontSize: 13, cursor: 'pointer' },
  checkLabel: { display: 'flex', alignItems: 'center', gap: 6, color: '#94a3b8', fontSize: 13, cursor: 'pointer' },
  btnAdd: { background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' },
  numRow: { display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid #0f172a' },
  numIcon: { fontSize: 20 },
  numVal: { color: '#e2e8f0', fontSize: 14, fontWeight: 500 },
  numProvider: { color: '#64748b', fontSize: 12 },
  badge: (color) => ({ background: color, color: '#fff', padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 600 }),
  statusDot: { width: 8, height: 8, borderRadius: '50%', flexShrink: 0 },
  empty: { color: '#64748b', textAlign: 'center', padding: '20px 0', fontSize: 14 },
  hourRow: { display: 'flex', alignItems: 'center', gap: 16, padding: '10px 0', borderBottom: '1px solid #0f172a' },
  dayCheck: { display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', minWidth: 160 },
  dayName: { fontSize: 14, fontWeight: 500 },
  timeInput: { background: '#0f172a', border: '1px solid #334155', borderRadius: 8, padding: '7px 10px', color: '#e2e8f0', fontSize: 13 },
  timeSep: { color: '#64748b' },
  btnSave: { background: '#22c55e', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 20px', fontSize: 14, fontWeight: 600, cursor: 'pointer', marginTop: 16 },
};
