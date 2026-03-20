import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';

/* ─────────────────────────────────────────────
   TYPES
───────────────────────────────────────────── */
interface Account {
  id: string;
  name: string;
  handle: string;
  avatar: string | null;
  email?: string;
}

/* ─────────────────────────────────────────────
   HELPERS
───────────────────────────────────────────── */
const initials = (name: string) =>
  name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

/* ─────────────────────────────────────────────
   SEED DATA
───────────────────────────────────────────── */
const SEED_ACCOUNTS: Account[] = [
  {
    id: 'joshuapaco',
    name: 'Joshua Paco',
    handle: '@joshuapaco',
    avatar: 'https://i.pinimg.com/736x/7e/93/08/7e9308642278a24707bddc9f79ec60c9.jpg',
  },
  {
    id: 'isles',
    name: 'Shad Isles',
    handle: '@shadisles',
    avatar: 'https://i.pinimg.com/1200x/b1/1d/a5/b11da5b570acf34568a8ab0fe8b5917f.jpg',
  },
];

/* ─────────────────────────────────────────────
   AVATAR
───────────────────────────────────────────── */
function Avatar({ account, size = 56 }: { account: Account; size?: number }) {
  return (
    <div style={{ position: 'relative', flexShrink: 0 }}>
      {account.avatar ? (
        <img
          src={account.avatar}
          alt={account.name}
          style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', display: 'block', border: '2px solid #f0f0f0' }}
        />
      ) : (
        <div style={{ width: size, height: size, borderRadius: '50%', background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.3, fontWeight: 700, color: '#fff', border: '2px solid #f0f0f0' }}>
          {initials(account.name)}
        </div>
      )}
      {/* Online indicator */}
      <div style={{ position: 'absolute', bottom: 1, right: 1, width: 10, height: 10, borderRadius: '50%', background: '#22c55e', border: '2px solid #fff' }} />
    </div>
  );
}

/* ─────────────────────────────────────────────
   DIVIDER
───────────────────────────────────────────── */
function Divider() {
  return <div style={{ height: 1, background: '#f3f4f6', margin: '4px 0' }} />;
}

/* ─────────────────────────────────────────────
   MENU ROW
───────────────────────────────────────────── */
function MenuRow({
  icon,
  label,
  sublabel,
  onClick,
  danger = false,
}: {
  icon: React.ReactNode;
  label: string;
  sublabel?: string;
  onClick: () => void;
  danger?: boolean;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <motion.button
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: 14,
        padding: '13px 16px', borderRadius: 14, border: 'none',
        background: hovered ? (danger ? '#fef2f2' : '#f9fafb') : 'transparent',
        cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
        transition: 'background 0.18s',
      }}
    >
      <div style={{ color: hovered ? (danger ? '#ef4444' : '#111') : '#9ca3af', transition: 'color 0.18s', flexShrink: 0, display: 'flex' }}>
        {icon}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 14, fontWeight: 500, color: hovered && danger ? '#ef4444' : '#111', transition: 'color 0.18s', lineHeight: 1.3 }}>
          {label}
        </div>
        {sublabel && <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 1 }}>{sublabel}</div>}
      </div>
      {!danger && (
        <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="#d1d5db" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      )}
    </motion.button>
  );
}

/* ─────────────────────────────────────────────
   PROFILE MODAL
───────────────────────────────────────────── */
function ProfileModal({ account, onClose }: { account: Account; onClose: () => void }) {
  return (
    <>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 300, backdropFilter: 'blur(4px)' }}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.92, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        transition={{ type: 'spring', stiffness: 260, damping: 22 }}
        style={{ position: 'fixed', top: '30%', left: '40%', transform: 'translate(-50%,-50%)', zIndex: 400, background: '#fff', borderRadius: 24, padding: '40px 36px', maxWidth: 340, width: '90%', boxShadow: '0 24px 64px rgba(0,0,0,0.12)', textAlign: 'center' }}
      >
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
          <Avatar account={account} size={80} />
        </div>
        <h3 style={{ fontSize: 20, fontWeight: 700, color: '#111', margin: '0 0 4px' }}>{account.name}</h3>
        <p style={{ fontSize: 13, color: '#9ca3af', margin: '0 0 8px' }}>{account.handle}</p>
        {account.email && <p style={{ fontSize: 13, color: '#6b7280', margin: '0 0 28px' }}>{account.email}</p>}
        <div style={{ background: '#f9fafb', borderRadius: 16, padding: '16px 20px', marginBottom: 24, textAlign: 'left' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#9ca3af', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>Account Info</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontSize: 13, color: '#6b7280' }}>Username</span>
            <span style={{ fontSize: 13, fontWeight: 500, color: '#111' }}>{account.handle}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 13, color: '#6b7280' }}>Role</span>
            <span style={{ fontSize: 13, fontWeight: 500, color: '#111' }}>Staff</span>
          </div>
        </div>
        <button
          onClick={onClose}
          style={{ width: '100%', background: '#111', color: '#fff', border: 'none', borderRadius: 12, padding: '13px', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
        >
          Close
        </button>
      </motion.div>
    </>
  );
}

