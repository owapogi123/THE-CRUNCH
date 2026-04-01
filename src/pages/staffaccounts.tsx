import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';

interface Account {
  id: string;
  name: string;
  handle: string;
  avatar: string | null;
  email?: string;
  role: 'admin' | 'staff';
}

const initials = (name: string) =>
  name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

const MOCK_ACCOUNTS: Account[] = [
  { id: '1', name: 'Joshua Paco', handle: '@joshuapaco', avatar: null, email: 'josh@thecrunch.com', role: 'admin' },
  { id: '2', name: 'Shad Isles',  handle: '@shadisles',  avatar: null, email: 'shad@thecrunch.com', role: 'staff' },
];

// TODO: wire these up to your backend
const api = {
  fetchAccounts: async (): Promise<Account[]> => MOCK_ACCOUNTS,
  createAccount: async (data: { name: string; email: string; role: 'admin' | 'staff' }): Promise<Account> => ({
    id: String(Date.now()), handle: '@' + data.name.toLowerCase().replace(' ', ''), avatar: null, ...data,
  }),
  signOut: async () => { /* POST /auth/signout */ },
};

function Avatar({ account, size = 56 }: { account: Account; size?: number }) {
  return (
    <div style={{ position: 'relative', flexShrink: 0 }}>
      {account.avatar ? (
        <img src={account.avatar} alt={account.name}
          style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', display: 'block', border: '2px solid #f0f0f0' }} />
      ) : (
        <div style={{ width: size, height: size, borderRadius: '50%', background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.3, fontWeight: 700, color: '#fff', border: '2px solid #f0f0f0' }}>
          {initials(account.name)}
        </div>
      )}
      <div style={{ position: 'absolute', bottom: 1, right: 1, width: 10, height: 10, borderRadius: '50%', background: '#22c55e', border: '2px solid #fff' }} />
    </div>
  );
}

function MenuRow({ icon, label, sublabel, onClick, danger = false }: {
  icon: React.ReactNode; label: string; sublabel?: string; onClick: () => void; danger?: boolean;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <motion.button whileTap={{ scale: 0.98 }} onClick={onClick}
      onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 14, padding: '13px 16px', borderRadius: 14, border: 'none', background: hovered ? (danger ? '#fef2f2' : '#f9fafb') : 'transparent', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', transition: 'background 0.18s' }}
    >
      <div style={{ color: hovered ? (danger ? '#ef4444' : '#111') : '#9ca3af', transition: 'color 0.18s', flexShrink: 0, display: 'flex' }}>{icon}</div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 14, fontWeight: 500, color: hovered && danger ? '#ef4444' : '#111', transition: 'color 0.18s', lineHeight: 1.3 }}>{label}</div>
        {sublabel && <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 1 }}>{sublabel}</div>}
      </div>
      {!danger && <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="#d1d5db" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>}
    </motion.button>
  );
}

