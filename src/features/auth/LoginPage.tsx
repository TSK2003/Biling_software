import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogIn, Lock, User as UserIcon, Server, Monitor, Network, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useSettings } from '../../contexts/SettingsContext';
import { useNetwork } from '../../contexts/NetworkContext';
import { SetupModeModal } from '../network/SetupModeModal';
import { ClientConnectScreen } from '../network/ClientConnectScreen';

export const LoginPage: React.FC = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSetupModalOpen, setIsSetupModalOpen] = useState(false);
  const [showClientConnect, setShowClientConnect] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const { login } = useAuth();
  const { shopName, settings } = useSettings();
  const { networkInfo, setMode, reloadNetworkInfo } = useNetwork();
  const navigate = useNavigate();

  const customLogo = settings['shop_logo'];
  const isClient = networkInfo?.mode === 'client';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) return;

    setIsSubmitting(true);
    try {
      const ok = await login(username.trim(), password);
      if (ok) {
        navigate('/billing');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  if (showClientConnect) {
    return (
      <ClientConnectScreen
        onBackToHost={async () => {
          await setMode('host');
          await reloadNetworkInfo();
          setShowClientConnect(false);
        }}
        onConnected={() => setShowClientConnect(false)}
      />
    );
  }

  return (
    <div className="h-screen w-screen flex items-center justify-center bg-surface-100 p-4 select-none">
      <div className="bg-white rounded-2xl shadow-xl border border-surface-200 p-8 max-w-sm w-full transition-all">
        {/* Customer Shop Header */}
        <div className="text-center mb-6">
          {customLogo ? (
            <div className="flex items-center justify-center mb-3">
              <img
                src={customLogo}
                alt={shopName}
                className="h-14 w-auto max-w-[160px] object-contain rounded-lg shadow-2xs"
              />
            </div>
          ) : (
            <div className="w-12 h-12 rounded-xl bg-primary-600 flex items-center justify-center text-white font-bold text-lg shadow-sm mx-auto mb-3">
              {shopName ? shopName.charAt(0).toUpperCase() : 'S'}
            </div>
          )}
          <h1 className="text-xl font-bold text-surface-900 tracking-tight">{shopName}</h1>
          <p className="text-2xs text-surface-500 font-medium mt-0.5">
            {isClient
              ? `Cashier Counter Terminal • Connected to Host`
              : `Point of Sale • Main Host Terminal`}
          </p>
        </div>

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="form-group">
            <label className="form-label text-xs font-semibold text-surface-700" htmlFor="username">
              Username
            </label>
            <div className="relative">
              <UserIcon className="w-4 h-4 text-surface-400 absolute left-3 top-2.5" />
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="e.g. john_doe"
                className="form-input pl-9 text-xs"
                required
                autoFocus
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label text-xs font-semibold text-surface-700" htmlFor="password">
              Password
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-surface-400 absolute left-3 top-2.5" />
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="form-input pl-9 pr-9 text-xs"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-2.5 text-surface-400 hover:text-surface-600 transition-colors cursor-pointer"
                tabIndex={-1}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmitting || !username || !password}
            className="btn-primary w-full h-9 flex items-center justify-center gap-2 text-xs font-semibold mt-4 shadow-sm"
          >
            {isSubmitting ? (
              <div className="spinner w-4 h-4 border-white" />
            ) : (
              <>
                <LogIn className="w-4 h-4" />
                <span>Sign In to Terminal</span>
              </>
            )}
          </button>
        </form>

        {/* Multi-Computer Network Terminal Switcher */}
        <div className="mt-5 pt-4 border-t border-surface-200 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-2xs font-semibold text-surface-600">
            {isClient ? (
              <>
                <Monitor className="w-3.5 h-3.5 text-indigo-600 flex-shrink-0" />
                <span className="truncate max-w-[130px]">Client Counter</span>
              </>
            ) : (
              <>
                <Server className="w-3.5 h-3.5 text-primary-600 flex-shrink-0" />
                <span>Main Host PC</span>
              </>
            )}
          </div>

          <button
            type="button"
            onClick={() => {
              if (isClient) {
                setShowClientConnect(true);
              } else {
                setIsSetupModalOpen(true);
              }
            }}
            className="text-2xs font-semibold text-primary-600 hover:text-primary-800 hover:underline inline-flex items-center gap-1 transition-colors"
          >
            <Network className="w-3 h-3" />
            <span>{isClient ? 'Configure LAN' : 'Multi-PC Mode'}</span>
          </button>
        </div>
      </div>

      {/* Setup Mode Modal */}
      <SetupModeModal
        isOpen={isSetupModalOpen}
        onClose={() => {
          setIsSetupModalOpen(false);
          if (networkInfo?.mode === 'client') {
            setShowClientConnect(true);
          }
        }}
      />
    </div>
  );
};
