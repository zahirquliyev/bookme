import React, { useState, useEffect } from 'react';
import api from '../api';

export default function AgentsPage() {
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [newAgent, setNewAgent] = useState(null); // Show SIP creds after creation
  const [error, setError] = useState('');

  const fetch = async () => {
    try {
      const { data } = await api.get('/agents');
      setAgents(data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetch(); }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const { data } = await api.post('/agents', form);
      setNewAgent(data);
      setForm({ name: '', email: '', password: '' });
      setShowForm(false);
      fetch();
    } catch (err) {
      setError(err.response?.data?.error || 'Xəta baş verdi');
    }
  };

  const statusColor = { online: '#22c55e', busy: '#f59e0b', paused: '#94a3b8', offline: '#64748b' };
  const statusLabel = { online: 'Onlayn', busy: 'Məşğul', paused: 'Fasilə', offline: 'Oflayn' };

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <h1 style={styles.heading}>👤 Operatorlar</h1>
        <button style={styles.btnPrimary} onClick={() => setShowForm(!showForm)}>
          {showForm ? '✕ Bağla' : '+ Yeni operator'}
        </button>
      </div>

      {/* New SIP credentials modal */}
      {newAgent && (
        <div style={styles.modal}>
          <div style={styles.modalBox}>
            <h3 style={styles.modalTitle}>✅ Operator yaradıldı!</h3>
            <p style={styles.modalSub}>SIP məlumatlarını saxlayın — şifrə bir daha göstərilməyəcək.</p>
            <div style={styles.sipBox}>
              <SipRow label="SIP İstifadəçi" value={newAgent.sip_username} />
              <SipRow label="SIP Şifrə" value={newAgent.sipPassword} highlight />
              <SipRow label="Daxili nömrə" value={newAgent.extension} />
              <SipRow label="SIP Server" value={window.location.hostname} />
              <SipRow label="Port" value="5060" />
            </div>
            <button style={styles.btnPrimary} onClick={() => setNewAgent(null)}>Anladım</button>
          </div>
        </div>
      )}

      {/* Add form */}
      {showForm && (
        <div style={styles.formCard}>
          <h3 style={styles.formTitle}>Yeni Operator</h3>
          {error && <div style={styles.error}>{error}</div>}
          <form onSubmit={handleCreate} style={styles.formGrid}>
            {[
              { key: 'name',     label: 'Ad Soyad',  placeholder: 'Əli Əliyev' },
              { key: 'email',    label: 'Email',      placeholder: 'ali@restoran.az', type: 'email' },
              { key: 'password', label: 'Şifrə',      placeholder: '••••••••',        type: 'password' },
            ].map(f => (
              <div key={f.key} style={styles.field}>
                <label style={styles.label}>{f.label}</label>
                <input
                  type={f.type || 'text'}
                  value={form[f.key]}
                  onChange={e => setForm({ ...form, [f.key]: e.target.value })}
                  style={styles.input}
                  placeholder={f.placeholder}
                  required
                />
              </div>
            ))}
            <button type="submit" style={styles.btnCreate}>Yarat</button>
          </form>
        </div>
      )}

      {/* Agents list */}
      {loading ? (
        <p style={styles.empty}>Yüklənir...</p>
      ) : agents.length === 0 ? (
        <p style={styles.empty}>Hələ operator yoxdur. İlk operatoru əlavə edin!</p>
      ) : (
        <div style={styles.table}>
          <div style={styles.tableHeader}>
            <span>Ad</span><span>Email</span><span>Ext</span><span>Status</span><span>SIP</span>
          </div>
          {agents.map(agent => (
            <div key={agent.id} style={styles.tableRow}>
              <span style={styles.agentName}>
                <span style={styles.avatar}>{agent.name[0]}</span>
                {agent.name}
              </span>
              <span style={styles.meta}>{agent.email}</span>
              <span style={styles.meta}>📟 {agent.extension}</span>
              <span>
                <span style={{ ...styles.badge, background: statusColor[agent.status] || '#64748b' }}>
                  {statusLabel[agent.status] || agent.status}
                </span>
              </span>
              <span style={styles.sipUser}>{agent.sip_username}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SipRow({ label, value, highlight }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #334155' }}>
      <span style={{ color: '#94a3b8', fontSize: 13 }}>{label}</span>
      <span style={{ color: highlight ? '#22c55e' : '#e2e8f0', fontFamily: 'monospace', fontSize: 13, fontWeight: highlight ? 700 : 400 }}>{value}</span>
    </div>
  );
}

const styles = {
  page: { maxWidth: 1000, margin: '0 auto' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  heading: { color: '#e2e8f0', fontSize: 24, fontWeight: 700 },
  btnPrimary: { background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 18px', fontSize: 14, fontWeight: 600, cursor: 'pointer' },
  modal: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 },
  modalBox: { background: '#1e293b', borderRadius: 16, padding: 32, width: 420, boxShadow: '0 20px 60px rgba(0,0,0,0.5)' },
  modalTitle: { color: '#22c55e', fontSize: 18, fontWeight: 700, marginBottom: 8 },
  modalSub: { color: '#94a3b8', fontSize: 13, marginBottom: 20 },
  sipBox: { background: '#0f172a', borderRadius: 8, padding: 16, marginBottom: 20 },
  formCard: { background: '#1e293b', borderRadius: 12, padding: 24, marginBottom: 24 },
  formTitle: { color: '#e2e8f0', fontSize: 16, fontWeight: 600, marginBottom: 16 },
  error: { background: '#7f1d1d', color: '#fca5a5', padding: '10px 14px', borderRadius: 8, marginBottom: 12, fontSize: 14 },
  formGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: 12, alignItems: 'end' },
  field: { display: 'flex', flexDirection: 'column', gap: 6 },
  label: { color: '#94a3b8', fontSize: 12, fontWeight: 500 },
  input: { background: '#0f172a', border: '1px solid #334155', borderRadius: 8, padding: '9px 12px', color: '#e2e8f0', fontSize: 13, outline: 'none' },
  btnCreate: { background: '#22c55e', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 16px', fontSize: 14, fontWeight: 600, cursor: 'pointer', height: 38 },
  table: { background: '#1e293b', borderRadius: 12, overflow: 'hidden' },
  tableHeader: { display: 'grid', gridTemplateColumns: '2fr 2fr 1fr 1fr 2fr', padding: '12px 20px', background: '#0f172a', color: '#64748b', fontSize: 12, fontWeight: 600, gap: 12 },
  tableRow: { display: 'grid', gridTemplateColumns: '2fr 2fr 1fr 1fr 2fr', padding: '14px 20px', borderBottom: '1px solid #0f172a', alignItems: 'center', gap: 12 },
  agentName: { display: 'flex', alignItems: 'center', gap: 10, color: '#e2e8f0', fontSize: 14, fontWeight: 500 },
  avatar: { width: 30, height: 30, borderRadius: '50%', background: '#3b82f6', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: '#fff', flexShrink: 0 },
  meta: { color: '#94a3b8', fontSize: 13 },
  badge: { padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, color: '#fff' },
  sipUser: { color: '#64748b', fontSize: 11, fontFamily: 'monospace' },
  empty: { color: '#64748b', textAlign: 'center', padding: '40px 0' },
};
