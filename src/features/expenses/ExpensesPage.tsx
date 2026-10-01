import React, { useState, useEffect, useMemo } from 'react';
import {
  Wallet,
  Plus,
  Search,
  Calendar,
  Layers,
  FileSpreadsheet,
  AlertCircle,
  XCircle,
  Eye,
  Edit2,
  TrendingDown,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Clock,
  Package,
} from 'lucide-react';
import { api } from '../../lib/ipc';
import { Header } from '../../components/Header';
import { Modal } from '../../components/Modal';
import { CustomSelect } from '../../components/CustomSelect';
import { formatDateDMY } from '../../lib/format';
import type {
  Expense,
  ExpenseCategory,
  ExpenseSummary,
  CreateExpenseRequest,
  UpdateExpenseRequest,
  ExpensesFilterRequest,
} from '../../types';
import toast from 'react-hot-toast';

export const ExpensesPage: React.FC = () => {

  // State: Data
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [summary, setSummary] = useState<ExpenseSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);

  // Pagination & Filtering
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const pageSize = 15;

  const getLocalDateString = (d: Date = new Date()) => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const todayStr = useMemo(() => getLocalDateString(), []);
  const monthStartStr = useMemo(() => `${todayStr.slice(0, 7)}-01`, [todayStr]);

  const [dateFilterMode, setDateFilterMode] = useState<'today' | 'yesterday' | 'month' | 'all' | 'custom'>('month');
  const [dateFrom, setDateFrom] = useState(monthStartStr);
  const [dateTo, setDateTo] = useState(todayStr);
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | 'all'>('all');
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('active');
  const [searchQuery, setSearchQuery] = useState('');

  // Modals
  const [isAddEditOpen, setIsAddEditOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);

  // Form State
  const [formDate, setFormDate] = useState(todayStr);
  const [formCategoryId, setFormCategoryId] = useState<number>(0);
  const [formTitle, setFormTitle] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formAmountRupees, setFormAmountRupees] = useState('');
  const [formPaymentMethod, setFormPaymentMethod] = useState('cash');
  const [formPayee, setFormPayee] = useState('');
  const [formRefNumber, setFormRefNumber] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Detail Modal
  const [detailExpense, setDetailExpense] = useState<Expense | null>(null);

  const formatCancellationTime = (timeStr?: string) => {
    if (!timeStr) return '-';
    try {
      const parts = timeStr.trim().split(' ');
      if (parts.length === 2) {
        const [dPart, tPart] = parts;
        const dFormatted = formatDateDMY(dPart);
        const [hh, mm] = tPart.split(':');
        const hour = parseInt(hh, 10);
        const ampm = hour >= 12 ? 'PM' : 'AM';
        const hour12 = hour % 12 || 12;
        return `${dFormatted}, ${String(hour12).padStart(2, '0')}:${mm} ${ampm}`;
      }
      const d = new Date(timeStr);
      if (!isNaN(d.getTime())) {
        return d.toLocaleString('en-IN', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          hour12: true,
        });
      }
      return timeStr;
    } catch {
      return timeStr;
    }
  };

  const formatRecordedDateTime = (timeStr?: string) => {
    if (!timeStr) return '-';
    try {
      const clean = timeStr.trim();
      if (clean.includes(' ')) {
        const parts = clean.split(' ');
        if (parts.length === 2) {
          const [dPart, tPart] = parts;
          const dFormatted = formatDateDMY(dPart);
          const tParts = tPart.split(':');
          if (tParts.length >= 2) {
            const hour = parseInt(tParts[0], 10);
            const mm = tParts[1];
            const ampm = hour >= 12 ? 'PM' : 'AM';
            const hour12 = hour % 12 || 12;
            return `${dFormatted}, ${String(hour12).padStart(2, '0')}:${mm} ${ampm}`;
          }
        }
      }
      const d = new Date(clean.includes('T') ? clean : clean.replace(' ', 'T'));
      if (!isNaN(d.getTime())) {
        return d.toLocaleString('en-IN', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          hour12: true,
        });
      }
      return timeStr;
    } catch {
      return timeStr;
    }
  };

  // Cancellation Modal
  const [cancellingExpense, setCancellingExpense] = useState<Expense | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [isCancelling, setIsCancelling] = useState(false);

  // Category Management Modal
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [newCatDesc, setNewCatDesc] = useState('');
  const [editingCategory, setEditingCategory] = useState<ExpenseCategory | null>(null);
  const [editCatName, setEditCatName] = useState('');
  const [editCatDesc, setEditCatDesc] = useState('');
  const [isSavingCategory, setIsSavingCategory] = useState(false);

  // Quick Preset Change
  const handleDatePreset = (mode: 'today' | 'yesterday' | 'month' | 'all' | 'custom') => {
    setDateFilterMode(mode);
    setPage(1);

    const now = new Date();
    if (mode === 'today') {
      const d = getLocalDateString(now);
      setDateFrom(d);
      setDateTo(d);
    } else if (mode === 'yesterday') {
      const y = new Date(now);
      y.setDate(y.getDate() - 1);
      const d = getLocalDateString(y);
      setDateFrom(d);
      setDateTo(d);
    } else if (mode === 'month') {
      setDateFrom(monthStartStr);
      setDateTo(todayStr);
    } else if (mode === 'all') {
      setDateFrom('');
      setDateTo('');
    }
  };

  // Load Categories
  const loadCategories = async () => {
    try {
      const list = await api.getExpenseCategories(false);
      setCategories(list);
      if (list.length > 0 && formCategoryId === 0) {
        setFormCategoryId(list[0].id);
      }
    } catch (e: any) {
      console.error('Failed to load expense categories:', e);
    }
  };

  // Load Expenses & Summary
  const loadExpenses = async () => {
    setIsLoading(true);
    try {
      const filter: ExpensesFilterRequest = {
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
        category_id: selectedCategoryId === 'all' ? undefined : selectedCategoryId,
        payment_method: selectedPaymentMethod === 'all' ? undefined : selectedPaymentMethod,
        status: selectedStatus === 'all' ? undefined : selectedStatus,
        search: searchQuery.trim() || undefined,
        page,
        page_size: pageSize,
      };

      const [res, sum] = await Promise.all([
        api.getExpenses(filter),
        api.getExpenseSummary(dateFrom || monthStartStr, dateTo || todayStr),
      ]);

      setExpenses(res.data);
      setTotalCount(res.total);
      setTotalPages(res.total_pages);
      setSummary(sum);
    } catch (e: any) {
      toast.error(typeof e === 'string' ? e : 'Failed to load expenses');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadCategories();
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadExpenses();
    }, searchQuery ? 300 : 0);
    return () => clearTimeout(timer);
  }, [dateFrom, dateTo, selectedCategoryId, selectedPaymentMethod, selectedStatus, page, searchQuery]);

  // Handle Search submit
  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    loadExpenses();
  };

  // Open Add Modal
  const handleOpenAdd = () => {
    setEditingExpense(null);
    setFormDate(todayStr);
    if (categories.length > 0) {
      setFormCategoryId(categories[0].id);
    }
    setFormTitle('');
    setFormDescription('');
    setFormAmountRupees('');
    setFormPaymentMethod('cash');
    setFormPayee('');
    setFormRefNumber('');
    setFormNotes('');
    setIsAddEditOpen(true);
  };

  // Open Edit Modal
  const handleOpenEdit = (exp: Expense) => {
    if (exp.status === 'cancelled') {
      toast.error('Cancelled expenses cannot be edited');
      return;
    }
    setEditingExpense(exp);
    setFormDate(exp.expense_date);
    setFormCategoryId(exp.category_id);
    setFormTitle(exp.title);
    setFormDescription(exp.description || '');
    setFormAmountRupees((exp.amount_paise / 100).toString());
    setFormPaymentMethod(exp.payment_method);
    setFormPayee(exp.payee || '');
    setFormRefNumber(exp.reference_number || '');
    setFormNotes(exp.notes || '');
    setIsAddEditOpen(true);
  };

  // Save Expense
  const handleSaveExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    const title = formTitle.trim();
    if (!title) {
      toast.error('Title is required');
      return;
    }

    const amt = parseFloat(formAmountRupees);
    if (isNaN(amt) || amt <= 0) {
      toast.error('Please enter a valid amount greater than 0');
      return;
    }

    const amountPaise = Math.round(amt * 100);

    setIsSubmitting(true);
    try {
      if (editingExpense) {
        const req: UpdateExpenseRequest = {
          id: editingExpense.id,
          expense_date: formDate,
          category_id: formCategoryId,
          title,
          description: formDescription.trim() || undefined,
          amount_paise: amountPaise,
          payment_method: formPaymentMethod,
          payee: formPayee.trim() || undefined,
          reference_number: formRefNumber.trim() || undefined,
          notes: formNotes.trim() || undefined,
        };
        await api.updateExpense(req);
        toast.success('Expense updated successfully');
      } else {
        const req: CreateExpenseRequest = {
          expense_date: formDate,
          category_id: formCategoryId,
          title,
          description: formDescription.trim() || undefined,
          amount_paise: amountPaise,
          payment_method: formPaymentMethod,
          payee: formPayee.trim() || undefined,
          reference_number: formRefNumber.trim() || undefined,
          notes: formNotes.trim() || undefined,
        };
        await api.createExpense(req);
        toast.success('Expense recorded successfully');
      }
      setIsAddEditOpen(false);
      loadExpenses();
    } catch (err: any) {
      toast.error(typeof err === 'string' ? err : 'Failed to save expense');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Cancel Expense Action
  const handleConfirmCancel = async () => {
    if (!cancellingExpense) return;
    if (!cancelReason.trim()) {
      toast.error('Please provide a reason for cancellation');
      return;
    }

    const expNumStr = `EXP-${String(cancellingExpense.expense_number).padStart(4, '0')}`;
    const isStockPurchase = !!(
      cancellingExpense.title?.toLowerCase().includes('stock purchase') ||
      cancellingExpense.notes?.includes('STOCK_PURCHASE') ||
      cancellingExpense.payee?.toLowerCase().includes('restock')
    );
    setIsCancelling(true);
    try {
      await api.cancelExpense(cancellingExpense.id, cancelReason.trim());
      if (isStockPurchase) {
        toast.success(`${expNumStr} cancelled & restocked units removed from inventory!`);
      } else {
        toast.success(`${expNumStr} cancelled & archived in Cancelled History`);
      }
      setCancellingExpense(null);
      setCancelReason('');
      loadExpenses();
    } catch (err: any) {
      toast.error(typeof err === 'string' ? err : 'Failed to cancel expense');
    } finally {
      setIsCancelling(false);
    }
  };

  // Export to Excel
  const handleExportExcel = async () => {
    setIsExporting(true);
    try {
      const from = dateFrom || '2000-01-01';
      const to = dateTo || todayStr;
      const path = await api.exportExpensesExcel(from, to);
      toast.success(`Excel report exported successfully to: ${path}`);
    } catch (err: any) {
      toast.error(typeof err === 'string' ? err : 'Export failed');
    } finally {
      setIsExporting(false);
    }
  };

  // Add Category
  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCatName.trim()) {
      toast.error('Category name is required');
      return;
    }
    setIsSavingCategory(true);
    try {
      await api.createExpenseCategory(newCatName.trim(), newCatDesc.trim() || undefined);
      toast.success('Category created');
      setNewCatName('');
      setNewCatDesc('');
      loadCategories();
    } catch (err: any) {
      toast.error(typeof err === 'string' ? err : 'Failed to create category');
    } finally {
      setIsSavingCategory(false);
    }
  };

  // Update Category
  const handleSaveEditCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCategory || !editCatName.trim()) return;

    setIsSavingCategory(true);
    try {
      await api.updateExpenseCategory(
        editingCategory.id,
        editCatName.trim(),
        editCatDesc.trim() || undefined
      );
      toast.success('Category updated');
      setEditingCategory(null);
      loadCategories();
    } catch (err: any) {
      toast.error(typeof err === 'string' ? err : 'Failed to update category');
    } finally {
      setIsSavingCategory(false);
    }
  };

  // Toggle Category Active
  const handleToggleCategoryActive = async (cat: ExpenseCategory) => {
    try {
      await api.updateExpenseCategory(cat.id, undefined, undefined, undefined, !cat.is_active);
      toast.success(`Category ${cat.name} ${!cat.is_active ? 'activated' : 'deactivated'}`);
      loadCategories();
    } catch (err: any) {
      toast.error(typeof err === 'string' ? err : 'Failed to toggle category');
    }
  };

  return (
    <div className="flex flex-col h-full bg-surface-50 overflow-hidden">
      {/* Page Header */}
      <Header
        title="Expense Management"
        subtitle="Track operating expenditures, petty cash, vendor payments, and category outflows"
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsCategoryModalOpen(true)}
              className="h-8 px-3 text-xs font-semibold bg-white hover:bg-surface-50 text-surface-700 border border-surface-200 rounded-lg transition-all inline-flex items-center gap-1.5 shadow-sm"
              title="Manage Categories"
            >
              <Layers className="w-3.5 h-3.5 text-surface-500" />
              <span>Categories</span>
            </button>

            <button
              onClick={handleExportExcel}
              disabled={isExporting}
              className="h-8 px-3 text-xs font-semibold bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-lg transition-all inline-flex items-center gap-1.5 shadow-sm"
              title="Export filtered records to Excel spreadsheet"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
              <span>{isExporting ? 'Exporting...' : 'Export Excel'}</span>
            </button>

            <button
              onClick={handleOpenAdd}
              className="h-8 px-3 text-xs font-semibold bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-all inline-flex items-center gap-1.5 shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Record Expense</span>
            </button>
          </div>
        }
      />

      <div className="p-6 overflow-y-auto flex-1 w-full space-y-5">
        {/* KPI Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* 1. Today */}
          <div className="bg-white p-4 rounded-xl border border-surface-200 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-2xs font-bold text-surface-400 uppercase tracking-wider">Today's Expenses</p>
              <h3 className="text-xl font-bold text-surface-900 mt-1">
                ₹{((summary?.today_total_paise || 0) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </h3>
              <p className="text-2xs text-surface-500 mt-0.5">
                {summary?.today_count || 0} transaction{summary?.today_count === 1 ? '' : 's'} recorded
              </p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600">
              <Clock className="w-5 h-5" />
            </div>
          </div>

          {/* 2. Month */}
          <div className="bg-white p-4 rounded-xl border border-surface-200 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-2xs font-bold text-surface-400 uppercase tracking-wider">This Month</p>
              <h3 className="text-xl font-bold text-surface-900 mt-1">
                ₹{((summary?.month_total_paise || 0) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </h3>
              <p className="text-2xs text-surface-500 mt-0.5">
                {summary?.month_count || 0} transaction{summary?.month_count === 1 ? '' : 's'} in month
              </p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600">
              <Calendar className="w-5 h-5" />
            </div>
          </div>

          {/* 3. Filtered Total */}
          <div className="bg-white p-4 rounded-xl border border-surface-200 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-2xs font-bold text-surface-400 uppercase tracking-wider">Filtered Period Total</p>
              <h3 className="text-xl font-bold text-primary-600 mt-1">
                ₹{((summary?.range_total_paise || 0) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </h3>
              <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                <span className="text-2xs text-surface-500">
                  {summary?.range_count || 0} active record{summary?.range_count === 1 ? '' : 's'}
                </span>
                {(summary?.cancelled_range_count || 0) > 0 && (
                  <span className="text-3xs font-semibold text-red-600 bg-red-50 px-1.5 py-0.5 rounded border border-red-200">
                    ₹{((summary?.cancelled_range_total_paise || 0) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })} voided ({summary?.cancelled_range_count})
                  </span>
                )}
              </div>
            </div>
            <div className="w-10 h-10 rounded-xl bg-primary-50 border border-primary-200 flex items-center justify-center text-primary-600">
              <TrendingDown className="w-5 h-5" />
            </div>
          </div>

          {/* 4. Top Category */}
          <div className="bg-white p-4 rounded-xl border border-surface-200 shadow-sm flex items-center justify-between">
            <div className="min-w-0 flex-1 pr-2">
              <p className="text-2xs font-bold text-surface-400 uppercase tracking-wider">Top Expense Category</p>
              <h3 className="text-sm font-bold text-surface-900 mt-1 truncate" title={summary?.category_totals?.[0]?.category_name || 'No Data'}>
                {summary?.category_totals?.[0]?.category_name || 'No Data'}
              </h3>
              <p className="text-2xs text-surface-500 mt-0.5">
                {summary?.category_totals?.[0]
                  ? `₹${((summary.category_totals[0].total_paise) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`
                  : 'No expenses'}
              </p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-purple-50 border border-purple-200 flex items-center justify-center text-purple-600 flex-shrink-0">
              <Layers className="w-5 h-5" />
            </div>
          </div>
        </div>

        {/* Filters & Search Toolbar */}
        <div className="bg-white p-3.5 rounded-xl border border-surface-200 shadow-sm space-y-3">
          {/* Row 1: Date Range & Timeline Presets */}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2.5 flex-wrap">
              {/* Jitter-Free Date Preset Buttons */}
              <div className="inline-flex rounded-lg border border-surface-200 p-0.5 bg-surface-100 text-xs font-semibold">
                {(['today', 'yesterday', 'month', 'all', 'custom'] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => handleDatePreset(mode)}
                    className={`px-3 py-1.5 rounded-md capitalize transition-all cursor-pointer text-xs font-semibold border ${
                      dateFilterMode === mode
                        ? 'bg-white text-primary-700 shadow-xs font-bold border-surface-200'
                        : 'text-surface-600 hover:text-surface-900 border-transparent hover:bg-surface-200/50'
                    }`}
                  >
                    {mode === 'month' ? 'This Month' : mode}
                  </button>
                ))}
              </div>

              {/* Custom Date Range Pickers - Seamless and Stable */}
              {dateFilterMode === 'custom' && (
                <div className="flex items-center gap-2 bg-surface-50 px-3 py-1 rounded-lg border border-surface-200 h-8 shadow-2xs">
                  <Calendar className="w-3.5 h-3.5 text-primary-600 flex-shrink-0" />
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => {
                      setDateFrom(e.target.value);
                      setPage(1);
                    }}
                    className="bg-transparent border-0 text-xs font-mono font-semibold text-surface-800 p-0 focus:ring-0 cursor-pointer w-28"
                  />
                  <span className="text-surface-400 text-xs font-medium">to</span>
                  <input
                    type="date"
                    value={dateTo}
                    onChange={(e) => {
                      setDateTo(e.target.value);
                      setPage(1);
                    }}
                    className="bg-transparent border-0 text-xs font-mono font-semibold text-surface-800 p-0 focus:ring-0 cursor-pointer w-28"
                  />
                </div>
              )}
            </div>

            {/* Range indicator hint badge - Never renders raw 'to' text */}
            <div className="text-2xs text-surface-500 font-medium hidden sm:flex items-center gap-1.5 bg-surface-50 px-2.5 py-1.5 rounded-lg border border-surface-200 shadow-2xs">
              <Calendar className="w-3.5 h-3.5 text-surface-400 flex-shrink-0" />
              <span>
                {dateFilterMode === 'today' && "Showing today's transactions"}
                {dateFilterMode === 'yesterday' && "Showing yesterday's transactions"}
                {dateFilterMode === 'month' && "Showing current month transactions"}
                {dateFilterMode === 'all' && "Showing all historical transactions"}
                {dateFilterMode === 'custom' && (dateFrom && dateTo ? `${formatDateDMY(dateFrom)} to ${formatDateDMY(dateTo)}` : 'Select custom date range')}
              </span>
            </div>
          </div>

          {/* Row 2: Search, Category, Payment Method & Reset */}
          <div className="flex items-center gap-3 flex-wrap pt-2.5 border-t border-surface-100">
            {/* Search Input */}
            <form onSubmit={handleSearchSubmit} className="relative flex-1 min-w-[240px] max-w-sm">
              <Search className="w-4 h-4 text-surface-400 absolute left-3 top-2.5 pointer-events-none" />
              <input
                type="text"
                placeholder="Search title, payee, ref #..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setPage(1);
                }}
                className="form-input text-xs pl-9 pr-8 h-9 w-full"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setPage(1);
                  }}
                  className="absolute right-2.5 top-2.5 text-2xs text-surface-400 hover:text-surface-600 font-semibold cursor-pointer"
                >
                  Clear
                </button>
              )}
            </form>

            {/* Category Filter */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-surface-600 whitespace-nowrap">Category:</span>
              <CustomSelect
                value={selectedCategoryId === 'all' ? 'all' : String(selectedCategoryId)}
                onChange={(val) => {
                  setSelectedCategoryId(val === 'all' ? 'all' : Number(val));
                  setPage(1);
                }}
                options={[
                  { value: 'all', label: 'All Categories' },
                  ...categories.map((c) => ({ value: String(c.id), label: c.name })),
                ]}
                className="w-48"
                size="sm"
              />
            </div>

            {/* Payment Method Filter */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-surface-600 whitespace-nowrap">Payment:</span>
              <CustomSelect
                value={selectedPaymentMethod}
                onChange={(val) => {
                  setSelectedPaymentMethod(val);
                  setPage(1);
                }}
                options={[
                  { value: 'all', label: 'All Methods' },
                  { value: 'cash', label: 'Cash' },
                  { value: 'upi', label: 'UPI' },
                  { value: 'card', label: 'Card' },
                  { value: 'bank_transfer', label: 'Bank Transfer' },
                  { value: 'cheque', label: 'Cheque' },
                ]}
                className="w-40"
                size="sm"
              />
            </div>

            {/* Reset Filter Button */}
            <button
              type="button"
              onClick={() => {
                setDateFilterMode('month');
                setDateFrom(monthStartStr);
                setDateTo(todayStr);
                setSelectedCategoryId('all');
                setSelectedPaymentMethod('all');
                setSelectedStatus('active');
                setSearchQuery('');
                setPage(1);
              }}
              className="ml-auto text-xs text-surface-500 hover:text-primary-600 font-semibold transition-colors flex items-center gap-1.5 cursor-pointer py-1.5 px-2 rounded-lg hover:bg-surface-50"
              title="Reset all filters to default"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Reset Filters</span>
            </button>
          </div>
        </div>

        {/* Expenses Table Card with Status Tabs Header */}
        <div className="bg-white rounded-xl border border-surface-200 shadow-sm overflow-hidden">
          {/* Primary Status Navigation Tabs */}
          <div className="flex flex-wrap items-center justify-between border-b border-surface-200 px-4 pt-2 bg-surface-50/60 min-h-[48px]">
            <div className="flex items-center gap-2 -mb-px">
              <button
                type="button"
                onClick={() => {
                  setSelectedStatus('active');
                  setPage(1);
                }}
                className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors duration-150 cursor-pointer rounded-t-md ${
                  selectedStatus === 'active'
                    ? 'border-emerald-600 text-emerald-800 bg-white shadow-xs'
                    : 'border-transparent text-surface-600 hover:text-surface-900 hover:bg-surface-100/70'
                }`}
              >
                <Wallet className="w-4 h-4 text-emerald-600" />
                <span>Active Expenses</span>
                <span
                  className={`px-2 py-0.5 rounded-full text-2xs font-bold ${
                    selectedStatus === 'active'
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-surface-200 text-surface-700'
                  }`}
                >
                  {summary?.range_count || 0}
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setSelectedStatus('cancelled');
                  setPage(1);
                }}
                className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors duration-150 cursor-pointer rounded-t-md ${
                  selectedStatus === 'cancelled'
                    ? 'border-red-600 text-red-700 bg-white shadow-xs'
                    : 'border-transparent text-surface-600 hover:text-red-600 hover:bg-surface-100/70'
                }`}
              >
                <XCircle className="w-4 h-4 text-red-500" />
                <span>Cancelled / Voided History</span>
                <span
                  className={`px-2 py-0.5 rounded-full text-2xs font-bold ${
                    selectedStatus === 'cancelled'
                      ? 'bg-red-100 text-red-800'
                      : 'bg-surface-200 text-surface-700'
                  }`}
                >
                  {summary?.cancelled_range_count || 0}
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setSelectedStatus('all');
                  setPage(1);
                }}
                className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors duration-150 cursor-pointer rounded-t-md ${
                  selectedStatus === 'all'
                    ? 'border-primary-600 text-primary-700 bg-white shadow-xs'
                    : 'border-transparent text-surface-600 hover:text-surface-900 hover:bg-surface-100/70'
                }`}
              >
                <Layers className="w-4 h-4 text-surface-500" />
                <span>All Records</span>
                <span className="px-2 py-0.5 rounded-full text-2xs font-bold bg-surface-200 text-surface-700">
                  {(summary?.range_count || 0) + (summary?.cancelled_range_count || 0)}
                </span>
              </button>
            </div>

            {selectedStatus === 'cancelled' && (summary?.cancelled_range_count || 0) > 0 && (
              <div className="text-2xs font-semibold text-red-700 bg-red-50 px-3 py-1 rounded-md border border-red-200 mb-1 flex items-center gap-1.5 shadow-2xs">
                <XCircle className="w-3.5 h-3.5 text-red-500" />
                <span>
                  Voided in Filter: <strong>₹{((summary?.cancelled_range_total_paise || 0) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong> ({summary?.cancelled_range_count} cancelled)
                </span>
              </div>
            )}
          </div>

          {/* Table Container */}
          <div className="table-container">
            <table className="table w-full">
              <thead>
                {selectedStatus === 'cancelled' ? (
                  <tr>
                    <th className="w-[12%] text-left px-5 py-3 text-2xs font-bold text-surface-600 uppercase tracking-wider bg-surface-50/80 border-b border-surface-200 whitespace-nowrap">
                      Expense #
                    </th>
                    <th className="w-[10%] text-left px-4 py-3 text-2xs font-bold text-surface-600 uppercase tracking-wider bg-surface-50/80 border-b border-surface-200 whitespace-nowrap">
                      Date
                    </th>
                    <th className="w-[14%] text-left px-4 py-3 text-2xs font-bold text-surface-600 uppercase tracking-wider bg-surface-50/80 border-b border-surface-200 whitespace-nowrap">
                      Category
                    </th>
                    <th className="w-[22%] text-left px-4 py-3 text-2xs font-bold text-surface-600 uppercase tracking-wider bg-surface-50/80 border-b border-surface-200 whitespace-nowrap">
                      Title & Payee
                    </th>
                    <th className="w-[12%] text-right px-4 py-3 text-2xs font-bold text-surface-600 uppercase tracking-wider bg-surface-50/80 border-b border-surface-200 whitespace-nowrap">
                      Voided Amount
                    </th>
                    <th className="w-[12%] text-center px-3 py-3 text-2xs font-bold text-surface-600 uppercase tracking-wider bg-surface-50/80 border-b border-surface-200 whitespace-nowrap">
                      Cancelled By & Date
                    </th>
                    <th className="w-[12%] text-center px-3 py-3 text-2xs font-bold text-surface-600 uppercase tracking-wider bg-surface-50/80 border-b border-surface-200 whitespace-nowrap">
                      Cancellation Reason
                    </th>
                    <th className="w-[6%] text-right px-5 py-3 text-2xs font-bold text-surface-600 uppercase tracking-wider bg-surface-50/80 border-b border-surface-200 whitespace-nowrap">
                      View
                    </th>
                  </tr>
                ) : (
                  <tr>
                    <th className="w-[12%] text-left px-5 py-3 text-2xs font-bold text-surface-600 uppercase tracking-wider bg-surface-50/80 border-b border-surface-200 whitespace-nowrap">
                      Expense #
                    </th>
                    <th className="w-[10%] text-left px-4 py-3 text-2xs font-bold text-surface-600 uppercase tracking-wider bg-surface-50/80 border-b border-surface-200 whitespace-nowrap">
                      Date
                    </th>
                    <th className="w-[14%] text-left px-4 py-3 text-2xs font-bold text-surface-600 uppercase tracking-wider bg-surface-50/80 border-b border-surface-200 whitespace-nowrap">
                      Category
                    </th>
                    <th className="w-[22%] text-left px-4 py-3 text-2xs font-bold text-surface-600 uppercase tracking-wider bg-surface-50/80 border-b border-surface-200 whitespace-nowrap">
                      Title & Payee
                    </th>
                    <th className="w-[12%] text-right px-4 py-3 text-2xs font-bold text-surface-600 uppercase tracking-wider bg-surface-50/80 border-b border-surface-200 whitespace-nowrap">
                      Amount
                    </th>
                    <th className="w-[12%] text-center px-3 py-3 text-2xs font-bold text-surface-600 uppercase tracking-wider bg-surface-50/80 border-b border-surface-200 whitespace-nowrap">
                      Payment
                    </th>
                    <th className="w-[12%] text-center px-3 py-3 text-2xs font-bold text-surface-600 uppercase tracking-wider bg-surface-50/80 border-b border-surface-200 whitespace-nowrap">
                      Status
                    </th>
                    <th className="w-[6%] text-right px-5 py-3 text-2xs font-bold text-surface-600 uppercase tracking-wider bg-surface-50/80 border-b border-surface-200 whitespace-nowrap">
                      Actions
                    </th>
                  </tr>
                )}
              </thead>
              <tbody className="divide-y divide-surface-100">
                {isLoading ? (
                  <tr>
                    <td colSpan={8} className="text-center py-12 text-surface-400">
                      <div className="spinner mx-auto mb-2" />
                      Loading expense records...
                    </td>
                  </tr>
                ) : expenses.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center py-12 text-surface-400">
                      {selectedStatus === 'cancelled' ? (
                        <>
                          <XCircle className="w-8 h-8 text-surface-300 mx-auto mb-2" />
                          <p className="font-semibold text-surface-600">No cancelled expenses in this period</p>
                          <p className="text-2xs text-surface-400 mt-1">
                            When an expense is cancelled, it will be securely logged and archived here with its reason.
                          </p>
                        </>
                      ) : (
                        <>
                          <Wallet className="w-8 h-8 text-surface-300 mx-auto mb-2" />
                          <p className="font-semibold text-surface-600">No expense entries found</p>
                          <p className="text-2xs text-surface-400 mt-1">
                            Try adjusting your filters or click "Record Expense" to add a new transaction.
                          </p>
                        </>
                      )}
                    </td>
                  </tr>
                ) : (
                  expenses.map((exp) => {
                    const isCancelled = exp.status === 'cancelled';

                    // Cancelled Tab Custom Row View
                    if (selectedStatus === 'cancelled') {
                      return (
                        <tr
                          key={exp.id}
                          className="transition-colors hover:bg-red-50/40 bg-red-50/15"
                        >
                          {/* 1. Expense # */}
                          <td className="px-5 py-3 font-mono text-xs font-bold text-surface-900">
                            <div className="flex items-center gap-1.5">
                              <span>EXP-{String(exp.expense_number).padStart(4, '0')}</span>
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-3xs font-bold uppercase bg-red-100 text-red-700">
                                Voided
                              </span>
                            </div>
                          </td>

                          {/* 2. Date & Recorded Time */}
                          <td className="px-4 py-3 text-xs text-surface-600 font-mono">
                            <div className="font-semibold text-surface-800">{formatDateDMY(exp.expense_date)}</div>
                            <div className="text-3xs text-surface-400 mt-0.5" title="Original Recorded Date & Time">
                              Rec: {formatRecordedDateTime(exp.created_at)}
                            </div>
                          </td>

                          {/* 3. Category */}
                          <td className="px-4 py-3">
                            <span className="inline-flex items-center px-2 py-0.5 rounded-md text-2xs font-semibold bg-surface-100 text-surface-700 border border-surface-200 truncate max-w-[130px]">
                              {exp.category_name || 'General'}
                            </span>
                          </td>

                          {/* 4. Title & Payee */}
                          <td className="px-4 py-3">
                            <div className="font-medium text-xs text-surface-900 line-clamp-1">
                              {exp.title}
                            </div>
                            {exp.payee && (
                              <div className="text-2xs text-surface-500 flex items-center gap-1 mt-0.5">
                                <span className="font-semibold">Payee:</span> {exp.payee}
                              </div>
                            )}
                          </td>

                          {/* 5. Voided Amount */}
                          <td className="px-4 py-3 text-right">
                            <div className="font-mono font-bold text-xs line-through text-red-600">
                              ₹{(exp.amount_paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                            </div>
                            <span className="text-3xs text-surface-400 block font-medium">Reversed</span>
                          </td>

                          {/* 6. Cancelled At & By */}
                          <td className="px-4 py-3 text-xs text-surface-700">
                            <div className="font-semibold text-2xs text-surface-800">
                              {formatCancellationTime(exp.cancelled_at)}
                            </div>
                            <div className="text-3xs text-red-600 font-semibold mt-0.5">
                              By: {exp.cancelled_by_name || 'Staff User'}
                            </div>
                          </td>

                          {/* 7. Cancellation Reason */}
                          <td className="px-4 py-3">
                            <div
                              className="p-1.5 bg-amber-50 border border-amber-200 rounded-md text-2xs font-medium text-amber-900 line-clamp-2"
                              title={exp.cancelled_reason || 'No reason'}
                            >
                              "{exp.cancelled_reason || 'No reason specified'}"
                            </div>
                          </td>

                          {/* 8. Action */}
                          <td className="px-5 py-3 text-right">
                            <button
                              type="button"
                              onClick={() => setDetailExpense(exp)}
                              className="p-1.5 text-surface-400 hover:text-primary-600 hover:bg-surface-100 rounded-md transition-colors"
                              title="View Full Cancellation Details"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      );
                    }

                    // Active or All Records Row View
                    return (
                      <tr
                        key={exp.id}
                        className={`transition-colors hover:bg-surface-50/70 ${
                          isCancelled ? 'bg-red-50/15' : ''
                        }`}
                      >
                        {/* 1. Expense # */}
                        <td className="px-5 py-3 font-mono text-xs font-bold text-surface-900">
                          EXP-{String(exp.expense_number).padStart(4, '0')}
                        </td>

                        {/* 2. Date */}
                        <td className="px-4 py-3 text-xs text-surface-600 font-mono">
                          {formatDateDMY(exp.expense_date)}
                        </td>

                        {/* 3. Category */}
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-2xs font-semibold bg-surface-100 text-surface-700 border border-surface-200 truncate max-w-[130px]">
                            {exp.category_name || 'General'}
                          </span>
                        </td>

                        {/* 4. Title & Payee */}
                        <td className="px-4 py-3">
                          <div className="font-medium text-xs text-surface-900 line-clamp-1">
                            {exp.title}
                          </div>
                          {exp.payee && (
                            <div className="text-2xs text-surface-500 flex items-center gap-1 mt-0.5">
                              <span className="font-semibold">Payee:</span> {exp.payee}
                            </div>
                          )}
                        </td>

                        {/* 5. Amount */}
                        <td className="px-4 py-3 text-right">
                          <div
                            className={`font-mono font-bold text-xs ${
                              isCancelled ? 'line-through text-red-500' : 'text-surface-900'
                            }`}
                          >
                            ₹{(exp.amount_paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          </div>
                          {isCancelled && <span className="text-3xs text-surface-400 block font-medium">Reversed</span>}
                        </td>

                        {/* 6. Payment Method */}
                        <td className="px-3 py-3 text-center">
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-2xs font-semibold uppercase tracking-wider bg-surface-50 border border-surface-200 text-surface-600">
                            {exp.payment_method.replace('_', ' ')}
                          </span>
                        </td>

                        {/* 7. Status */}
                        <td className="px-3 py-3 text-center">
                          {isCancelled ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-md text-2xs font-semibold bg-red-50 text-red-700 border border-red-200">
                              Cancelled
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-md text-2xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              Active
                            </span>
                          )}
                        </td>

                        {/* 8. Actions */}
                        <td className="px-5 py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              type="button"
                              onClick={() => setDetailExpense(exp)}
                              className="p-1.5 text-surface-400 hover:text-primary-600 hover:bg-surface-100 rounded-md transition-colors"
                              title="View Details"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </button>

                            {!isCancelled && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => handleOpenEdit(exp)}
                                  className="p-1.5 text-surface-400 hover:text-surface-700 hover:bg-surface-100 rounded-md transition-colors"
                                  title="Edit Expense"
                                >
                                  <Edit2 className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setCancellingExpense(exp);
                                    setCancelReason('');
                                  }}
                                  className="p-1.5 text-surface-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
                                  title="Cancel Expense"
                                >
                                  <XCircle className="w-3.5 h-3.5" />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Bar */}
          <div className="px-5 py-3 bg-surface-50/70 border-t border-surface-200 flex items-center justify-between text-xs text-surface-500">
            <div>
              Showing <span className="font-semibold text-surface-700">{expenses.length}</span> of{' '}
              <span className="font-semibold text-surface-700">{totalCount}</span> entries
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="p-1 rounded-md border border-surface-200 bg-white text-surface-600 hover:bg-surface-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="font-medium text-surface-700 text-2xs">
                Page {page} of {Math.max(1, totalPages)}
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="p-1 rounded-md border border-surface-200 bg-white text-surface-600 hover:bg-surface-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Record / Edit Expense Modal */}
      <Modal
        isOpen={isAddEditOpen}
        onClose={() => setIsAddEditOpen(false)}
        title={editingExpense ? `Edit Expense: EXP-${String(editingExpense.expense_number).padStart(4, '0')}` : 'Record New Expense'}
        maxWidth="lg"
        closeOnBackdropClick={false}
      >
        <form onSubmit={handleSaveExpense} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="form-group">
              <label className="form-label text-xs font-semibold">Expense Date *</label>
              <input
                type="date"
                value={formDate}
                onChange={(e) => setFormDate(e.target.value)}
                className="form-input text-sm"
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label text-xs font-semibold">Category *</label>
              <CustomSelect
                value={String(formCategoryId)}
                onChange={(val) => setFormCategoryId(Number(val))}
                options={categories
                  .filter((c) => c.is_active || c.id === formCategoryId)
                  .map((c) => ({ value: String(c.id), label: c.name }))}
                className="w-full"
                size="md"
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label text-xs font-semibold">Title / Description of Expense *</label>
            <input
              type="text"
              value={formTitle}
              onChange={(e) => setFormTitle(e.target.value)}
              placeholder="e.g. Shop Electricity Bill May, Staff Tea, Printer Paper"
              className="form-input text-sm"
              required
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="form-group">
              <label className="form-label text-xs font-semibold">Amount (₹) *</label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-surface-400 font-bold text-xs">₹</span>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={formAmountRupees}
                  onChange={(e) => setFormAmountRupees(e.target.value)}
                  placeholder="0.00"
                  className="form-input text-sm pl-7 font-mono font-bold"
                  required
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label text-xs font-semibold">Payment Method *</label>
              <CustomSelect
                value={formPaymentMethod}
                onChange={setFormPaymentMethod}
                options={[
                  { value: 'cash', label: 'Cash' },
                  { value: 'upi', label: 'UPI' },
                  { value: 'card', label: 'Card' },
                  { value: 'bank_transfer', label: 'Bank Transfer' },
                  { value: 'cheque', label: 'Cheque' },
                ]}
                className="w-full"
                size="md"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="form-group">
              <label className="form-label text-xs font-semibold">Payee / Vendor Name</label>
              <input
                type="text"
                value={formPayee}
                onChange={(e) => setFormPayee(e.target.value)}
                placeholder="e.g. TNEB, Vendor, Landlord"
                className="form-input text-sm"
              />
            </div>

            <div className="form-group">
              <label className="form-label text-xs font-semibold">Invoice / Bill / Txn Ref #</label>
              <input
                type="text"
                value={formRefNumber}
                onChange={(e) => setFormRefNumber(e.target.value)}
                placeholder="e.g. INV-1092 / UPI-998822"
                className="form-input text-sm font-mono"
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label text-xs font-semibold">Additional Notes</label>
            <textarea
              rows={2}
              value={formNotes}
              onChange={(e) => setFormNotes(e.target.value)}
              placeholder="Any additional remarks or authorization info..."
              className="form-input text-sm resize-none"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-surface-100">
            <button
              type="button"
              onClick={() => setIsAddEditOpen(false)}
              className="btn btn-secondary text-xs"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="btn btn-primary text-xs"
            >
              {isSubmitting ? 'Saving...' : editingExpense ? 'Save Changes' : 'Record Expense'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Detail Modal ("Clear One View") */}
      {detailExpense && (
        <Modal
          isOpen={true}
          onClose={() => setDetailExpense(null)}
          title={`Expense Details: EXP-${String(detailExpense.expense_number).padStart(4, '0')}`}
          maxWidth="md"
          closeOnBackdropClick={false}
        >
          <div className="space-y-4">
            {/* Top Status & Amount Banner */}
            <div
              className={`p-4 rounded-xl border text-center transition-all ${
                detailExpense.status === 'cancelled'
                  ? 'bg-red-50/70 border-red-200'
                  : 'bg-emerald-50/50 border-emerald-200'
              }`}
            >
              <p className="text-2xs font-bold text-surface-400 uppercase tracking-wider">
                {detailExpense.status === 'cancelled' ? 'Voided Expense Amount' : 'Total Expense Amount'}
              </p>
              <h2
                className={`text-2xl font-bold font-mono mt-1 ${
                  detailExpense.status === 'cancelled' ? 'line-through text-red-600' : 'text-surface-900'
                }`}
              >
                ₹{(detailExpense.amount_paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </h2>
              <div className="flex items-center justify-center gap-2 mt-2">
                <span
                  className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-2xs font-bold uppercase tracking-wider ${
                    detailExpense.status === 'cancelled'
                      ? 'bg-red-100 text-red-700 border border-red-200'
                      : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                  }`}
                >
                  {detailExpense.status === 'cancelled' ? (
                    <>
                      <XCircle className="w-3 h-3 text-red-600" /> Cancelled / Voided
                    </>
                  ) : (
                    <>
                      <Wallet className="w-3 h-3 text-emerald-600" /> Active Expense
                    </>
                  )}
                </span>
                {detailExpense.status === 'cancelled' && (
                  <span className="text-3xs text-red-600 font-semibold bg-white/80 px-2 py-0.5 rounded border border-red-200">
                    Excluded from financial reports
                  </span>
                )}
              </div>
            </div>

            {/* Prominent Cancellation Audit Section if cancelled */}
            {detailExpense.status === 'cancelled' && (
              <div className="p-3.5 bg-red-50 rounded-xl border border-red-200 space-y-2 text-xs">
                <div className="flex items-center gap-1.5 font-bold text-red-800">
                  <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0" />
                  <span>Audit History & Cancellation Record</span>
                </div>
                <div className="p-3 bg-white rounded-lg border border-red-200 shadow-2xs">
                  <span className="text-3xs text-surface-400 uppercase font-bold block mb-1">
                    Recorded Cancellation Reason:
                  </span>
                  <p className="font-semibold text-red-950 text-xs italic">
                    "{detailExpense.cancelled_reason || 'No reason specified'}"
                  </p>
                </div>
                <div className="flex flex-wrap items-center justify-between text-2xs text-red-700 pt-0.5 px-0.5 gap-2">
                  <span>
                    <strong>Recorded At:</strong> {formatRecordedDateTime(detailExpense.created_at)}
                  </span>
                  <span>
                    <strong>Cancelled At:</strong> {formatCancellationTime(detailExpense.cancelled_at)}
                  </span>
                  <span>
                    <strong>Cancelled By:</strong> {detailExpense.cancelled_by_name || 'Staff User'}
                  </span>
                </div>
              </div>
            )}

            {/* Grid of Transaction Details */}
            <div className="grid grid-cols-2 gap-2.5 text-xs">
              <div className="p-2.5 bg-surface-50/70 rounded-lg border border-surface-100">
                <span className="text-3xs text-surface-400 uppercase font-bold block">Expense Date</span>
                <span className="font-semibold text-surface-800 font-mono">
                  {formatDateDMY(detailExpense.expense_date)}
                </span>
              </div>
              <div className="p-2.5 bg-surface-50/70 rounded-lg border border-surface-100">
                <span className="text-3xs text-surface-400 uppercase font-bold block">Recorded Date & Time</span>
                <span className="font-semibold text-surface-800 font-mono">
                  {formatRecordedDateTime(detailExpense.created_at)}
                </span>
              </div>
              <div className="p-2.5 bg-surface-50/70 rounded-lg border border-surface-100">
                <span className="text-3xs text-surface-400 uppercase font-bold block">Category</span>
                <span className="font-semibold text-surface-800">{detailExpense.category_name || 'General'}</span>
              </div>
              <div className="p-2.5 bg-surface-50/70 rounded-lg border border-surface-100">
                <span className="text-3xs text-surface-400 uppercase font-bold block">Payment Method</span>
                <span className="font-semibold text-surface-800 uppercase">
                  {detailExpense.payment_method.replace('_', ' ')}
                </span>
              </div>
              <div className="p-2.5 bg-surface-50/70 rounded-lg border border-surface-100">
                <span className="text-3xs text-surface-400 uppercase font-bold block">Paid By (Staff)</span>
                <span className="font-semibold text-surface-800">
                  {detailExpense.paid_by_name || 'User #' + detailExpense.paid_by_user_id}
                </span>
              </div>
              <div className="p-2.5 bg-surface-50/70 rounded-lg border border-surface-100">
                <span className="text-3xs text-surface-400 uppercase font-bold block">Payee / Vendor</span>
                <span className="font-semibold text-surface-800">{detailExpense.payee || '-'}</span>
              </div>
              <div className="p-2.5 bg-surface-50/70 rounded-lg border border-surface-100">
                <span className="text-3xs text-surface-400 uppercase font-bold block">Reference #</span>
                <span className="font-mono font-semibold text-surface-800">
                  {detailExpense.reference_number || '-'}
                </span>
              </div>
            </div>

            {/* Title & Notes */}
            <div className="p-2.5 bg-surface-50/70 rounded-lg border border-surface-100 text-xs">
              <span className="text-3xs text-surface-400 uppercase font-bold block mb-1">
                Title & Description
              </span>
              <p className="font-semibold text-surface-900">{detailExpense.title}</p>
              {detailExpense.description && (
                <p className="text-surface-600 mt-1 text-2xs">{detailExpense.description}</p>
              )}
              {detailExpense.notes && (
                <p className="text-surface-500 mt-1 text-3xs italic">Notes: {detailExpense.notes}</p>
              )}
            </div>

            {/* Creation Audit */}
            <div className="text-3xs text-surface-400 flex items-center justify-between px-1">
              <span>Recorded by: {detailExpense.created_by_name || 'System User'}</span>
              <span>Recorded on: {formatRecordedDateTime(detailExpense.created_at)}</span>
            </div>

            {/* Footer with properly aligned buttons */}
            <div className="flex items-center justify-between pt-2 border-t border-surface-100">
              {detailExpense.status === 'active' ? (
                <button
                  type="button"
                  onClick={() => {
                    const exp = detailExpense;
                    setDetailExpense(null);
                    setCancellingExpense(exp);
                    setCancelReason('');
                  }}
                  className="text-xs text-red-600 hover:text-red-700 font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <XCircle className="w-3.5 h-3.5" />
                  <span>Cancel this Expense</span>
                </button>
              ) : (
                <span className="text-2xs text-surface-400 italic">This record is cancelled and read-only.</span>
              )}

              <button
                type="button"
                onClick={() => setDetailExpense(null)}
                className="btn-secondary h-9 px-4 text-xs font-semibold rounded-lg"
              >
                Close
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Cancellation Prompt Modal */}
      {cancellingExpense && (
        <Modal
          isOpen={true}
          onClose={() => setCancellingExpense(null)}
          title={`Cancel Expense: EXP-${String(cancellingExpense.expense_number).padStart(4, '0')}`}
          maxWidth="sm"
          closeOnBackdropClick={false}
        >
          <div className="space-y-4">
            {/* Warning Banner */}
            <div className="flex items-start gap-3 p-3 bg-amber-50 rounded-xl border border-amber-200 text-amber-800 text-xs">
              <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">Are you sure you want to cancel this expense?</p>
                <p className="mt-0.5 text-amber-700">
                  The amount of ₹{(cancellingExpense.amount_paise / 100).toFixed(2)} will be removed from financial summaries and preserved in Cancelled History.
                </p>
              </div>
            </div>

            {/* Inventory Stock Reversal Notice for Stock Purchases */}
            {(cancellingExpense.title?.toLowerCase().includes('stock purchase') ||
              cancellingExpense.notes?.includes('STOCK_PURCHASE') ||
              cancellingExpense.payee?.toLowerCase().includes('restock')) && (
              <div className="flex items-start gap-2.5 p-3 bg-red-50 rounded-xl border border-red-200 text-red-800 text-xs">
                <Package className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold">Inventory Stock Reversal</p>
                  <p className="mt-0.5 text-red-700">
                    This expense is linked to a product purchase/restock. Voiding this expense will automatically deduct and remove the restocked units from product stock!
                  </p>
                </div>
              </div>
            )}

            {/* Mini Expense Summary Preview */}
            <div className="p-3 bg-surface-50 rounded-xl border border-surface-200 text-xs space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-mono font-bold text-surface-900">
                  EXP-{String(cancellingExpense.expense_number).padStart(4, '0')}
                </span>
                <span className="font-mono font-bold text-red-600 text-sm">
                  ₹{(cancellingExpense.amount_paise / 100).toFixed(2)}
                </span>
              </div>
              <p className="font-medium text-surface-800 truncate">{cancellingExpense.title}</p>
              <div className="flex items-center gap-2 text-3xs text-surface-500 font-semibold uppercase">
                <span>{cancellingExpense.category_name || 'General'}</span>
                <span>•</span>
                <span>{formatDateDMY(cancellingExpense.expense_date)}</span>
                <span>•</span>
                <span>{cancellingExpense.payment_method.replace('_', ' ')}</span>
              </div>
            </div>

            {/* Reason Form */}
            <div className="form-group">
              <div className="flex items-center justify-between mb-1">
                <label className="form-label text-xs font-semibold mb-0">Cancellation Reason *</label>
                <span className="text-3xs text-surface-400">Required for audit history</span>
              </div>
              <textarea
                rows={3}
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="e.g. Duplicate entry, Wrong amount, Returned refund..."
                className="form-input text-xs w-full rounded-lg p-2.5 resize-none border-surface-200 focus:border-red-500 focus:ring-red-200"
                required
                autoFocus
              />
            </div>

            {/* Action Buttons - Perfectly Aligned & Styled */}
            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-surface-100">
              <button
                type="button"
                onClick={() => setCancellingExpense(null)}
                className="btn-secondary h-9 px-4 text-xs font-semibold rounded-lg flex items-center justify-center transition-all cursor-pointer"
              >
                Go Back
              </button>
              <button
                type="button"
                onClick={handleConfirmCancel}
                disabled={isCancelling || !cancelReason.trim()}
                className="btn-danger h-9 px-4 text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 shadow-sm transition-all cursor-pointer disabled:opacity-50"
              >
                {isCancelling ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Cancelling...</span>
                  </>
                ) : (
                  <>
                    <XCircle className="w-3.5 h-3.5" />
                    <span>Confirm Cancellation</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Manage Expense Categories Modal */}
      <Modal
        isOpen={isCategoryModalOpen}
        onClose={() => {
          setIsCategoryModalOpen(false);
          setEditingCategory(null);
        }}
        title="Manage Expense Categories"
        maxWidth="xl"
        closeOnBackdropClick={false}
      >
        <div className="space-y-5">
          {/* Add / Edit Category Form */}
          <form
            onSubmit={editingCategory ? handleSaveEditCategory : handleAddCategory}
            className="p-3 bg-surface-50 rounded-xl border border-surface-200 space-y-3"
          >
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-surface-800">
                {editingCategory ? `Edit Category: ${editingCategory.name}` : 'Add New Expense Category'}
              </h4>
              {editingCategory && (
                <button
                  type="button"
                  onClick={() => setEditingCategory(null)}
                  className="text-2xs text-surface-500 hover:text-surface-700"
                >
                  Cancel Edit
                </button>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <input
                type="text"
                placeholder="Category Name (e.g. Rent, Petrol, Refreshments)"
                value={editingCategory ? editCatName : newCatName}
                onChange={(e) =>
                  editingCategory ? setEditCatName(e.target.value) : setNewCatName(e.target.value)
                }
                className="form-input text-xs"
                required
              />
              <input
                type="text"
                placeholder="Description (Optional)"
                value={editingCategory ? editCatDesc : newCatDesc}
                onChange={(e) =>
                  editingCategory ? setEditCatDesc(e.target.value) : setNewCatDesc(e.target.value)
                }
                className="form-input text-xs"
              />
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={isSavingCategory}
                className="btn btn-primary text-xs py-1.5"
              >
                {isSavingCategory ? 'Saving...' : editingCategory ? 'Update Category' : 'Add Category'}
              </button>
            </div>
          </form>

          {/* Existing Categories Table */}
          <div className="border border-surface-200 rounded-lg overflow-hidden max-h-60 overflow-y-auto">
            <table className="table w-full text-xs">
              <thead className="bg-surface-50">
                <tr>
                  <th className="text-left px-3 py-2 font-bold text-surface-500 text-2xs uppercase">Name</th>
                  <th className="text-left px-3 py-2 font-bold text-surface-500 text-2xs uppercase">Description</th>
                  <th className="text-center px-3 py-2 font-bold text-surface-500 text-2xs uppercase">Status</th>
                  <th className="text-right px-3 py-2 font-bold text-surface-500 text-2xs uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-100">
                {categories.map((cat) => (
                  <tr key={cat.id} className="hover:bg-surface-50/50">
                    <td className="px-3 py-2 font-semibold text-surface-800">{cat.name}</td>
                    <td className="px-3 py-2 text-surface-500 text-2xs">{cat.description || '-'}</td>
                    <td className="px-3 py-2 text-center">
                      <button
                        type="button"
                        onClick={() => handleToggleCategoryActive(cat)}
                        className={`text-2xs font-semibold px-2 py-0.5 rounded-full border transition-colors ${
                          cat.is_active
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                            : 'bg-surface-100 text-surface-500 border-surface-200 hover:bg-surface-200'
                        }`}
                      >
                        {cat.is_active ? 'Active' : 'Disabled'}
                      </button>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingCategory(cat);
                          setEditCatName(cat.name);
                          setEditCatDesc(cat.description || '');
                        }}
                        className="p-1 text-surface-400 hover:text-primary-600 rounded transition-colors"
                        title="Edit"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="button"
              onClick={() => setIsCategoryModalOpen(false)}
              className="btn btn-secondary text-xs"
            >
              Done
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
