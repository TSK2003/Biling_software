import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { LicenseProvider, useLicense } from './contexts/LicenseContext';
import { SettingsProvider } from './contexts/SettingsContext';
import { NetworkProvider } from './contexts/NetworkContext';
import { api, isClientMode } from './lib/ipc';
import type { ScreenPermission } from './types';

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
import { ExpensesPage } from './features/expenses/ExpensesPage';

const ProtectedRoute: React.FC<{
  permission?: ScreenPermission;
  adminOnly?: boolean;
  children: React.ReactElement;
}> = ({ permission, adminOnly, children }) => {
  const { user, isAdmin, canAccess, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="h-full w-full flex items-center justify-center">
        <div className="spinner" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (adminOnly && !isAdmin) {
    return <Navigate to="/billing" replace />;
  }

  if (permission && !canAccess(permission)) {
    return <Navigate to="/billing" replace />;
  }

  return children;
};

const AppContent: React.FC = () => {
  const { isActivated, isLoading } = useLicense();

  // Automatic Daily Backup: Runs silently on software launch and continues daily
  React.useEffect(() => {
    if (isActivated && !isClientMode()) {
      api.checkDailyBackup()
        .then((result) => {
          if (result) {
            console.log('[Daily Auto-Backup] Fresh daily snapshot recorded:', result.backup_path);
          }
        })
        .catch((err) => {
          console.warn('[Daily Auto-Backup] Check error:', err);
        });

      // Periodically check every 30 minutes in case the application runs overnight across midnight
      const interval = setInterval(() => {
        api.checkDailyBackup().catch(() => {});
      }, 30 * 60 * 1000);

      return () => clearInterval(interval);
    }
  }, [isActivated]);

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
        <Route
          path="/billing"
          element={
            <ProtectedRoute permission="billing">
              <BillingPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/bills"
          element={
            <ProtectedRoute permission="bills">
              <BillsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/expenses"
          element={
            <ProtectedRoute permission="expenses">
              <ExpensesPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute permission="dashboard">
              <DashboardPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/products"
          element={
            <ProtectedRoute permission="products">
              <ProductsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/categories"
          element={
            <ProtectedRoute permission="categories">
              <CategoriesPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/reports"
          element={
            <ProtectedRoute permission="reports">
              <ReportsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/settings"
          element={
            <ProtectedRoute adminOnly>
              <SettingsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/users"
          element={
            <ProtectedRoute adminOnly>
              <UsersPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/backup"
          element={<Navigate to="/settings?tab=backup" replace />}
        />
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
