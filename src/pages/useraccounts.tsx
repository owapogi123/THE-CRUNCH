import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { User, Settings, Smartphone, LogOut, Check } from 'lucide-react';

interface Account {
  id: string;
  name: string;
  handle: string;
  avatar: string | null;
  email?: string;
}
const AVATAR_INITIALS = (name: string) =>
  name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

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

const AvatarCircle = ({
  account,
  size = 'lg',
}: {
  account: Account;
  size?: 'lg' | 'md';
}) => {
  const sizeClass = size === 'lg' ? 'w-16 h-16 text-xl' : 'w-14 h-14 text-base';
  const badgeClass =
    size === 'lg'
      ? 'absolute -bottom-1 -right-1 w-6 h-6'
      : 'absolute -bottom-1 -right-1 w-5 h-5';

  return (
    <div className="relative">
      {account.avatar ? (
        <img
          src={account.avatar}
          alt={account.name}
          className={`${sizeClass} rounded-full object-cover ring-2 ring-blue-100`}
        />
      ) : (
        <div
          className={`${sizeClass} rounded-full ring-2 ring-blue-100 bg-gradient-to-br from-blue-400 to-indigo-600 flex items-center justify-center font-bold text-white`}
        >
          {AVATAR_INITIALS(account.name)}
        </div>
      )}
      <div
        className={`${badgeClass} bg-blue-500 rounded-full flex items-center justify-center shadow-md`}
      >
        <Check
          className={size === 'lg' ? 'w-3.5 h-3.5 text-white' : 'w-3 h-3 text-white'}
          strokeWidth={3}
        />
      </div>
    </div>
  );
};


export default function UserAccounts() {
  const navigate = useNavigate();

  const loadAccounts = (): Account[] => {
    const saved = localStorage.getItem('userAccounts');
    const savedAccounts: Account[] = saved ? JSON.parse(saved) : [];

    const seedIds = new Set(SEED_ACCOUNTS.map((a) => a.id));
    const uniqueNew = savedAccounts.filter((a) => !seedIds.has(a.id));
    return [...SEED_ACCOUNTS, ...uniqueNew];
  };

  const [accounts, setAccounts] = useState<Account[]>(loadAccounts);

  const getInitialSelected = () => {
    const activeId = localStorage.getItem('activeAccountId');
    if (activeId && accounts.find((a) => a.id === activeId)) return activeId;
    return accounts[0]?.id ?? '';
  };

  const [selectedAccount, setSelectedAccount] = useState<string>(getInitialSelected);
  const [loggedInId] = useState<string | null>(
    localStorage.getItem('activeAccountId')
  );

  useEffect(() => {
    setAccounts(loadAccounts());
  }, []);

  const currentAccount = accounts.find((acc) => acc.id === selectedAccount);

  const handleSignOut = () => {
    const confirmed = window.confirm('Are you sure you want to sign out?');
    if (confirmed) {
      localStorage.removeItem('isAuthenticated');
      localStorage.removeItem('activeAccountId');
      navigate('/login');
    }
  };

  if (!currentAccount) return null;

  return (
    <div
      className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center p-6"
      style={{ fontFamily: 'Poppins, sans-serif' }}
    >
      <div className="w-full max-w-lg">
        <div className="bg-white rounded-t-3xl px-8 py-6 flex items-center gap-4 border-b border-gray-100 shadow-sm">
          <AvatarCircle account={currentAccount} size="lg" />
          <div>
            <h2 className="text-2xl font-semibold text-gray-900">{currentAccount.name}</h2>
            <p className="text-sm text-gray-400">{currentAccount.handle}</p>
          </div>
        </div>
        <div className="bg-white px-6 py-5 border-b border-gray-100">
          <div className="space-y-2">
            {accounts.map((account) => (
              <button
                key={account.id}
                onClick={() => setSelectedAccount(account.id)}
                className="w-full flex items-center gap-4 p-3 rounded-2xl hover:bg-gray-50 transition-all duration-200 group hover:shadow-sm"
              >
                <AvatarCircle account={account} size="md" />

                <div className="flex-1 text-left">
                  <div className="text-base font-semibold text-gray-900 flex items-center gap-2">
                    {account.name}
                    {account.id === loggedInId && (
                      <span className="text-xs bg-blue-50 text-blue-500 px-2 py-0.5 rounded-full font-medium">
                        You
                      </span>
                    )}
                  </div>
                  <div className="text-sm text-gray-500">{account.handle}</div>
                </div>
                <div
                  className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all duration-200 ${
                    selectedAccount === account.id
                      ? 'border-blue-500 bg-blue-500 shadow-sm'
                      : 'border-gray-300 bg-white'
                  }`}
                >
                  {selectedAccount === account.id && (
                    <div className="w-2.5 h-2.5 bg-white rounded-full" />
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>
        <div className="bg-white px-6 py-4">
          <button
            onClick={() => alert(`Navigating to ${currentAccount.name}'s profile`)}
            className="w-full flex items-center gap-4 px-4 py-4 rounded-xl hover:bg-gray-50 transition-all duration-200 group hover:shadow-sm"
          >
            <User className="w-6 h-6 text-gray-500 group-hover:text-blue-600 transition-colors" />
            <span className="flex-1 text-left text-lg font-medium text-gray-700 group-hover:text-gray-900">
              My profile
            </span>
            <span className="text-base text-gray-500">{currentAccount.handle}</span>
          </button>

          <button
            onClick={() => alert('Opening Account Settings')}
            className="w-full flex items-center gap-4 px-4 py-4 rounded-xl hover:bg-gray-50 transition-all duration-200 group hover:shadow-sm"
          >
            <Settings className="w-6 h-6 text-gray-500 group-hover:text-blue-600 transition-colors" />
            <span className="flex-1 text-left text-lg font-medium text-gray-700 group-hover:text-gray-900">
              Account settings
            </span>
          </button>

          <button
            onClick={() => alert('Opening Device Management')}
            className="w-full flex items-center gap-4 px-4 py-4 rounded-xl hover:bg-gray-50 transition-all duration-200 group hover:shadow-sm"
          >
            <Smartphone className="w-6 h-6 text-gray-500 group-hover:text-blue-600 transition-colors" />
            <span className="flex-1 text-left text-lg font-medium text-gray-700 group-hover:text-gray-900">
              Device management
            </span>
          </button>

          <button
            onClick={handleSignOut}
            className="w-full flex items-center gap-4 px-4 py-4 rounded-xl hover:bg-red-50 transition-all duration-200 group hover:shadow-sm"
          >
            <LogOut className="w-6 h-6 text-gray-500 group-hover:text-red-600 transition-colors" />
            <span className="flex-1 text-left text-lg font-medium text-gray-700 group-hover:text-red-600">
              Sign out
            </span>
          </button>
        </div>
        <div className="bg-white rounded-b-3xl px-8 py-5 border-t border-gray-100 flex items-center justify-between shadow-sm">
          <span className="text-lg font-semibold text-gray-900">The Crunch</span>
          <span className="text-base text-gray-500 font-medium">v12.8.1</span>
        </div>
      </div>
    </div>
  );
}