/* ─────────────────────────────────────────────
   SETTINGS MODAL
───────────────────────────────────────────── */
function SettingsModal({ account, onClose }: { account: Account; onClose: () => void }) {
  const [notifs, setNotifs] = useState(true);
  const [darkMode, setDarkMode] = useState(false);

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 300, backdropFilter: 'blur(4px)' }}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.92, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        transition={{ type: 'spring', stiffness: 260, damping: 22 }}
        style={{ position: 'fixed', top: '30%', left: '40%', transform: 'translate(-50%,-50%)', zIndex: 400, background: '#fff', borderRadius: 24, padding: '36px', maxWidth: 360, width: '90%', boxShadow: '0 24px 64px rgba(0,0,0,0.12)' }}
      >
        <h3 style={{ fontSize: 18, fontWeight: 700, color: '#111', margin: '0 0 24px' }}>Account Settings</h3>

        {/* Toggle rows */}
        {[
          { label: 'Push Notifications', sub: 'Receive order & shift alerts', val: notifs, set: setNotifs },
          { label: 'Dark Mode', sub: 'Coming soon', val: darkMode, set: setDarkMode },
        ].map(item => (
          <div key={item.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 0', borderBottom: '1px solid #f3f4f6' }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 500, color: '#111' }}>{item.label}</div>
              <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 1 }}>{item.sub}</div>
            </div>
            <button
              onClick={() => item.set(!item.val)}
              style={{
                width: 44, height: 24, borderRadius: 30, border: 'none', cursor: 'pointer',
                background: item.val ? '#111' : '#e5e7eb',
                position: 'relative', transition: 'background 0.25s', flexShrink: 0,
              }}
            >
              <motion.div
                animate={{ x: item.val ? 22 : 2 }}
                transition={{ type: 'spring', stiffness: 400, damping: 28 }}
                style={{ position: 'absolute', top: 2, width: 20, height: 20, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 4px rgba(0,0,0,0.18)' }}
              />
            </button>
          </div>
        ))}

        <div style={{ marginTop: 24, display: 'flex', gap: 10 }}>
          <button onClick={onClose} style={{ flex: 1, background: '#f3f4f6', color: '#111', border: 'none', borderRadius: 12, padding: '13px', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
            Cancel
          </button>
          <button onClick={onClose} style={{ flex: 1, background: '#111', color: '#fff', border: 'none', borderRadius: 12, padding: '13px', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
            Save
          </button>
        </div>
      </motion.div>
    </>
  );
}

/* ─────────────────────────────────────────────
   DEVICE MODAL
───────────────────────────────────────────── */
function DeviceModal({ onClose }: { onClose: () => void }) {
  const devices = [
    { name: 'iPhone 15 Pro', last: 'Active now',       type: 'Mobile',  current: true  },
    { name: 'MacBook Pro',   last: '2 hours ago',      type: 'Desktop', current: false },
    { name: 'iPad Air',      last: 'Yesterday, 8:32 PM',type: 'Tablet', current: false },
  ];

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 300, backdropFilter: 'blur(4px)' }}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.92, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        transition={{ type: 'spring', stiffness: 260, damping: 22 }}
        style={{ position: 'fixed', top: '30%', left: '40%', transform: 'translate(-50%,-50%)', zIndex: 400, background: '#fff', borderRadius: 24, padding: '36px', maxWidth: 360, width: '90%', boxShadow: '0 24px 64px rgba(0,0,0,0.12)' }}
      >
        <h3 style={{ fontSize: 18, fontWeight: 700, color: '#111', margin: '0 0 6px' }}>Devices</h3>
        <p style={{ fontSize: 13, color: '#9ca3af', margin: '0 0 24px' }}>Manage where you're signed in</p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {devices.map((d, i) => (
            <motion.div
              key={d.name}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.07 }}
              style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', background: d.current ? '#f9fafb' : '#fff', borderRadius: 14, border: `1px solid ${d.current ? '#e5e7eb' : '#f3f4f6'}` }}
            >
              <div style={{ width: 40, height: 40, borderRadius: 10, background: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>
                {d.type === 'Mobile' ? '📱' : d.type === 'Desktop' ? '💻' : '📲'}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#111', display: 'flex', alignItems: 'center', gap: 6 }}>
                  {d.name}
                  {d.current && <span style={{ fontSize: 10, fontWeight: 600, color: '#22c55e', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 20, padding: '2px 8px' }}>Current</span>}
                </div>
                <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 1 }}>{d.last}</div>
              </div>
              {!d.current && (
                <button style={{ fontSize: 12, color: '#ef4444', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '5px 10px', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 }}>
                  Remove
                </button>
              )}
            </motion.div>
          ))}
        </div>

        <button onClick={onClose} style={{ width: '100%', background: '#111', color: '#fff', border: 'none', borderRadius: 12, padding: '13px', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', marginTop: 24 }}>
          Done
        </button>
      </motion.div>
    </>
  );
}

