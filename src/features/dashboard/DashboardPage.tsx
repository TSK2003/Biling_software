import React, { useState, useEffect } from 'react';
import {
  Receipt,
  ShoppingBag,
  CreditCard,
  Banknote,
  QrCode,
  ArrowUpRight,
  Calendar,
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
        api.getDashboardStats(dateFrom, dateTo).catch(() => null),
        api.getRecentBills(8).catch(() => []),
      ]);
      setStats(s || { total_sales_paise: 0, total_bills: 0, total_items_sold: 0, cash_sales_paise: 0, upi_sales_paise: 0, card_sales_paise: 0, total_discount_paise: 0, total_gst_paise: 0, avg_bill_paise: 0 });
      setRecentBills(recent || []);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load dashboard metrics');
      setStats({ total_sales_paise: 0, total_bills: 0, total_items_sold: 0, cash_sales_paise: 0, upi_sales_paise: 0, card_sales_paise: 0, total_discount_paise: 0, total_gst_paise: 0, avg_bill_paise: 0 });
      setRecentBills([]);
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

  // Active date range detection for button highlights
  const now = new Date();
  const curY = now.getFullYear();
  const curM = String(now.getMonth() + 1).padStart(2, '0');
  const curD = String(now.getDate()).padStart(2, '0');
  const isToday = dateFrom === `${curY}-${curM}-${curD}` && dateTo === `${curY}-${curM}-${curD}`;
  const isMonth = dateFrom === `${curY}-${curM}-01` && dateTo === `${curY}-${curM}-${curD}`;
  const isYear = dateFrom === `${curY}-01-01` && dateTo === `${curY}-${curM}-${curD}`;

  return (
    <div className="flex flex-col h-full overflow-hidden bg-surface-50">
      <Header
        title="Operations Dashboard"
        subtitle="Live sales performance, payment channels, and transaction volume"
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            {/* Quick Presets */}
            <div className="flex items-center gap-1 bg-surface-100 p-1 rounded-lg border border-surface-200 h-9">
              <button
                type="button"
                onClick={() => handleSetQuickDate('today')}
                className={`h-7 px-3 text-xs font-semibold rounded-md transition-all cursor-pointer ${
                  isToday
                    ? 'bg-white text-primary-700 shadow-xs font-bold'
                    : 'text-surface-600 hover:text-surface-900'
                }`}
              >
                Today
              </button>
              <button
                type="button"
                onClick={() => handleSetQuickDate('month')}
                className={`h-7 px-3 text-xs font-semibold rounded-md transition-all cursor-pointer ${
                  isMonth && !isToday
                    ? 'bg-white text-primary-700 shadow-xs font-bold'
                    : 'text-surface-600 hover:text-surface-900'
                }`}
              >
                This Month
              </button>
              <button
                type="button"
                onClick={() => handleSetQuickDate('year')}
                className={`h-7 px-3 text-xs font-semibold rounded-md transition-all cursor-pointer ${
                  isYear && !isMonth && !isToday
                    ? 'bg-white text-primary-700 shadow-xs font-bold'
                    : 'text-surface-600 hover:text-surface-900'
                }`}
              >
                This Year
              </button>
            </div>

            {/* Custom From - To Range Filter */}
            <div className="flex items-center gap-1.5 bg-white px-3 py-1 rounded-lg border border-surface-200 shadow-xs h-9">
              <Calendar className="w-3.5 h-3.5 text-primary-600 flex-shrink-0" />
              <div className="flex items-center gap-1 text-xs">
                <span className="text-surface-500 font-medium">From:</span>
                <input
                  type="date"
                  value={dateFrom}
                  max={todayStr}
                  onChange={(e) => {
                    const newFrom = e.target.value;
                    setDateFrom(newFrom);
                    if (newFrom > dateTo) setDateTo(newFrom);
                  }}
                  className="bg-transparent border-0 text-xs font-mono font-semibold text-surface-800 p-0 focus:ring-0 cursor-pointer"
                  title="From Date (up to today)"
                />
              </div>

              <span className="text-surface-300 font-bold">→</span>

              <div className="flex items-center gap-1 text-xs">
                <span className="text-surface-500 font-medium">To:</span>
                <input
                  type="date"
                  value={dateTo}
                  min={dateFrom}
                  max={todayStr}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="bg-transparent border-0 text-xs font-mono font-semibold text-surface-800 p-0 focus:ring-0 cursor-pointer"
                  title="To Date (up to today)"
                />
              </div>
            </div>
          </div>
        }
      />

      <div className="p-6 overflow-y-auto flex-1 space-y-5">
        {/* Metric Cards Grid - Balanced, High-Contrast Premium Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Total Revenue Card */}
          <div className="card p-4 border-t-4 border-primary-600 shadow-xs hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between">
              <span className="text-2xs uppercase tracking-wider font-bold text-surface-500">Total Revenue</span>
              <div className="w-8 h-8 rounded-lg bg-primary-50 text-primary-700 flex items-center justify-center font-bold text-sm">
                ₹
              </div>
            </div>
            <div className="text-2xl font-black font-mono text-surface-950 mt-2">
              {formatCurrency(stats?.total_sales_paise || 0)}
            </div>
            <div className="text-xs text-surface-500 font-medium mt-1 flex items-center justify-between">
              <span>Average Order:</span>
              <span className="font-mono font-bold text-surface-700">{formatCurrency(stats?.avg_bill_paise || 0)}</span>
            </div>
          </div>

          {/* Orders / Bills Count Card */}
          <div className="card p-4 border-t-4 border-indigo-600 shadow-xs hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between">
              <span className="text-2xs uppercase tracking-wider font-bold text-surface-500">Orders / Bills</span>
              <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-700 flex items-center justify-center">
                <Receipt className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-black font-mono text-surface-950 mt-2">
              {stats?.total_bills || 0}
            </div>
            <div className="text-xs text-surface-500 font-medium mt-1">
              Completed transactions
            </div>
          </div>

          {/* Total Items Sold Card */}
          <div className="card p-4 border-t-4 border-emerald-600 shadow-xs hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between">
              <span className="text-2xs uppercase tracking-wider font-bold text-surface-500">Items Sold</span>
              <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center">
                <ShoppingBag className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-black font-mono text-surface-950 mt-2">
              {stats?.total_items_sold || 0}
            </div>
            <div className="text-xs text-surface-500 font-medium mt-1">
              Total units billed
            </div>
          </div>

          {/* Discounts / GST Card */}
          <div className="card p-4 border-t-4 border-amber-600 shadow-xs hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between">
              <span className="text-2xs uppercase tracking-wider font-bold text-surface-500">Total Discounts</span>
              <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-700 flex items-center justify-center">
                <ArrowUpRight className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-black font-mono text-amber-800 mt-2">
              {formatCurrency(stats?.total_discount_paise || 0)}
            </div>
            <div className="text-xs text-surface-500 font-medium mt-1 flex items-center justify-between">
              <span>GST Tax:</span>
              <span className="font-mono font-bold text-surface-700">{formatCurrency(stats?.total_gst_paise || 0)}</span>
            </div>
          </div>
        </div>

        {/* Payment Channels Breakdown */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="card p-4 flex items-center gap-3.5 border-l-4 border-l-emerald-500">
            <div className="w-11 h-11 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center justify-center flex-shrink-0">
              <Banknote className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="text-2xs font-bold text-surface-500 uppercase tracking-wide">Cash Collections</div>
              <div className="text-xl font-black text-surface-950 font-mono mt-0.5">
                {formatCurrency(stats?.cash_sales_paise || 0)}
              </div>
            </div>
          </div>

          <div className="card p-4 flex items-center gap-3.5 border-l-4 border-l-primary-500">
            <div className="w-11 h-11 rounded-xl bg-primary-50 text-primary-700 border border-primary-200 flex items-center justify-center flex-shrink-0">
              <QrCode className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="text-2xs font-bold text-surface-500 uppercase tracking-wide">UPI / QR Collections</div>
              <div className="text-xl font-black text-surface-950 font-mono mt-0.5">
                {formatCurrency(stats?.upi_sales_paise || 0)}
              </div>
            </div>
          </div>

          <div className="card p-4 flex items-center gap-3.5 border-l-4 border-l-purple-500">
            <div className="w-11 h-11 rounded-xl bg-purple-50 text-purple-700 border border-purple-200 flex items-center justify-center flex-shrink-0">
              <CreditCard className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="text-2xs font-bold text-surface-500 uppercase tracking-wide">Card Collections</div>
              <div className="text-xl font-black text-surface-950 font-mono mt-0.5">
                {formatCurrency(stats?.card_sales_paise || 0)}
              </div>
            </div>
          </div>
        </div>

        {/* Recent Transactions Table */}
        <div className="card overflow-hidden">
          <div className="card-header bg-surface-50/70 py-3 px-5 border-b border-surface-200 flex items-center justify-between">
            <div className="text-xs font-black text-surface-900 uppercase tracking-wider">
              Recent Completed Bills
            </div>
            <span className="text-2xs font-semibold text-surface-500 font-mono">
              Showing latest {recentBills.length} transactions
            </span>
          </div>
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th className="w-24">Bill #</th>
                  <th className="w-48">Date & Time</th>
                  <th>Staff Cashier</th>
                  <th className="w-32 text-center">Payment Method</th>
                  <th className="w-36 text-right">Subtotal</th>
                  <th className="w-40 text-right">Grand Total</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={6} className="text-center py-8 text-surface-400">
                      <div className="spinner mx-auto mb-2" />
                      Loading transactions...
                    </td>
                  </tr>
                ) : recentBills.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-8 text-surface-500 text-sm font-medium">
                      No sales transactions recorded in this period.
                    </td>
                  </tr>
                ) : (
                  recentBills.map((b) => (
                    <tr key={b.id} className="hover:bg-surface-50 transition-colors">
                      <td className="font-mono font-bold text-primary-700 text-sm">
                        #{b.bill_number}
                      </td>
                      <td className="text-xs text-surface-700 font-mono font-medium">
                        {b.business_date} {b.bill_time}
                      </td>
                      <td className="text-xs font-semibold text-surface-900">
                        {b.user_name || 'Staff'}
                      </td>
                      <td className="text-center">
                        <span className="badge badge-neutral uppercase font-mono text-2xs font-bold px-2 py-0.5">
                          {b.payment_method?.replace('_', ' + ') || 'Cash'}
                        </span>
                      </td>
                      <td className="text-right font-mono text-xs font-semibold text-surface-700">
                        {formatCurrency(b.subtotal_paise)}
                      </td>
                      <td className="text-right font-mono font-black text-sm text-surface-950">
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
