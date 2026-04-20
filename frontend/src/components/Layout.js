import React, { useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const navItems = [
  { to: '/dashboard', icon: '📊', label: 'Dashboard' },
  { to: '/agents',    icon: '👤', label: 'Operatorlar' },
  { to: '/calls',     icon: '📞', label: 'Zənglər' },
  { to: '/settings',  icon: '⚙️', label: 'Tənzimləmələr' },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div style={styles.container}>
      {/* Sidebar */}
      <aside style={{ ...styles.sidebar, width: collapsed ? 64 : 220 }}>
        <div style={styles.logo} onClick={() => setCollapsed(!collapsed)}>
          {collapsed ? '📞' : '📞 CallCenter'}
        </div>

        <nav style={styles.nav}>
          {navItems.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              style={({ isActive }) => ({
                ...styles.navItem,
                background: isActive ? '#1e3a5f' : 'transparent',
                color: isActive ? '#fff' : '#94a3b8',
              })}
            >
              <span style={styles.navIcon}>{item.icon}</span>
              {!collapsed && <span>{item.label}</span>}
            </NavLink>
          ))}
        </nav>

        <div style={styles.userSection}>
          <div style={styles.userInfo}>
            <div style={styles.avatar}>{user?.name?.[0]?.toUpperCase()}</div>
            {!collapsed && (
              <div>
                <div style={styles.userName}>{user?.name}</div>
                <div style={styles.userRole}>{user?.role}</div>
              </div>
            )}
          </div>
          <button onClick={handleLogout} style={styles.logoutBtn} title="Çıxış">
            {collapsed ? '🚪' : '🚪 Çıxış'}
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main style={styles.main}>
        <Outlet />
      </main>
    </div>
  );
}

const styles = {
  container: { display: 'flex', height: '100vh', background: '#0f172a', color: '#e2e8f0', fontFamily: 'system-ui, sans-serif' },
  sidebar: { background: '#1e293b', display: 'flex', flexDirection: 'column', transition: 'width 0.2s', flexShrink: 0, overflow: 'hidden' },
  logo: { padding: '20px 16px', fontSize: 18, fontWeight: 700, color: '#60a5fa', cursor: 'pointer', borderBottom: '1px solid #334155', whiteSpace: 'nowrap' },
  nav: { flex: 1, padding: '12px 8px', display: 'flex', flexDirection: 'column', gap: 4 },
  navItem: { display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 8, textDecoration: 'none', fontSize: 14, fontWeight: 500, transition: 'all 0.15s', whiteSpace: 'nowrap' },
  navIcon: { fontSize: 18, width: 24, textAlign: 'center', flexShrink: 0 },
  userSection: { borderTop: '1px solid #334155', padding: 12 },
  userInfo: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 },
  avatar: { width: 36, height: 36, borderRadius: '50%', background: '#3b82f6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 16, flexShrink: 0 },
  userName: { fontSize: 13, fontWeight: 600, color: '#e2e8f0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 120 },
  userRole: { fontSize: 11, color: '#64748b', textTransform: 'capitalize' },
  logoutBtn: { width: '100%', padding: '8px 12px', background: 'transparent', border: '1px solid #334155', borderRadius: 6, color: '#94a3b8', cursor: 'pointer', fontSize: 13, textAlign: 'left' },
  main: { flex: 1, overflow: 'auto', padding: 24 },
};
