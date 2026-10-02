import React, { useState, useEffect } from 'react';
import {
  Receipt,
  ShoppingBag,
  CreditCard,
  Banknote,
  QrCode,
  ArrowUpRight,
  Calendar,
  Wallet,
  TrendingUp,
  TrendingDown,
} from 'lucide-react';
import { api } from '../../lib/ipc';
import { formatCurrency, getTodayDateString, formatDateDMY, formatPaymentMethod } from '../../lib/format';
import { Header } from '../../components/Header';
import { useSettings } from '../../contexts/SettingsContext';
import type { DashboardStats, Bill } from '../../types';
import toast from 'react-hot-toast';

export const DashboardPage: React.FC = () => {
  const { currencySymbol } = useSettings();
  const todayStr = getTodayDateString();
  const [dateFrom, setDateFrom] = useState(todayStr);
  const [dateTo, setDateTo] = useState(todayStr);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recentBills, setRecentBills] = useState<Bill[]>([]);
  const [totalBillsCount, setTotalBillsCount] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(true);

  // Compute normalized working date range (guarantees from <= to)
  const effectiveFrom = dateFrom && dateTo ? (dateFrom <= dateTo ? dateFrom : dateTo) : (dateFrom || dateTo || todayStr);
  const effectiveTo = dateFrom && dateTo ? (dateFrom <= dateTo ? dateTo : dateFrom) : (dateTo || dateFrom || todayStr);

  const loadDashboardData = async () => {
    setIsLoading(true);
    try {
      const [s, billsRes] = await Promise.all([
        api.getDashboardStats(effectiveFrom, effectiveTo).catch(() => null),
        api.getBills({ dateFrom: effectiveFrom, dateTo: effectiveTo, pageSize: 8 }).catch(() => null),
      ]);
      setStats(
        s || {
          total_sales_paise: 0,
          total_bills: 0,
          total_items_sold: 0,
          cash_sales_paise: 0,
          upi_sales_paise: 0,
          card_sales_paise: 0,
          total_discount_paise: 0,
          total_gst_paise: 0,
          avg_bill_paise: 0,
          total_expenses_paise: 0,
          net_income_paise: 0,
        }
      );
      setRecentBills(billsRes?.data || []);
      setTotalBillsCount(billsRes?.total || 0);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load dashboard metrics');
      setStats({
        total_sales_paise: 0,
        total_bills: 0,
        total_items_sold: 0,
        cash_sales_paise: 0,
        upi_sales_paise: 0,
        card_sales_paise: 0,
        total_discount_paise: 0,
        total_gst_paise: 0,
        avg_bill_paise: 0,
        total_expenses_paise: 0,
        net_income_paise: 0,
      });
      setRecentBills([]);
      setTotalBillsCount(0);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadDashboardData();
  }, [effectiveFrom, effectiveTo]);

  return (
    <div className="flex flex-col h-full overflow-hidden bg-surface-50">
      <Header
        title="Operations Dashboard"
        subtitle="Live sales performance, payment channels, and transaction volume"
        actions={
          <div className="flex items-center gap-2 flex-wrap">

            {/* Custom From - To Range Filter */}
            <div className="flex items-center gap-1.5 bg-white px-3 py-1 rounded-lg border border-surface-200 shadow-xs h-9">
              <Calendar className="w-3.5 h-3.5 text-primary-600 flex-shrink-0" />
              <div className="flex items-center gap-1 text-xs">
                <span className="text-surface-500 font-medium">From:</span>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="bg-transparent border-0 text-xs font-mono font-semibold text-surface-800 p-0 focus:ring-0 cursor-pointer"
                  title="Working From Date"
                />
              </div>

              <span className="text-surface-300 font-bold">→</span>

              <div className="flex items-center gap-1 text-xs">
                <span className="text-surface-500 font-medium">To:</span>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="bg-transparent border-0 text-xs font-mono font-semibold text-surface-800 p-0 focus:ring-0 cursor-pointer"
                  title="Working To Date"
                />
              </div>
            </div>

            {(dateFrom !== todayStr || dateTo !== todayStr) && (
              <button
                type="button"
                onClick={() => {
                  setDateFrom(todayStr);
                  setDateTo(todayStr);
                }}
                className="h-9 px-3 text-xs font-semibold text-surface-600 hover:text-primary-600 bg-white hover:bg-surface-50 rounded-lg border border-surface-200 flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
                title="Reset to today"
              >
                <span>Reset to Today</span>
              </button>
            )}
          </div>
        }
      />

      <div className="p-6 overflow-y-auto flex-1 space-y-5">
        {/* Metric Cards Grid - Balanced, High-Contrast Premium Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Total Revenue Card */}
          <div className="card p-4 border-t-4 border-primary-800 shadow-xs hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between">
              <span className="text-xs uppercase tracking-wider font-bold text-surface-600">Total Revenue</span>
              <div className="w-8 h-8 rounded-lg bg-primary-100 border border-primary-300 text-primary-950 flex items-center justify-center font-bold text-sm shadow-2xs">
                {currencySymbol}
              </div>
            </div>
            <div className="text-2xl font-black font-mono text-surface-950 mt-2">
              {formatCurrency(stats?.total_sales_paise || 0)}
            </div>
            <div className="text-xs text-surface-600 font-medium mt-1 flex items-center justify-between">
              <span>Average Order:</span>
              <span className="font-mono font-bold text-surface-900">{formatCurrency(stats?.avg_bill_paise || 0)}</span>
            </div>
          </div>

          {/* Orders / Bills Count Card */}
          <div className="card p-4 border-t-4 border-indigo-800 shadow-xs hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between">
              <span className="text-xs uppercase tracking-wider font-bold text-surface-600">Orders / Bills</span>
              <div className="w-8 h-8 rounded-lg bg-indigo-100 border border-indigo-300 text-indigo-950 flex items-center justify-center shadow-2xs">
                <Receipt className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-black font-mono text-surface-950 mt-2">
              {stats?.total_bills || 0}
            </div>
            <div className="text-xs text-surface-600 font-medium mt-1">
              Completed transactions
            </div>
          </div>

          {/* Total Items Sold Card */}
          <div className="card p-4 border-t-4 border-emerald-800 shadow-xs hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between">
              <span className="text-xs uppercase tracking-wider font-bold text-surface-600">Items Sold</span>
              <div className="w-8 h-8 rounded-lg bg-emerald-100 border border-emerald-300 text-emerald-950 flex items-center justify-center shadow-2xs">
                <ShoppingBag className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-black font-mono text-surface-950 mt-2">
              {stats?.total_items_sold || 0}
            </div>
            <div className="text-xs text-surface-600 font-medium mt-1">
              Total units billed
            </div>
          </div>

          {/* Discounts / GST Card */}
          <div className="card p-4 border-t-4 border-amber-800 shadow-xs hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between">
              <span className="text-xs uppercase tracking-wider font-bold text-surface-600">Total Discounts</span>
              <div className="w-8 h-8 rounded-lg bg-amber-100 border border-amber-300 text-amber-950 flex items-center justify-center shadow-2xs">
                <ArrowUpRight className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-black font-mono text-amber-950 mt-2">
              {formatCurrency(stats?.total_discount_paise || 0)}
            </div>
            <div className="text-xs text-surface-600 font-medium mt-1 flex items-center justify-between">
              <span>GST Tax:</span>
              <span className="font-mono font-bold text-surface-900">{formatCurrency(stats?.total_gst_paise || 0)}</span>
            </div>
          </div>
        </div>

        {/* Operating Expenses & Net Income Summary Row */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="card p-4 border-l-4 border-l-rose-500 flex items-center justify-between shadow-xs hover:shadow-md transition-shadow">
            <div className="flex items-center gap-3.5">
              <div className="w-11 h-11 rounded-xl bg-rose-50 text-rose-700 border border-rose-200 flex items-center justify-center flex-shrink-0">
                <Wallet className="w-5 h-5" />
              </div>
              <div>
                <div className="text-2xs font-bold text-surface-500 uppercase tracking-wide">Operating Expenses</div>
                <div className="text-xl font-black text-rose-700 font-mono mt-0.5">
                  {formatCurrency(stats?.total_expenses_paise || 0)}
                </div>
              </div>
            </div>
            <span className="text-2xs text-surface-400 font-medium">Recorded Outflows</span>
          </div>

          <div className="card p-4 border-l-4 border-l-emerald-600 flex items-center justify-between shadow-xs hover:shadow-md transition-shadow">
            <div className="flex items-center gap-3.5">
              <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 border ${
                (stats?.net_income_paise ?? 0) >= 0
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : 'bg-red-50 text-red-700 border-red-200'
              }`}>
                {(stats?.net_income_paise ?? 0) >= 0 ? (
                  <TrendingUp className="w-5 h-5" />
                ) : (
                  <TrendingDown className="w-5 h-5" />
                )}
              </div>
              <div>
                <div className="text-2xs font-bold text-surface-500 uppercase tracking-wide">Net Operating Income</div>
                <div className={`text-xl font-black font-mono mt-0.5 ${
                  (stats?.net_income_paise ?? 0) >= 0 ? 'text-emerald-700' : 'text-red-700'
                }`}>
                  {formatCurrency(stats?.net_income_paise ?? (stats?.total_sales_paise || 0))}
                </div>
              </div>
            </div>
            <span className="text-2xs text-surface-400 font-medium">Revenue − Expenses</span>
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
          <div className="card-header bg-surface-50/70 py-3 px-5 border-b border-surface-200 flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <div className="text-xs font-black text-surface-900 uppercase tracking-wider">
                Completed Bills for Selected Period
              </div>
              <span className="text-2xs font-bold text-primary-700 bg-primary-50 px-2 py-0.5 rounded border border-primary-200 font-mono">
                {effectiveFrom === effectiveTo
                  ? formatDateDMY(effectiveFrom)
                  : `${formatDateDMY(effectiveFrom)} → ${formatDateDMY(effectiveTo)}`}
              </span>
            </div>
            <span className="text-2xs font-semibold text-surface-500 font-mono">
              Showing {recentBills.length} of {totalBillsCount} transactions
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
                      No sales transactions recorded for{' '}
                      {effectiveFrom === effectiveTo
                        ? formatDateDMY(effectiveFrom)
                        : `${formatDateDMY(effectiveFrom)} to ${formatDateDMY(effectiveTo)}`}
                      .
                    </td>
                  </tr>
                ) : (
                  recentBills.map((b) => (
                    <tr key={b.id} className="hover:bg-surface-50 transition-colors">
                      <td className="font-mono font-bold text-primary-700 text-xs whitespace-nowrap">
                        Bill: {String(b.bill_number).padStart(5, '0')}
                      </td>
                      <td className="text-xs text-surface-700 font-mono font-medium whitespace-nowrap">
                        {formatDateDMY(b.business_date)} {b.bill_time}
                      </td>
                      <td className="text-xs font-semibold text-surface-900 whitespace-nowrap truncate max-w-[140px]">
                        {b.user_name || 'Staff'}
                      </td>
                      <td className="text-center whitespace-nowrap">
                        <span className="badge badge-neutral text-2xs font-semibold">
                          {formatPaymentMethod(b.payment_method)}
                        </span>
                      </td>
                      <td className="text-right font-mono text-xs font-semibold text-surface-700 whitespace-nowrap">
                        {formatCurrency(b.subtotal_paise)}
                      </td>
                      <td className="text-right font-mono font-black text-sm text-surface-950 whitespace-nowrap">
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
