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
    <header className="h-16 bg-white border-b border-surface-200 px-4 lg:px-6 flex items-center justify-between flex-shrink-0 z-10 gap-3">
      {/* Title & Subtitle */}
      <div className="min-w-0 flex-shrink">
        {title && (
          <h1 className="text-base lg:text-lg font-bold text-surface-900 leading-tight truncate">
            {title}
          </h1>
        )}
        {subtitle && (
          <p className="text-xs text-surface-500 truncate hidden sm:block mt-0.5">
            {subtitle}
          </p>
        )}
      </div>

      {/* Actions & Status Indicator Group */}
      <div className="flex items-center gap-2 lg:gap-2.5 flex-shrink-0 ml-auto">
        {actions && (
          <div className="flex items-center gap-2 min-w-0">
            {actions}
          </div>
        )}

        <div className="h-5 w-px bg-surface-200 mx-0.5 hidden sm:block flex-shrink-0" />

        {/* License Badge */}
        {isActivated ? (
          <div
            className="h-8 lg:h-9 px-2.5 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200 flex items-center gap-1.5 text-xs font-bold select-none flex-shrink-0"
            title={`Licensed to ${status?.shop_name || 'Authorized Shop'}`}
          >
            <ShieldCheck className="w-3.5 h-3.5 lg:w-4 lg:h-4 text-emerald-600 flex-shrink-0" />
            <span className="hidden xl:inline">Licensed</span>
          </div>
        ) : (
          <div
            className="h-8 lg:h-9 px-2.5 rounded-lg bg-amber-50 text-amber-800 border border-amber-200 flex items-center gap-1.5 text-xs font-bold select-none flex-shrink-0"
            title="License activation needed"
          >
            <span className="text-xs">Activation Needed</span>
          </div>
        )}

        {/* Shop LAN Multi-Computer Status */}
        <div
          className={`h-8 lg:h-9 px-2.5 rounded-lg border flex items-center gap-1.5 text-xs font-bold select-none flex-shrink-0 ${
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
              <Server className="w-3.5 h-3.5 lg:w-4 lg:h-4 text-primary-600 flex-shrink-0" />
              <span className="hidden xl:inline">Shop Host</span>
            </>
          ) : (
            <>
              <Monitor className="w-3.5 h-3.5 lg:w-4 lg:h-4 text-indigo-600 flex-shrink-0" />
              <span className="hidden xl:inline">Cashier Client</span>
            </>
          )}
        </div>

        {/* Cloud / Internet Status Indicator */}
        <div
          className="h-8 lg:h-9 px-2.5 rounded-lg bg-surface-50 text-surface-700 border border-surface-200 flex items-center gap-1.5 text-xs font-medium select-none flex-shrink-0"
          title={isOnline ? 'Internet Active (Cloud sync ready)' : 'Internet Offline (Local billing unaffected)'}
        >
          {isOnline ? (
            <>
              <Wifi className="w-3.5 h-3.5 lg:w-4 lg:h-4 text-emerald-600 flex-shrink-0" />
              <span className="hidden xl:inline">Cloud Ready</span>
            </>
          ) : (
            <>
              <WifiOff className="w-3.5 h-3.5 lg:w-4 lg:h-4 text-surface-400 flex-shrink-0" />
              <span className="hidden xl:inline">Offline</span>
            </>
          )}
        </div>

        {/* Live Clock — Always visible and securely pinned */}
        <div className="h-8 lg:h-9 px-2.5 lg:px-3 rounded-lg bg-surface-100 border border-surface-200 flex items-center gap-1.5 text-xs lg:text-sm font-mono font-bold text-surface-800 select-none flex-shrink-0 shadow-2xs">
          <Clock className="w-3.5 h-3.5 lg:w-4 lg:h-4 text-primary-600 flex-shrink-0" />
          <span className="whitespace-nowrap">
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