/* ─────────────────────────────────────────────
   SIGN OUT CONFIRM
───────────────────────────────────────────── */
function SignOutModal({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) {
  return (
    <>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        onClick={onCancel}
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 300, backdropFilter: 'blur(4px)' }}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 24 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.94, y: 12 }}
        transition={{ type: 'spring', stiffness: 260, damping: 22 }}
        style={{ position: 'fixed', top: '30%', left: '40%', transform: 'translate(-50%,-50%)', zIndex: 400, background: '#fff', borderRadius: 24, padding: '36px', maxWidth: 320, width: '90%', boxShadow: '0 24px 64px rgba(0,0,0,0.12)', textAlign: 'center' }}
      >
        <h3 style={{ fontSize: 18, fontWeight: 700, color: '#111', margin: '0 0 8px' }}>Sign out?</h3>
        <p style={{ fontSize: 13, color: '#9ca3af', margin: '0 0 28px', lineHeight: 1.6 }}>
          You'll need to sign back in to access your account.
        </p>
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={onCancel}
            style={{ flex: 1, background: '#f3f4f6', color: '#111', border: 'none', borderRadius: 12, padding: '13px', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            style={{ flex: 1, background: '#ef4444', color: '#fff', border: 'none', borderRadius: 12, padding: '13px', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
          >
            Sign out
          </button>
        </div>
      </motion.div>
    </>
  );
}

/* ─────────────────────────────────────────────
   MAIN
───────────────────────────────────────────── */
export default function StaffAccounts() {
  const navigate = useNavigate();

  // All state in memory — no localStorage
  const [accounts] = useState<Account[]>(SEED_ACCOUNTS);
  const [selectedAccount, setSelectedAccount] = useState<string>(SEED_ACCOUNTS[0]?.id ?? '');
  const [loggedInId] = useState<string>(SEED_ACCOUNTS[0]?.id ?? '');
  const [modal, setModal] = useState<'profile' | 'settings' | 'device' | 'signout' | null>(null);

  const currentAccount = accounts.find((a: Account) => a.id === selectedAccount);

  const handleSignOut = () => {
    navigate('/login');
  };

  if (!currentAccount) return null;

  /* ── SVG icons (no lucide dependency) ── */
  const IconUser = () => (
    <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <circle cx="12" cy="8" r="4"/><path strokeLinecap="round" d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
    </svg>
  );
  const IconSettings = () => (
    <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <circle cx="12" cy="12" r="3"/>
      <path strokeLinecap="round" d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
    </svg>
  );
  const IconDevice = () => (
    <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <rect x="5" y="2" width="14" height="20" rx="2"/><circle cx="12" cy="18" r="1" fill="currentColor"/>
    </svg>
  );
  const IconSignOut = () => (
    <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h6a2 2 0 012 2v1"/>
    </svg>
  );

  return (
    <div style={{ fontFamily: "'Poppins', sans-serif", minHeight: '100vh', background: '#f5f5f7', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
      <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700&display=swap" rel="stylesheet" />

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        style={{ width: '100%', maxWidth: 420, background: '#fff', borderRadius: 28, overflow: 'hidden', boxShadow: '0 4px 32px rgba(0,0,0,0.08)' }}
      >

        {/* ── HEADER ── */}
        <div style={{ padding: '28px 28px 24px', borderBottom: '1px solid #f3f4f6' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <Avatar account={currentAccount} size={60} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <h2 style={{ fontSize: 18, fontWeight: 700, color: '#111', margin: '0 0 2px', letterSpacing: '-0.01em' }}>
                {currentAccount.name}
              </h2>
              <p style={{ fontSize: 13, color: '#9ca3af', margin: 0 }}>{currentAccount.handle}</p>
            </div>
          </div>
        </div>

        {/* ── ACCOUNT SWITCHER ── */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #f3f4f6' }}>
          <p style={{ fontSize: 10, fontWeight: 600, color: '#9ca3af', letterSpacing: '0.1em', textTransform: 'uppercase', margin: '0 0 10px 8px' }}>
            Switch Account
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {accounts.map((account, i) => (
              <motion.button
                key={account.id}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.06, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                onClick={() => setSelectedAccount(account.id)}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 12,
                  padding: '10px 12px', borderRadius: 14, border: 'none',
                  background: selectedAccount === account.id ? '#f9fafb' : 'transparent',
                  cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
                  transition: 'background 0.18s',
                }}
              >
                <Avatar account={account} size={44} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#111', display: 'flex', alignItems: 'center', gap: 6 }}>
                    {account.name}
                    {account.id === loggedInId && (
                      <span style={{ fontSize: 10, fontWeight: 600, color: '#6b7280', background: '#f3f4f6', borderRadius: 20, padding: '2px 8px' }}>
                        You
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 1 }}>{account.handle}</div>
                </div>
                {/* Radio indicator */}
                <div style={{
                  width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
                  border: `2px solid ${selectedAccount === account.id ? '#111' : '#d1d5db'}`,
                  background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'border-color 0.18s',
                }}>
                  <AnimatePresence>
                    {selectedAccount === account.id && (
                      <motion.div
                        initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}
                        transition={{ type: 'spring', stiffness: 400, damping: 28 }}
                        style={{ width: 9, height: 9, borderRadius: '50%', background: '#111' }}
                      />
                    )}
                  </AnimatePresence>
                </div>
              </motion.button>
            ))}
          </div>
        </div>

        {/* ── MENU ── */}
        <div style={{ padding: '12px 20px' }}>
          <MenuRow
            icon={<IconUser />}
            label="My Profile"
            sublabel={currentAccount.handle}
            onClick={() => setModal('profile')}
          />
          <MenuRow
            icon={<IconSettings />}
            label="Account Settings"
            sublabel="Notifications, preferences"
            onClick={() => setModal('settings')}
          />
          <MenuRow
            icon={<IconDevice />}
            label="Device Management"
            sublabel="3 active devices"
            onClick={() => setModal('device')}
          />

          <div style={{ height: 1, background: '#f3f4f6', margin: '8px 0' }} />

          <MenuRow
            icon={<IconSignOut />}
            label="Sign out"
            onClick={() => setModal('signout')}
            danger
          />
        </div>

        {/* ── FOOTER ── */}
        <div style={{ padding: '16px 28px', borderTop: '1px solid #f3f4f6', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: '#111' }}>The Crunch</span>
          <span style={{ fontSize: 12, color: '#d1d5db', fontWeight: 400 }}>v12.8.1</span>
        </div>

      </motion.div>

      {/* ── MODALS ── */}
      <AnimatePresence>
        {modal === 'profile'  && <ProfileModal  account={currentAccount} onClose={() => setModal(null)} />}
        {modal === 'settings' && <SettingsModal account={currentAccount} onClose={() => setModal(null)} />}
        {modal === 'device'   && <DeviceModal   onClose={() => setModal(null)} />}
        {modal === 'signout'  && <SignOutModal   onConfirm={handleSignOut} onCancel={() => setModal(null)} />}
      </AnimatePresence>
    </div>
  );
}