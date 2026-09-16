import React from 'react';
import { Outlet, Navigate } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { useAuth } from '../contexts/AuthContext';
import { useLicense } from '../contexts/LicenseContext';
import { ActivationScreen } from '../features/licensing/ActivationScreen';

export const Layout: React.FC = () => {
  const { user, isLoading: authLoading } = useAuth();
  const { isActivated, isLoading: licenseLoading } = useLicense();

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

  // If application is not activated, gate the entire app with ActivationScreen
  if (!isActivated) {
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
