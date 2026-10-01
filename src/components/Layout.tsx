import React, { useEffect } from 'react';
import { Outlet, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { useAuth } from '../contexts/AuthContext';
import { useLicense } from '../contexts/LicenseContext';
import { ActivationScreen } from '../features/licensing/ActivationScreen';
import { isClientMode } from '../lib/ipc';

export const Layout: React.FC = () => {
  const { user, isLoading: authLoading } = useAuth();
  const { isActivated, isLoading: licenseLoading } = useLicense();
  const navigate = useNavigate();
  const location = useLocation();

  // Global F2 Shortcut -> Billing (POS)
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F2' || e.code === 'F2' || e.keyCode === 113) {
        e.preventDefault();
        e.stopPropagation();
        if (location.pathname !== '/billing') {
          navigate('/billing');
          setTimeout(() => {
            window.dispatchEvent(new CustomEvent('focus-billing-search'));
          }, 80);
        } else {
          window.dispatchEvent(new CustomEvent('focus-billing-search'));
        }
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown, true);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown, true);
  }, [navigate, location.pathname]);

  if (licenseLoading || authLoading) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-surface-50">
        <div className="spinner mb-3" />
        <div className="text-xs font-medium text-surface-500 tracking-wide">
          Loading Billing Software...
        </div>
      </div>
    );
  }

  // If application is not activated, gate with ActivationScreen
  // Client terminals connected to a Host PC bypass the local USB license gate
  if (!isActivated && !isClientMode()) {
    return <ActivationScreen />;
  }

  // If user is not logged in, redirect to login
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-surface-50">
      <Sidebar />
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Outlet />
      </main>
    </div>
  );
};
