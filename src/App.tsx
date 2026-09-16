import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider } from './contexts/AuthContext';
import { LicenseProvider, useLicense } from './contexts/LicenseContext';
import { SettingsProvider } from './contexts/SettingsContext';
import { NetworkProvider } from './contexts/NetworkContext';
import { isClientMode } from './lib/ipc';

import { Layout } from './components/Layout';
import { LoginPage } from './features/auth/LoginPage';
import { ActivationScreen } from './features/licensing/ActivationScreen';
import { BillingPage } from './features/billing/BillingPage';
import { BillsPage } from './features/bills/BillsPage';
import { DashboardPage } from './features/dashboard/DashboardPage';
import { ProductsPage } from './features/products/ProductsPage';
import { CategoriesPage } from './features/categories/CategoriesPage';
import { ReportsPage } from './features/reports/ReportsPage';
import { SettingsPage } from './features/settings/SettingsPage';
import { UsersPage } from './features/users/UsersPage';
import { BackupPage } from './features/backup/BackupPage';

const AppContent: React.FC = () => {
  const { isActivated, isLoading } = useLicense();

  if (isLoading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-surface-50">
        <div className="text-center space-y-3">
          <div className="spinner mx-auto" />
          <p className="text-xs text-surface-500 font-medium">Verifying security & licensing...</p>
        </div>
      </div>
    );
  }

  // Security Gate: Strict Activation Required on fresh install or deactivated state
  // Client terminals connected to a Host PC bypass the USB license gate
  if (!isActivated && !isClientMode()) {
    return <ActivationScreen />;
  }

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route element={<Layout />}>
        <Route path="/" element={<Navigate to="/billing" replace />} />
        <Route path="/billing" element={<BillingPage />} />
        <Route path="/bills" element={<BillsPage />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/products" element={<ProductsPage />} />
        <Route path="/categories" element={<CategoriesPage />} />
        <Route path="/reports" element={<ReportsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/users" element={<UsersPage />} />
        <Route path="/backup" element={<BackupPage />} />
      </Route>

      {/* Catch-all fallback */}
      <Route path="*" element={<Navigate to="/billing" replace />} />
    </Routes>
  );
};

export const App: React.FC = () => {
  return (
    <BrowserRouter>
      <LicenseProvider>
        <AuthProvider>
          <SettingsProvider>
            <NetworkProvider>
              {/* Global Toaster */}
              <Toaster
                position="top-right"
                toastOptions={{
                  duration: 3000,
                  style: {
                    background: '#1e293b',
                    color: '#ffffff',
                    fontSize: '13px',
                    borderRadius: '6px',
                    boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                  },
                  success: {
                    iconTheme: {
                      primary: '#22c55e',
                      secondary: '#ffffff',
                    },
                  },
                  error: {
                    iconTheme: {
                      primary: '#ef4444',
                      secondary: '#ffffff',
                    },
                  },
                }}
              />

              {/* Security Gated Application */}
              <AppContent />
            </NetworkProvider>
          </SettingsProvider>
        </AuthProvider>
      </LicenseProvider>
    </BrowserRouter>
  );
};

export default App;
