import React, { useState, useEffect } from 'react';
import { Wifi, WifiOff, Clock, ShieldCheck, Server, Monitor } from 'lucide-react';
import { useLicense } from '../contexts/LicenseContext';
import { useNetwork } from '../contexts/NetworkContext';

interface HeaderProps {
  title?: string;
  subtitle?: string;
  actions?: React.ReactNode;
}

export const Header: React.FC<HeaderProps> = ({ title, subtitle, actions }) => {
  const { isActivated, status } = useLicense();
  const { networkInfo } = useNetwork();
  const [currentTime, setCurrentTime] = useState(new Date());
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      clearInterval(timer);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return (
    <header className="h-16 bg-white border-b border-surface-200 px-6 flex items-center justify-between flex-shrink-0 z-10">
      {/* Title & Subtitle */}
      <div className="min-w-0 pr-4">
        {title && (
          <h1 className="text-lg font-bold text-surface-900 leading-tight truncate">
            {title}
          </h1>
        )}
        {subtitle && (
          <p className="text-sm text-surface-500 truncate mt-0.5">
            {subtitle}
          </p>
        )}
      </div>

      {/* Actions & Status Indicator Group */}
      <div className="flex items-center gap-3 flex-shrink-0">
        {actions && (
          <div className="flex items-center gap-2">
            {actions}
          </div>
        )}

        <div className="h-6 w-px bg-surface-200 mx-1 hidden sm:block" />

        {/* License Badge */}
        {isActivated ? (
          <div
            className="h-9 px-3 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200 flex items-center gap-1.5 text-xs font-bold select-none"
            title={`Licensed to ${status?.shop_name || 'Authorized Shop'}`}
          >
            <ShieldCheck className="w-4 h-4 text-emerald-600 flex-shrink-0" />
            <span>Licensed</span>
          </div>
        ) : (
          <div className="h-9 px-3 rounded-lg bg-amber-50 text-amber-800 border border-amber-200 flex items-center gap-1.5 text-xs font-bold select-none">
            <span>Activation Needed</span>
          </div>
        )}

        {/* Shop LAN Multi-Computer Status */}
        <div
          className={`h-9 px-3 rounded-lg border flex items-center gap-1.5 text-xs font-bold select-none ${
            networkInfo?.mode === 'host'
              ? 'bg-primary-50 text-primary-800 border-primary-200'
              : 'bg-indigo-50 text-indigo-800 border-indigo-200'
          }`}
          title={
            networkInfo?.mode === 'host'
              ? `Main Host PC (Port ${networkInfo?.host_port || 4123}) — Local Server Active`
              : `Cashier Client connected to ${networkInfo?.host_ip || 'Host'}`
          }
        >
          {networkInfo?.mode === 'host' ? (
            <>
              <Server className="w-4 h-4 text-primary-600 flex-shrink-0" />
              <span>Shop Host</span>
            </>
          ) : (
            <>
              <Monitor className="w-4 h-4 text-indigo-600 flex-shrink-0" />
              <span>Cashier Client</span>
            </>
          )}
        </div>

        {/* Cloud / Internet Status Indicator */}
        <div
          className="h-9 px-3 rounded-lg bg-surface-50 text-surface-700 border border-surface-200 flex items-center gap-1.5 text-xs font-medium select-none"
          title={isOnline ? 'Internet Active (Cloud sync ready)' : 'Internet Offline (Local billing unaffected)'}
        >
          {isOnline ? (
            <>
              <Wifi className="w-4 h-4 text-emerald-600 flex-shrink-0" />
              <span>Cloud Ready</span>
            </>
          ) : (
            <>
              <WifiOff className="w-4 h-4 text-surface-400 flex-shrink-0" />
              <span>Offline</span>
            </>
          )}
        </div>

        {/* Live Clock */}
        <div className="h-9 px-3 rounded-lg bg-surface-50 border border-surface-200 flex items-center gap-1.5 text-sm font-mono font-bold text-surface-700 select-none">
          <Clock className="w-4 h-4 text-surface-400 flex-shrink-0" />
          <span>
            {currentTime.toLocaleTimeString('en-IN', {
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
              hour12: true,
            })}
          </span>
        </div>
      </div>
    </header>
  );
};