function CreateAccountModal({ onClose, onCreate }: {
  onClose: () => void;
  onCreate: (data: { name: string; email: string; role: 'admin' | 'staff' }) => Promise<void>;
}) {
  const [form, setForm] = useState({ name: '', email: '', role: 'staff' as 'admin' | 'staff' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    if (!form.name.trim() || !form.email.trim()) return setError('Name and email are required.');
    setLoading(true);
    try {
      await onCreate(form);
      onClose();
    } catch {
      setError('Failed to create account. Try again.');
    } finally {
      setLoading(false);
    }
  };

  const field = (label: string, key: keyof typeof form, type = 'text') => (
    <div style={{ marginBottom: 14 }}>
      <label style={{ fontSize: 12, fontWeight: 600, color: '#6b7280', display: 'block', marginBottom: 4 }}>{label}</label>
      <input
        type={type}
        value={form[key]}
        onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
        style={{ width: '100%', padding: '10px 12px', border: '1px solid #e5e7eb', borderRadius: 10, fontSize: 14, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }}
      />
    </div>
  );

  return (
    <>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 300, backdropFilter: 'blur(4px)' }} />
      <motion.div initial={{ opacity: 0, scale: 0.92, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 10 }}
        transition={{ type: 'spring', stiffness: 260, damping: 22 }}
        style={{ position: 'fixed', top: '30%', left: '40%', transform: 'translate(-50%,-50%)', zIndex: 400, background: '#fff', borderRadius: 24, padding: '36px', maxWidth: 360, width: '90%', boxShadow: '0 24px 64px rgba(0,0,0,0.12)' }}
      >
        <h3 style={{ fontSize: 18, fontWeight: 700, color: '#111', margin: '0 0 20px' }}>Create Employee Account</h3>

        {field('Full Name', 'name')}
        {field('Email', 'email', 'email')}

        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: '#6b7280', display: 'block', marginBottom: 4 }}>Role</label>
          <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value as 'admin' | 'staff' }))}
            style={{ width: '100%', padding: '10px 12px', border: '1px solid #e5e7eb', borderRadius: 10, fontSize: 14, fontFamily: 'inherit', outline: 'none', background: '#fff' }}>
            <option value="staff">Staff</option>
            <option value="admin">Admin</option>
          </select>
        </div>

        {error && <p style={{ fontSize: 12, color: '#ef4444', margin: '0 0 12px' }}>{error}</p>}

        <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
          <button onClick={onClose} style={{ flex: 1, background: '#f3f4f6', color: '#111', border: 'none', borderRadius: 12, padding: '13px', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
          <button onClick={handleSubmit} disabled={loading}
            style={{ flex: 1, background: '#111', color: '#fff', border: 'none', borderRadius: 12, padding: '13px', fontSize: 14, fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: loading ? 0.6 : 1 }}>
            {loading ? 'Creating…' : 'Create'}
          </button>
        </div>
      </motion.div>
    </>
  );
}

function SignOutModal({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) {
  return (
    <>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onCancel}
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 300, backdropFilter: 'blur(4px)' }} />
      <motion.div initial={{ opacity: 0, scale: 0.9, y: 24 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.94, y: 12 }}
        transition={{ type: 'spring', stiffness: 260, damping: 22 }}
        style={{ position: 'fixed', top: '30%', left: '40%', transform: 'translate(-50%,-50%)', zIndex: 400, background: '#fff', borderRadius: 24, padding: '36px', maxWidth: 320, width: '90%', boxShadow: '0 24px 64px rgba(0,0,0,0.12)', textAlign: 'center' }}
      >
        <h3 style={{ fontSize: 18, fontWeight: 700, color: '#111', margin: '0 0 8px' }}>Sign out?</h3>
        <p style={{ fontSize: 13, color: '#9ca3af', margin: '0 0 28px', lineHeight: 1.6 }}>You'll need to sign back in to access your account.</p>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onCancel} style={{ flex: 1, background: '#f3f4f6', color: '#111', border: 'none', borderRadius: 12, padding: '13px', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
          <button onClick={onConfirm} style={{ flex: 1, background: '#ef4444', color: '#fff', border: 'none', borderRadius: 12, padding: '13px', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Sign out</button>
        </div>
      </motion.div>
    </>
  );
}

