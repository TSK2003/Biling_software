import React, { useState, useEffect } from 'react';
import {
  TrendingUp,
  Receipt,
  ShoppingBag,
  CreditCard,
  Banknote,
  QrCode,
  ArrowUpRight,
} from 'lucide-react';
import { api } from '../../lib/ipc';
import { formatCurrency, getTodayDateString } from '../../lib/format';
import { Header } from '../../components/Header';
import type { DashboardStats, Bill } from '../../types';
import toast from 'react-hot-toast';

export const DashboardPage: React.FC = () => {
  const todayStr = getTodayDateString();
  const [dateFrom, setDateFrom] = useState(todayStr);
  const [dateTo, setDateTo] = useState(todayStr);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recentBills, setRecentBills] = useState<Bill[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadDashboardData = async () => {
    setIsLoading(true);
    try {
      const [s, recent] = await Promise.all([
        api.getDashboardStats(dateFrom, dateTo),
        api.getRecentBills(8),
      ]);
      setStats(s);
      setRecentBills(recent);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load dashboard metrics');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadDashboardData();
  }, [dateFrom, dateTo]);

  const handleSetQuickDate = (type: 'today' | 'month' | 'year') => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');

    if (type === 'today') {
      setDateFrom(`${y}-${m}-${d}`);
      setDateTo(`${y}-${m}-${d}`);
    } else if (type === 'month') {
      setDateFrom(`${y}-${m}-01`);
      setDateTo(`${y}-${m}-${d}`);
    } else if (type === 'year') {
      setDateFrom(`${y}-01-01`);
      setDateTo(`${y}-${m}-${d}`);
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden bg-surface-50">
      <Header
        title="Operations Dashboard"
        subtitle="Live sales performance, payment channels, and transaction volume"
        actions={
          <div className="flex items-center gap-1 bg-surface-100 p-1 rounded-lg border border-surface-200 h-8">
            <button
              onClick={() => handleSetQuickDate('today')}
              className={`h-6 px-3 text-2xs font-semibold rounded-md transition-colors ${
                dateFrom === todayStr && dateTo === todayStr
                  ? 'bg-white text-primary-700 shadow-xs'
                  : 'text-surface-600 hover:text-surface-900'
              }`}
            >
              Today
            </button>
            <button
              onClick={() => handleSetQuickDate('month')}
              className="h-6 px-3 text-2xs font-semibold rounded-md text-surface-600 hover:text-surface-900 transition-colors"
            >
              This Month
            </button>
            <button
              onClick={() => handleSetQuickDate('year')}
              className="h-6 px-3 text-2xs font-semibold rounded-md text-surface-600 hover:text-surface-900 transition-colors"
            >
              This Year
            </button>
          </div>
        }
      />

      <div className="p-6 overflow-y-auto flex-1 space-y-5">
        {/* Metric Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Total Sales Card */}
          <div className="stat-card bg-gradient-to-br from-primary-600 to-primary-700 text-white border-0">
            <div className="flex items-center justify-between opacity-90">
              <span className="text-2xs uppercase tracking-wider font-semibold">Total Revenue</span>
              <TrendingUp className="w-4 h-4" />
            </div>
            <div className="text-2xl font-bold font-mono mt-2">
              {formatCurrency(stats?.total_sales_paise || 0)}
            </div>
            <div className="text-2xs opacity-80 mt-1">
              Avg Order: {formatCurrency(stats?.avg_bill_paise || 0)}
            </div>
          </div>

          {/* Bills Count Card */}
          <div className="stat-card">
            <div className="flex items-center justify-between text-surface-500">
              <span className="stat-card-label">Orders / Bills</span>
              <Receipt className="w-4 h-4 text-surface-400" />
            </div>
            <div className="stat-card-value font-mono">
              {stats?.total_bills || 0}
            </div>
            <div className="text-2xs text-surface-500 mt-1">
              Completed transactions
            </div>
          </div>

          {/* Total Items Sold Card */}
          <div className="stat-card">
            <div className="flex items-center justify-between text-surface-500">
              <span className="stat-card-label">Items Sold</span>
              <ShoppingBag className="w-4 h-4 text-surface-400" />
            </div>
            <div className="stat-card-value font-mono">
              {stats?.total_items_sold || 0}
            </div>
            <div className="text-2xs text-surface-500 mt-1">
              Total quantity served
            </div>
          </div>

          {/* Discounts / GST Card */}
          <div className="stat-card">
            <div className="flex items-center justify-between text-surface-500">
              <span className="stat-card-label">Total Discounts Given</span>
              <ArrowUpRight className="w-4 h-4 text-surface-400" />
            </div>
            <div className="stat-card-value font-mono text-red-600">
              {formatCurrency(stats?.total_discount_paise || 0)}
            </div>
            <div className="text-2xs text-surface-500 mt-1">
              GST Collected: {formatCurrency(stats?.total_gst_paise || 0)}
            </div>
          </div>
        </div>

        {/* Payment Channels Breakdown */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="card p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded bg-green-50 text-accent-700 flex items-center justify-center">
              <Banknote className="w-5 h-5" />
            </div>
            <div>
              <div className="text-2xs font-semibold text-surface-500 uppercase">Cash Collections</div>
              <div className="text-lg font-bold text-surface-900 font-mono">
                {formatCurrency(stats?.cash_sales_paise || 0)}
              </div>
            </div>
          </div>

          <div className="card p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded bg-blue-50 text-primary-700 flex items-center justify-center">
              <QrCode className="w-5 h-5" />
            </div>
            <div>
              <div className="text-2xs font-semibold text-surface-500 uppercase">UPI / QR Collections</div>
              <div className="text-lg font-bold text-surface-900 font-mono">
                {formatCurrency(stats?.upi_sales_paise || 0)}
              </div>
            </div>
          </div>

          <div className="card p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded bg-purple-50 text-purple-700 flex items-center justify-center">
              <CreditCard className="w-5 h-5" />
            </div>
            <div>
              <div className="text-2xs font-semibold text-surface-500 uppercase">Card Collections</div>
              <div className="text-lg font-bold text-surface-900 font-mono">
                {formatCurrency(stats?.card_sales_paise || 0)}
              </div>
            </div>
          </div>
        </div>

        {/* Recent Transactions Table */}
        <div className="card overflow-hidden">
          <div className="card-header bg-white">
            <div className="text-xs font-bold text-surface-800 uppercase tracking-wide">
              Recent Completed Bills
            </div>
          </div>
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Bill #</th>
                  <th>Date & Time</th>
                  <th>Staff</th>
                  <th>Payment</th>
                  <th>Items / Subtotal</th>
                  <th className="text-right">Grand Total</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={6} className="text-center py-6 text-surface-400">
                      <div className="spinner mx-auto mb-1" />
                      Loading transactions...
                    </td>
                  </tr>
                ) : recentBills.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-6 text-surface-400 text-xs">
                      No sales transactions recorded yet today.
                    </td>
                  </tr>
                ) : (
                  recentBills.map((b) => (
                    <tr key={b.id}>
                      <td className="font-mono font-bold text-primary-700 text-xs">
                        #{b.bill_number}
                      </td>
                      <td className="text-xs text-surface-700 font-mono">
                        {b.business_date} {b.bill_time}
                      </td>
                      <td className="text-xs font-medium text-surface-800">
                        {b.user_name || 'Staff'}
                      </td>
                      <td>
                        <span className="badge badge-neutral uppercase font-mono text-2xs">
                          {b.payment_method || 'Cash'}
                        </span>
                      </td>
                      <td className="font-mono text-xs text-surface-600">
                        {formatCurrency(b.subtotal_paise)}
                      </td>
                      <td className="text-right font-mono font-bold text-xs text-surface-900">
                        {formatCurrency(b.grand_total_paise)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
