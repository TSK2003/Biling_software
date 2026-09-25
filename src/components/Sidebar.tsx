import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  Layers,
  Receipt,
  FileText,
  Settings,
  Users,
  HardDrive,
  LogOut,
  ShieldCheck,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useSettings } from '../contexts/SettingsContext';

export const Sidebar: React.FC = () => {
  const { user, logout, isAdmin, canAccess } = useAuth();
  const { shopName, settings } = useSettings();
  const navigate = useNavigate();

  const customLogo = settings['shop_logo'];

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const showBillingSection = canAccess('billing') || canAccess('bills') || canAccess('dashboard');
  const showCatalogSection = canAccess('products') || canAccess('categories');
  const showToolsSection = canAccess('reports') || canAccess('backup') || canAccess('users') || canAccess('settings');

  return (
    <aside className="sidebar">
      {/* Brand Header */}
      <div className="sidebar-logo items-center gap-3 py-4 px-4">
        {customLogo ? (
          <div className="w-10 h-10 rounded-lg bg-white border border-surface-200 flex items-center justify-center p-0.5 shadow-sm flex-shrink-0 overflow-hidden">
            <img
              src={customLogo}
              alt={shopName}
              className="w-full h-full object-contain"
            />
          </div>
        ) : (
          <div className="w-10 h-10 rounded-lg bg-primary-600 flex items-center justify-center text-white font-bold text-base shadow-sm flex-shrink-0">
            {shopName ? shopName.charAt(0).toUpperCase() : 'B'}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold text-surface-900 truncate leading-tight">
            {shopName}
          </div>
          <div className="text-xs text-surface-500 font-medium flex items-center gap-1">
            <span>Billing Software</span>
          </div>
        </div>
      </div>

      {/* Main Navigation */}
      <nav className="sidebar-nav">
        {showBillingSection && (
          <>
            <div className="px-4 py-1.5 text-xs font-bold text-surface-400 uppercase tracking-wider">
              Billing & Operations
            </div>

            {canAccess('billing') && (
              <NavLink
                to="/billing"
                className={({ isActive }) => `sidebar-item ${isActive ? 'active' : ''}`}
              >
                {({ isActive }) => (
                  <>
                    <ShoppingCart className="w-5 h-5 flex-shrink-0" />
                    <span>Billing (POS)</span>
                    <span
                      className={`ml-auto text-xs px-2 py-0.5 rounded font-mono font-bold transition-colors ${
                        isActive
                          ? 'bg-primary-100 text-primary-700'
                          : 'bg-surface-100 text-surface-500'
                      }`}
                    >
                      F2
                    </span>
                  </>
                )}
              </NavLink>
            )}

            {canAccess('bills') && (
              <NavLink
                to="/bills"
                className={({ isActive }) => `sidebar-item ${isActive ? 'active' : ''}`}
              >
                <Receipt className="w-5 h-5" />
                <span>Billing History</span>
              </NavLink>
            )}

            {canAccess('dashboard') && (
              <NavLink
                to="/dashboard"
                className={({ isActive }) => `sidebar-item ${isActive ? 'active' : ''}`}
              >
                <LayoutDashboard className="w-5 h-5" />
                <span>Dashboard</span>
              </NavLink>
            )}
          </>
        )}

        {showCatalogSection && (
          <>
            <div className="px-4 pt-4 pb-1.5 text-xs font-bold text-surface-400 uppercase tracking-wider">
              Catalog Management
            </div>

            {canAccess('products') && (
              <NavLink
                to="/products"
                className={({ isActive }) => `sidebar-item ${isActive ? 'active' : ''}`}
              >
                <Package className="w-5 h-5" />
                <span>Products</span>
              </NavLink>
            )}

            {canAccess('categories') && (
              <NavLink
                to="/categories"
                className={({ isActive }) => `sidebar-item ${isActive ? 'active' : ''}`}
              >
                <Layers className="w-5 h-5" />
                <span>Categories</span>
              </NavLink>
            )}
          </>
        )}

        {showToolsSection && (
          <>
            <div className="px-4 pt-4 pb-1.5 text-xs font-bold text-surface-400 uppercase tracking-wider">
              Reports & Tools
            </div>

            {canAccess('reports') && (
              <NavLink
                to="/reports"
                className={({ isActive }) => `sidebar-item ${isActive ? 'active' : ''}`}
              >
                <FileText className="w-5 h-5" />
                <span>Sales Reports</span>
              </NavLink>
            )}

            {canAccess('backup') && (
              <NavLink
                to="/backup"
                className={({ isActive }) => `sidebar-item ${isActive ? 'active' : ''}`}
              >
                <HardDrive className="w-5 h-5" />
                <span>Backup & Import</span>
              </NavLink>
            )}

            {canAccess('users') && (
              <NavLink
                to="/users"
                className={({ isActive }) => `sidebar-item ${isActive ? 'active' : ''}`}
              >
                <Users className="w-5 h-5" />
                <span>Staff & Users</span>
              </NavLink>
            )}

            {canAccess('settings') && (
              <NavLink
                to="/settings"
                className={({ isActive }) => `sidebar-item ${isActive ? 'active' : ''}`}
              >
                <Settings className="w-5 h-5" />
                <span>Settings</span>
              </NavLink>
            )}
          </>
        )}
      </nav>

      {/* User Footer */}
      <div className="p-4 border-t border-surface-200 bg-surface-50/50">
        <div className="flex items-center justify-between">
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-surface-800 truncate flex items-center gap-1">
              <span>{user?.display_name}</span>
              {isAdmin && (
                <span title="Admin">
                  <ShieldCheck className="w-4 h-4 text-primary-600 inline" />
                </span>
              )}
            </div>
            <div className="text-xs text-surface-500 capitalize">
              {user?.role} Role
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="p-2 text-surface-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
            title="Logout"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </div>
    </aside>
  );
};