export default function StaffAccounts() {
  const navigate = useNavigate();

  // TODO: replace with real auth context — currentUser comes from your auth provider
  const [accounts, setAccounts] = useState<Account[]>(MOCK_ACCOUNTS);
  const currentUser = accounts[0]; // ← swap with useAuth() or similar
  const isAdmin = currentUser?.role === 'admin';

  const [modal, setModal] = useState<'create' | 'signout' | null>(null);

  const handleCreate = async (data: { name: string; email: string; role: 'admin' | 'staff' }) => {
    const newAccount = await api.createAccount(data);
    setAccounts(prev => [...prev, newAccount]);
  };

  const handleSignOut = async () => {
    await api.signOut();
    navigate('/login');
  };

  if (!currentUser) return null;

  const IconUser     = () => <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><circle cx="12" cy="8" r="4"/><path strokeLinecap="round" d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>;
  const IconPlus     = () => <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" d="M12 5v14M5 12h14"/></svg>;
  const IconSignOut  = () => <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h6a2 2 0 012 2v1"/></svg>;

  return (
    <div style={{ fontFamily: "'Poppins', sans-serif", minHeight: '100vh', background: '#f5f5f7', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
      <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700&display=swap" rel="stylesheet" />

      <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        style={{ width: '100%', maxWidth: 420, background: '#fff', borderRadius: 28, overflow: 'hidden', boxShadow: '0 4px 32px rgba(0,0,0,0.08)' }}
      >
        {/* HEADER */}
        <div style={{ padding: '28px 28px 24px', borderBottom: '1px solid #f3f4f6' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <Avatar account={currentUser} size={60} />
            <div style={{ flex: 1 }}>
              <h2 style={{ fontSize: 18, fontWeight: 700, color: '#111', margin: '0 0 2px' }}>{currentUser.name}</h2>
              <p style={{ fontSize: 13, color: '#9ca3af', margin: 0 }}>{currentUser.handle}</p>
            </div>
            {isAdmin && (
              <span style={{ fontSize: 10, fontWeight: 700, color: '#6366f1', background: '#eef2ff', border: '1px solid #c7d2fe', borderRadius: 20, padding: '3px 10px', letterSpacing: '0.05em' }}>
                ADMIN
              </span>
            )}
          </div>
        </div>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #f3f4f6' }}>
          <p style={{ fontSize: 10, fontWeight: 600, color: '#9ca3af', letterSpacing: '0.1em', textTransform: 'uppercase', margin: '0 0 10px 8px' }}>
            Employees ({accounts.length})
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {accounts.map((account, i) => (
              <motion.div key={account.id} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.06 }}
                style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 14, background: account.id === currentUser.id ? '#f9fafb' : 'transparent' }}
              >
                <Avatar account={account} size={44} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#111', display: 'flex', alignItems: 'center', gap: 6 }}>
                    {account.name}
                    {account.id === currentUser.id && (
                      <span style={{ fontSize: 10, color: '#6b7280', background: '#f3f4f6', borderRadius: 20, padding: '2px 8px' }}>You</span>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 1 }}>{account.handle}</div>
                </div>
                <span style={{ fontSize: 10, fontWeight: 600, color: account.role === 'admin' ? '#6366f1' : '#9ca3af', background: account.role === 'admin' ? '#eef2ff' : '#f9fafb', borderRadius: 20, padding: '2px 8px' }}>
                  {account.role}
                </span>
              </motion.div>
            ))}
          </div>
        </div>

        <div style={{ padding: '12px 20px' }}>
          <MenuRow icon={<IconUser />} label="My Profile" sublabel={currentUser.handle} onClick={() => {/* open profile modal */}} />

          {/* Admin-only: Create Account */}
          {isAdmin && (
            <MenuRow icon={<IconPlus />} label="Create Employee Account" sublabel="Admin only" onClick={() => setModal('create')} />
          )}

          <div style={{ height: 1, background: '#f3f4f6', margin: '8px 0' }} />

          <MenuRow icon={<IconSignOut />} label="Sign out" onClick={() => setModal('signout')} danger />
        </div>

        {/* FOOTER */}
        <div style={{ padding: '16px 28px', borderTop: '1px solid #f3f4f6', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: '#111' }}>The Crunch</span>
          <span style={{ fontSize: 12, color: '#d1d5db' }}>v12.8.1</span>
        </div>
      </motion.div>

      {/* MODALS */}
      <AnimatePresence>
        {modal === 'create'  && <CreateAccountModal onClose={() => setModal(null)} onCreate={handleCreate} />}
        {modal === 'signout' && <SignOutModal onConfirm={handleSignOut} onCancel={() => setModal(null)} />}
      </AnimatePresence>
    </div>
  );
}