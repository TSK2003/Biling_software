import React, { useState, useEffect, useMemo } from 'react';
import { Search, Eye, Ban, RotateCcw, CheckCircle2, Printer, Calendar } from 'lucide-react';
import { api } from '../../lib/ipc';
import { formatCurrency, getTodayDateString, formatDateDMY, formatPaymentMethod } from '../../lib/format';
import { Modal } from '../../components/Modal';
import { Header } from '../../components/Header';
import { ReceiptPrintModal } from '../../components/ReceiptPrintModal';
import { CustomSelect } from '../../components/CustomSelect';
import { useAuth } from '../../contexts/AuthContext';
import { useSettings } from '../../contexts/SettingsContext';
import type { Bill, BillDetail, BillItem, ReturnBillItem, Category } from '../../types';
import toast from 'react-hot-toast';

// Return item state tracker
interface ReturnItemState {
  billItem: BillItem;
  selected: boolean;
  returnQty: number;
}

export const BillsPage: React.FC = () => {
  const todayStr = getTodayDateString();
  const { user, isAdmin } = useAuth();
  const { gstEnabled } = useSettings();
  const [bills, setBills] = useState<Bill[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [selectedStatus, setSelectedStatus] = useState<string>('');
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  // Bill Detail Modal
  const [selectedBillDetail, setSelectedBillDetail] = useState<BillDetail | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);

  // Void Bill Modal
  const [isVoidOpen, setIsVoidOpen] = useState(false);
  const [voidingBill, setVoidingBill] = useState<Bill | null>(null);
  const [voidingBillId, setVoidingBillId] = useState<number | null>(null);
  const [voidReason, setVoidReason] = useState('');
  const [isVoiding, setIsVoiding] = useState(false);

  // Return Bill Modal
  const [isReturnOpen, setIsReturnOpen] = useState(false);
  const [returningBill, setReturningBill] = useState<Bill | null>(null);
  const [returningBillDetail, setReturningBillDetail] = useState<BillDetail | null>(null);
  const [returnItems, setReturnItems] = useState<ReturnItemState[]>([]);
  const [returnReason, setReturnReason] = useState('');
  const [isReturnLoading, setIsReturnLoading] = useState(false);
  const [isReturning, setIsReturning] = useState(false);

  useEffect(() => {
    api.getCategories(true).then(setCategories).catch(() => {});
  }, []);

  const loadBills = async () => {
    setIsLoading(true);
    try {
      const res = await api.getBills({
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        status: selectedStatus || undefined,
        paymentMethod: selectedPaymentMethod || undefined,
        search: searchQuery.trim() || undefined,
        categoryId: selectedCategory ? Number(selectedCategory) : undefined,
        page: 1,
        pageSize: 100,
      });
      setBills(res.data);
    } catch (err) {
      toast.error('Failed to load bills');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      loadBills();
    }, searchQuery ? 300 : 0);
    return () => clearTimeout(timer);
  }, [dateFrom, dateTo, selectedStatus, selectedPaymentMethod, selectedCategory, searchQuery]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loadBills();
  };

  const handleOpenDetail = async (billId: number) => {
    setIsDetailLoading(true);
    setIsDetailOpen(true);
    try {
      const detail = await api.getBillDetail(billId);
      setSelectedBillDetail(detail);
    } catch (err) {
      toast.error('Failed to load bill details');
      setIsDetailOpen(false);
    } finally {
      setIsDetailLoading(false);
    }
  };

  const handleOpenVoid = (bill: Bill) => {
    setVoidingBill(bill);
    setVoidingBillId(bill.id);
    setVoidReason('');
    setIsVoidOpen(true);
  };

  const handleConfirmVoid = async () => {
    if (!user?.id || !voidingBillId || !voidReason.trim()) return;
    setIsVoiding(true);
    try {
      await api.voidBill(voidingBillId, user.id, voidReason.trim());
      toast.success(`Bill #${voidingBill?.bill_number || voidingBillId} voided successfully`);
      setIsVoidOpen(false);
      loadBills();
    } catch (err: any) {
      toast.error(typeof err === 'string' ? err : 'Failed to void bill');
    } finally {
      setIsVoiding(false);
    }
  };

  // ========== Return Bill Handlers ==========

  const handleOpenReturn = async (bill: Bill) => {
    setReturningBill(bill);
    setReturnReason('');
    setReturnItems([]);
    setReturningBillDetail(null);
    setIsReturnLoading(true);
    setIsReturnOpen(true);

    try {
      const detail = await api.getBillDetail(bill.id);
      setReturningBillDetail(detail);

      // Initialize return state for ALL product items in the bill (Task 1)
      const items: ReturnItemState[] = detail.items.map((item) => ({
        billItem: item,
        selected: item.quantity > 0, // default selected if active qty available
        returnQty: item.quantity, // default return qty = available remaining quantity
      }));
      setReturnItems(items);
    } catch (err) {
      toast.error('Failed to load bill details for return');
      setIsReturnOpen(false);
    } finally {
      setIsReturnLoading(false);
    }
  };

  const toggleReturnItem = (index: number) => {
    setReturnItems((prev) =>
      prev.map((item, i) => {
        if (i !== index) return item;
        const newSelected = !item.selected;
        return {
          ...item,
          selected: newSelected,
          returnQty: newSelected
            ? item.returnQty > 0
              ? item.returnQty
              : item.billItem.quantity
            : 0,
        };
      })
    );
  };

  const updateReturnQty = (index: number, qty: number) => {
    setReturnItems((prev) =>
      prev.map((item, i) => {
        if (i !== index) return item;
        const clampedQty = Math.max(0, Math.min(qty, item.billItem.quantity));
        return {
          ...item,
          returnQty: clampedQty,
          selected: clampedQty > 0,
        };
      })
    );
  };

  const toggleSelectAll = (selectAll: boolean) => {
    setReturnItems((prev) =>
      prev.map((item) => ({
        ...item,
        selected: selectAll && item.billItem.quantity > 0,
        returnQty: selectAll ? item.billItem.quantity : 0,
      }))
    );
  };

  // Calculate total refund amount including item GST & factoring in bill discounts
  const returnRefundTotal = useMemo(() => {
    if (!returningBill) return 0;

    let rawTotal = 0;
    let selectedAllUnits = true;

    for (const item of returnItems) {
      if (item.selected) {
        const itemBase = item.billItem.unit_price_paise * item.returnQty;
        const itemGst =
          gstEnabled && item.billItem.gst_enabled && item.billItem.gst_percentage_x100 > 0
            ? Math.round((itemBase * item.billItem.gst_percentage_x100) / 10000)
            : 0;
        rawTotal += itemBase + itemGst;

        if (item.returnQty < item.billItem.quantity) {
          selectedAllUnits = false;
        }
      } else {
        selectedAllUnits = false;
      }
    }

    if (rawTotal === 0) return 0;

    // If every item in the bill is selected for return at full remaining quantity
    if (selectedAllUnits && returnItems.length > 0) {
      return returningBill.grand_total_paise || 0;
    }

    // For partial returns, adjust for bill discount if any was applied
    const grossBill = (returningBill.subtotal_paise || 0) + (returningBill.gst_total_paise || 0);
    let refund = rawTotal;
    if (grossBill > 0 && (returningBill.discount_amount_paise || 0) > 0) {
      const ratio = (returningBill.grand_total_paise || 0) / grossBill;
      refund = Math.round(rawTotal * ratio);
    }

    // Refund can never exceed bill's grand total
    return Math.min(refund, returningBill.grand_total_paise || 0);
  }, [returnItems, returningBill]);

  const selectedReturnCount = returnItems.filter((item) => item.selected && item.returnQty > 0).length;

  const isAlreadyFullyReturned = useMemo(() => {
    if (!returningBill) return false;
    if (returningBill.status === 'cancelled') return true;
    if (returnItems.length > 0 && returnItems.every((item) => item.billItem.quantity === 0)) return true;
    return false;
  }, [returningBill, returnItems]);

  const isAllItemsReturned =
    returningBill !== null &&
    selectedReturnCount > 0 &&
    (returnRefundTotal >= (returningBill.grand_total_paise || 0) ||
      (returnItems.length > 0 &&
        returnItems.every((item) => (item.selected && item.returnQty >= item.billItem.quantity) || item.billItem.quantity === 0)));

  const handleConfirmReturn = async () => {
    if (!user?.id || !returningBill) return;

    if (selectedReturnCount === 0) {
      toast.error('Please select at least one item and enter a return quantity > 0');
      return;
    }

    if (!returnReason.trim()) {
      toast.error('Please enter a reason for the return');
      return;
    }

    const returnItemsList: ReturnBillItem[] = returnItems
      .filter((item) => item.selected && item.returnQty > 0)
      .map((item) => ({
        bill_item_id: item.billItem.id,
        product_id: item.billItem.product_id,
        product_name: item.billItem.product_name_snapshot,
        quantity: item.returnQty,
        unit_price_paise: item.billItem.unit_price_paise,
        line_total_paise: item.billItem.unit_price_paise * item.returnQty,
      }));

    setIsReturning(true);
    try {
      await api.returnBill(
        returningBill.id,
        user.id,
        returnReason.trim(),
        returnItemsList,
        returnRefundTotal
      );
      if (isAllItemsReturned) {
        toast.success(`Bill #${returningBill.bill_number} all items returned. Status set to Cancelled.`);
      } else {
        toast.success(`Partial return processed for Bill #${returningBill.bill_number}. Status set to Returned.`);
      }
      setIsReturnOpen(false);
      loadBills();
    } catch (err: any) {
      const errMsg = typeof err === 'string' ? err : (err?.message || 'Failed to process return');
      toast.error(errMsg);
    } finally {
      setIsReturning(false);
    }
  };

  // Status badge helper
  const getStatusBadge = (status: string, voidReason?: string) => {
    switch (status) {
      case 'completed':
        return <span className="badge badge-success font-semibold">Completed</span>;
      case 'returned':
        return (
          <span
            className="badge badge-warning font-semibold cursor-help"
            title={voidReason || 'Partially Returned'}
          >
            Returned
          </span>
        );
      case 'cancelled':
        return (
          <span
            className="badge bg-slate-100 text-slate-900 border-slate-400 font-bold cursor-help"
            title={voidReason || 'All items returned / Cancelled'}
          >
            Cancelled
          </span>
        );
      case 'voided':
        return (
          <span
            className="badge badge-danger font-semibold cursor-help"
            title={voidReason || 'Voided Transaction'}
          >
            Voided
          </span>
        );
      default:
        return <span className="badge badge-neutral font-semibold">{status}</span>;
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden bg-surface-50">
      <Header
        title="Billing History & Records"
        subtitle="Search, inspect, and review all completed sales transactions"
      />

      <div className="p-6 overflow-y-auto flex-1 space-y-4">
        {/* Filters Bar */}
        <div className="card p-3 flex items-center justify-between gap-3 bg-white flex-wrap shadow-xs">
          <form onSubmit={handleSearchSubmit} className="relative flex-1 min-w-[240px]">
            <Search className="w-4 h-4 text-surface-400 absolute left-3 top-2.5 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by bill number or staff name..."
              className="form-input pl-9 text-xs h-9"
            />
          </form>

          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1.5 bg-surface-50 px-2.5 py-1 rounded-lg border border-surface-200 h-9">
              <Calendar className="w-3.5 h-3.5 text-primary-600 flex-shrink-0" />
              <span className="text-[11px] font-semibold text-surface-500 uppercase tracking-wider">From:</span>
              <input
                type="date"
                value={dateFrom}
                max={todayStr}
                onChange={(e) => setDateFrom(e.target.value)}
                className="bg-transparent border-0 text-xs font-mono font-semibold text-surface-800 p-0 focus:ring-0 cursor-pointer w-28"
                title="From date"
              />
            </div>

            <div className="flex items-center gap-1.5 bg-surface-50 px-2.5 py-1 rounded-lg border border-surface-200 h-9">
              <Calendar className="w-3.5 h-3.5 text-primary-600 flex-shrink-0" />
              <span className="text-[11px] font-semibold text-surface-500 uppercase tracking-wider">To:</span>
              <input
                type="date"
                value={dateTo}
                max={todayStr}
                onChange={(e) => setDateTo(e.target.value)}
                className="bg-transparent border-0 text-xs font-mono font-semibold text-surface-800 p-0 focus:ring-0 cursor-pointer w-28"
                title="To date"
              />
            </div>

            <CustomSelect
              value={selectedStatus}
              onChange={setSelectedStatus}
              options={[
                { value: '', label: 'All Statuses' },
                { value: 'completed', label: 'Completed' },
                { value: 'returned', label: 'Returned (Partial)' },
                { value: 'cancelled', label: 'Cancelled (Full Return)' },
                { value: 'voided', label: 'Voided' },
              ]}
              size="md"
              buttonClassName="w-36 h-9 text-xs font-medium rounded-lg"
            />

            <CustomSelect
              value={selectedPaymentMethod}
              onChange={setSelectedPaymentMethod}
              options={[
                { value: '', label: 'All Payments' },
                { value: 'cash', label: 'Cash' },
                { value: 'upi', label: 'UPI / QR' },
                { value: 'card', label: 'Card' },
                { value: 'upi_cash', label: 'Split (UPI + Cash)' },
              ]}
              size="md"
              buttonClassName="w-36 h-9 text-xs font-medium rounded-lg"
            />

            <CustomSelect
              value={selectedCategory}
              onChange={setSelectedCategory}
              options={[
                { value: '', label: 'All Categories' },
                ...categories.map((c) => ({ value: String(c.id), label: c.name })),
              ]}
              size="md"
              buttonClassName="w-36 h-9 text-xs font-medium rounded-lg"
            />

            {(dateFrom || dateTo || selectedStatus || selectedPaymentMethod || selectedCategory || searchQuery) && (
              <button
                type="button"
                onClick={() => {
                  setDateFrom('');
                  setDateTo('');
                  setSelectedStatus('');
                  setSelectedPaymentMethod('');
                  setSelectedCategory('');
                  setSearchQuery('');
                }}
                className="h-9 px-3 text-xs font-semibold text-surface-600 hover:text-primary-600 bg-surface-50 hover:bg-surface-100 rounded-lg border border-surface-200 flex items-center gap-1.5 transition-colors cursor-pointer"
                title="Reset all filters"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset</span>
              </button>
            )}
          </div>
        </div>

        {/* Bills Table */}
        <div className="card overflow-hidden">
          <div className="table-container">
            <table className="table w-full">
              <thead>
                <tr>
                  <th className="w-28 text-left whitespace-nowrap">Bill #</th>
                  <th className="w-40 text-left whitespace-nowrap">Date & Time</th>
                  <th className="w-32 text-left whitespace-nowrap">Staff</th>
                  <th className="w-28 text-center whitespace-nowrap">Payment</th>
                  <th className="w-28 text-right whitespace-nowrap">Subtotal</th>
                  <th className="w-24 text-right whitespace-nowrap">Discount</th>
                  <th className="w-28 text-right whitespace-nowrap">GST Amount</th>
                  <th className="w-32 text-right whitespace-nowrap">Grand Total</th>
                  <th className="w-28 text-center whitespace-nowrap">Status</th>
                  <th className="w-32 text-right whitespace-nowrap">Actions</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={10} className="text-center py-8 text-surface-400">
                      <div className="spinner mx-auto mb-2" />
                      Loading bills...
                    </td>
                  </tr>
                ) : bills.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="text-center py-8 text-surface-400">
                      No billing records found.
                    </td>
                  </tr>
                ) : (
                  bills.map((b) => (
                    <tr
                      key={b.id}
                      className={
                        b.status === 'voided'
                          ? 'opacity-60 bg-red-50/20'
                          : b.status === 'returned'
                          ? 'bg-amber-50/20'
                          : ''
                      }
                    >
                      <td className="font-mono font-bold text-primary-700 whitespace-nowrap">
                        Bill: {String(b.bill_number).padStart(5, '0')}
                      </td>
                      <td className="text-surface-700 font-mono text-xs whitespace-nowrap">
                        {formatDateDMY(b.business_date)} {b.bill_time}
                      </td>
                      <td className="font-medium text-surface-800 whitespace-nowrap">
                        {b.user_name || 'Staff'}
                      </td>
                      <td className="text-center whitespace-nowrap">
                        <span className="badge badge-neutral font-semibold text-2xs">
                          {formatPaymentMethod(b.payment_method)}
                        </span>
                      </td>
                      <td className="font-mono text-surface-600 text-right whitespace-nowrap">
                        {formatCurrency(b.subtotal_paise)}
                      </td>
                      <td className="font-mono text-red-600 text-right whitespace-nowrap">
                        {b.discount_amount_paise > 0
                          ? `-${formatCurrency(b.discount_amount_paise)}`
                          : formatCurrency(0)}
                      </td>
                      <td className="font-mono text-right whitespace-nowrap">
                        {b.gst_total_paise > 0 ? (
                          <span className="text-surface-700 font-semibold">{formatCurrency(b.gst_total_paise)}</span>
                        ) : (
                          <span className="text-surface-400">—</span>
                        )}
                      </td>
                      <td className="font-mono font-bold text-surface-900 text-right whitespace-nowrap">
                        {formatCurrency(b.grand_total_paise)}
                      </td>
                      <td className="text-center whitespace-nowrap">
                        {getStatusBadge(b.status, b.void_reason)}
                      </td>
                      <td className="text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* View Details — always visible */}
                          <button
                            type="button"
                            onClick={() => handleOpenDetail(b.id)}
                            className="p-1.5 text-primary-900 hover:text-white hover:bg-primary-800 rounded-md border border-primary-300 bg-primary-50 transition-colors cursor-pointer shadow-2xs"
                            title="View Bill Details & Receipt"
                          >
                            <Eye className="w-4 h-4" />
                          </button>

                          {/* Return Button — available on completed, returned, and cancelled bills */}
                          {(b.status === 'completed' || b.status === 'returned' || b.status === 'cancelled') ? (
                            <button
                              type="button"
                              onClick={() => handleOpenReturn(b)}
                              className="p-1.5 text-amber-950 hover:text-white hover:bg-amber-700 rounded-md border border-amber-300 bg-amber-50 transition-colors cursor-pointer shadow-2xs"
                              title={
                                b.status === 'cancelled'
                                  ? 'View Returned Items & Quantities'
                                  : 'Return / Refund items from this bill'
                              }
                            >
                              <RotateCcw className="w-4 h-4" />
                            </button>
                          ) : null}

                          {/* Void Button — strictly requires Admin authorization */}
                          {(b.status === 'completed' || b.status === 'returned') ? (
                            <button
                              type="button"
                              onClick={() => {
                                if (!isAdmin) {
                                  toast.error('Only Admin has authorization to void completed bills');
                                  return;
                                }
                                handleOpenVoid(b);
                              }}
                              className={`p-1.5 rounded-md border transition-colors cursor-pointer shadow-2xs ${
                                isAdmin
                                  ? 'text-red-950 hover:text-white hover:bg-red-700 border-red-300 bg-red-50'
                                  : 'text-surface-400 border-surface-200 bg-surface-50 cursor-not-allowed opacity-40'
                              }`}
                              title={isAdmin ? 'Void Bill (Admin)' : 'Void Bill (Admin Authorization Required)'}
                            >
                              <Ban className="w-4 h-4" />
                            </button>
                          ) : b.status === 'voided' ? (
                            <span
                              className="p-1.5 text-surface-400 border border-surface-200 bg-surface-50 rounded-md cursor-not-allowed opacity-40"
                              title="Bill is already voided"
                            >
                              <Ban className="w-4 h-4" />
                            </span>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Bill Details Modal — Full Landscape Width */}
      <Modal
        isOpen={isDetailOpen}
        onClose={() => setIsDetailOpen(false)}
        title={
          selectedBillDetail
            ? `Bill: ${String(selectedBillDetail.bill.bill_number).padStart(5, '0')} Details`
            : 'Loading Bill...'
        }
        maxWidth="5xl"
        closeOnBackdropClick={false}
        footer={
          selectedBillDetail && (
            <div className="flex items-center justify-between w-full">
              <button
                type="button"
                onClick={() => setIsDetailOpen(false)}
                className="btn-secondary text-sm px-4 py-2 font-semibold"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => setIsPrintModalOpen(true)}
                className="btn-primary text-sm font-bold flex items-center gap-2 px-5 py-2"
                title="Print bill receipt"
              >
                <Printer className="w-4 h-4" />
                <span>Print Bill Receipt</span>
              </button>
            </div>
          )
        }
      >
        {isDetailLoading || !selectedBillDetail ? (
          <div className="py-8 text-center text-surface-400">
            <div className="spinner mx-auto mb-2" />
            Loading bill information...
          </div>
        ) : (
          <div className="space-y-4">
            {/* Header info */}
            <div className="grid grid-cols-3 gap-2 p-3 rounded bg-surface-50 border border-surface-200 text-sm">
              <div>
                <span className="text-surface-500 block">Date & Time:</span>
                <span className="font-mono font-semibold">
                  {formatDateDMY(selectedBillDetail.bill.business_date)}{' '}
                  {selectedBillDetail.bill.bill_time}
                </span>
              </div>
              <div>
                <span className="text-surface-500 block">Cashier / Staff:</span>
                <span className="font-semibold">
                  {selectedBillDetail.bill.user_name || 'Staff'}
                </span>
              </div>
              <div>
                <span className="text-surface-500 block">Payment Method:</span>
                <span className="font-semibold text-primary-700">
                  {formatPaymentMethod(selectedBillDetail.payment.payment_method)}
                </span>
              </div>
            </div>

            {/* Returned Items Section in Bill Detail (Task 2 & 4: show returned product name and returned qty) */}
            {((selectedBillDetail.returned_items && selectedBillDetail.returned_items.length > 0) ||
              selectedBillDetail.items.some((it) => (it.returned_quantity && it.returned_quantity > 0) || it.quantity === 0) ||
              selectedBillDetail.bill.status === 'returned' ||
              selectedBillDetail.bill.status === 'cancelled') && (
              <div className="space-y-2 p-3 bg-amber-50/70 rounded-xl border border-amber-200 text-xs">
                <div className="flex items-center gap-2 text-amber-900 font-bold uppercase tracking-wide">
                  <RotateCcw className="w-4 h-4 text-amber-700" />
                  <span>Returned Products & Quantities</span>
                  <span className="ml-auto text-2xs font-mono font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded-full border border-amber-300">
                    {selectedBillDetail.returned_items && selectedBillDetail.returned_items.length > 0
                      ? `${selectedBillDetail.returned_items.length} ${selectedBillDetail.returned_items.length === 1 ? 'Product Returned' : 'Products Returned'}`
                      : 'Returns Processed'}
                  </span>
                </div>

                <div className="border border-amber-200 rounded-lg overflow-hidden bg-white shadow-2xs">
                  <table className="table w-full text-xs">
                    <thead className="bg-amber-100/60 text-amber-950 font-bold">
                      <tr>
                        <th className="py-2 text-left">Returned Product</th>
                        <th className="py-2 text-center w-28">Returned Qty</th>
                        <th className="py-2 text-right w-28">Unit Price</th>
                        <th className="py-2 text-right w-28">Refund Amount</th>
                        <th className="py-2 text-left w-36">Return Reason</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-amber-100">
                      {selectedBillDetail.returned_items && selectedBillDetail.returned_items.length > 0 ? (
                        selectedBillDetail.returned_items.map((ret, idx) => (
                          <tr key={ret.id || idx} className="hover:bg-amber-50/40">
                            <td className="font-semibold text-surface-900 whitespace-nowrap">
                              <span className="font-bold">{ret.product_name}</span>
                              {ret.product_code && (
                                <span className="text-3xs text-surface-400 font-mono ml-1.5">({ret.product_code})</span>
                              )}
                            </td>
                            <td className="text-center font-mono">
                              <span className="inline-flex items-center font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-300">
                                {ret.quantity} {ret.quantity === 1 ? 'Unit' : 'Units'}
                              </span>
                            </td>
                            <td className="text-right font-mono text-surface-700">
                              {formatCurrency(ret.unit_price_paise)}
                            </td>
                            <td className="text-right font-mono font-bold text-red-600">
                              -{formatCurrency(ret.line_total_paise || ret.unit_price_paise * ret.quantity)}
                            </td>
                            <td className="text-surface-700 text-2xs italic whitespace-nowrap">
                              <span>"{ret.reason || 'Customer Return'}"</span>
                              {ret.returned_at && (
                                <span className="text-3xs text-surface-400 not-italic font-mono ml-1.5">
                                  [{ret.returned_at}]
                                </span>
                              )}
                            </td>
                          </tr>
                        ))
                      ) : (
                        selectedBillDetail.items
                          .filter((it) => (it.returned_quantity && it.returned_quantity > 0) || it.quantity === 0)
                          .map((it) => {
                            const retQty = it.returned_quantity || 1;
                            const refund = it.unit_price_paise * retQty;
                            return (
                              <tr key={it.id} className="hover:bg-amber-50/40">
                                <td className="font-semibold text-surface-900 whitespace-nowrap">
                                  <span className="font-bold">{it.product_name_snapshot || (it as any).product_name || 'Item'}</span>
                                  <span className="text-3xs text-surface-400 font-mono ml-1.5">
                                    ({it.product_code_snapshot || 'N/A'})
                                  </span>
                                </td>
                                <td className="text-center font-mono">
                                  <span className="inline-flex items-center font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-300">
                                    {retQty} {retQty === 1 ? 'Unit' : 'Units'}
                                  </span>
                                </td>
                                <td className="text-right font-mono text-surface-700">
                                  {formatCurrency(it.unit_price_paise)}
                                </td>
                                <td className="text-right font-mono font-bold text-red-600">
                                  -{formatCurrency(refund)}
                                </td>
                                <td className="text-surface-700 text-2xs italic whitespace-nowrap">
                                  "{selectedBillDetail.bill.void_reason || 'Customer Return'}"
                                </td>
                              </tr>
                            );
                          })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Items Snapshot Table */}
            <div>
              <div className="text-sm font-bold text-surface-700 uppercase tracking-wide mb-1.5 flex items-center justify-between">
                <span>Purchased Items (Active / Current)</span>
                <span className="text-3xs text-surface-400 lowercase font-normal">active bill line items</span>
              </div>
              <div className="border border-surface-200 rounded overflow-hidden">
                <table className="table">
                  <thead>
                    <tr>
                      <th className="whitespace-nowrap">Product</th>
                      <th className="whitespace-nowrap">Category</th>
                      <th className="text-right whitespace-nowrap">Unit Price</th>
                      <th className="text-center whitespace-nowrap">Active Qty</th>
                      <th className="text-right whitespace-nowrap">Line Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedBillDetail.items.map((it) => (
                      <tr key={it.id}>
                        <td className="font-medium text-surface-900 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-surface-950">
                              {it.product_name_snapshot || (it as any).product_name || (it as any).name || 'Item'}
                            </span>
                            <span className="text-xs text-surface-400 font-mono">
                              ({it.product_code_snapshot || (it as any).product_code || (it as any).code || 'N/A'})
                            </span>
                            {(it.returned_quantity && it.returned_quantity > 0) ? (
                              <span className="inline-flex text-3xs font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-300">
                                {it.returned_quantity} Returned
                              </span>
                            ) : it.quantity === 0 ? (
                              <span className="inline-flex text-3xs font-semibold px-1.5 py-0.5 rounded bg-red-100 text-red-800 border border-red-300">
                                Fully Returned
                              </span>
                            ) : null}
                          </div>
                        </td>
                        <td className="text-surface-500">
                          {it.category_name_snapshot}
                        </td>
                        <td className="text-right font-mono">
                          {formatCurrency(it.unit_price_paise)}
                        </td>
                        <td className="text-center font-mono font-bold">
                          {it.quantity}
                        </td>
                        <td className="text-right font-mono font-bold text-surface-900">
                          {formatCurrency(it.line_total_paise)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Bill Summary Breakdown */}
            <div className="p-3 rounded bg-surface-50 border border-surface-200 space-y-1.5 text-sm">
              <div className="flex justify-between text-surface-600">
                <span>Subtotal:</span>
                <span className="font-mono">
                  {formatCurrency(selectedBillDetail.bill.subtotal_paise)}
                </span>
              </div>
              {selectedBillDetail.bill.discount_amount_paise > 0 && (
                <div className="flex justify-between text-red-600 font-medium">
                  <span>Discount:</span>
                  <span className="font-mono">
                    -{formatCurrency(selectedBillDetail.bill.discount_amount_paise)}
                  </span>
                </div>
              )}
              {gstEnabled && selectedBillDetail.bill.gst_total_paise > 0 && (
                <div className="flex justify-between text-surface-600">
                  <span>GST:</span>
                  <span className="font-mono">
                    {formatCurrency(selectedBillDetail.bill.gst_total_paise)}
                  </span>
                </div>
              )}
              <div className="flex justify-between pt-1 border-t border-surface-200 text-base font-bold text-surface-900">
                <span>Grand Total:</span>
                <span className="font-mono text-primary-700">
                  {formatCurrency(selectedBillDetail.bill.grand_total_paise)}
                </span>
              </div>
            </div>

            {selectedBillDetail.bill.status === 'voided' && (
              <div className="p-3 rounded bg-red-50 border border-red-200 text-sm text-red-800">
                <div className="font-bold">VOIDED TRANSACTION</div>
                <div>Reason: {selectedBillDetail.bill.void_reason}</div>
              </div>
            )}

            {selectedBillDetail.bill.status === 'returned' && (
              <div className="p-3 rounded bg-amber-50 border border-amber-200 text-sm text-amber-800">
                <div className="font-bold">RETURNED TRANSACTION</div>
                <div>This bill has been returned/refunded.</div>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Bill Receipt Print Modal */}
      {selectedBillDetail && (
        <ReceiptPrintModal
          isOpen={isPrintModalOpen}
          onClose={() => setIsPrintModalOpen(false)}
          title={`Print Bill #${selectedBillDetail.bill.bill_number}`}
          billData={{
            billId: selectedBillDetail.bill.id,
            billNumber: selectedBillDetail.bill.bill_number,
            billUuid: selectedBillDetail.bill.bill_uuid,
            businessDate: selectedBillDetail.bill.business_date,
            billTime: selectedBillDetail.bill.bill_time,
            cashierName: selectedBillDetail.bill.user_name || 'Staff',
            items: selectedBillDetail.items.map((it) => ({
              product_name: it.product_name_snapshot,
              product_code: it.product_code_snapshot,
              quantity: it.quantity,
              unit_price_paise: it.unit_price_paise,
              line_total_paise: it.line_total_paise,
            })),
            subtotalPaise: selectedBillDetail.bill.subtotal_paise,
            discountAmountPaise: selectedBillDetail.bill.discount_amount_paise,
            discountType: selectedBillDetail.bill.discount_type,
            discountValue: selectedBillDetail.bill.discount_value_x100 / 100,
            gstTotalPaise: selectedBillDetail.bill.gst_total_paise,
            grandTotalPaise: selectedBillDetail.bill.grand_total_paise,
            paymentMethod: selectedBillDetail.payment?.payment_method || selectedBillDetail.bill.payment_method || 'cash',
            cashAmountPaise: selectedBillDetail.payment?.cash_amount_paise,
            upiAmountPaise: selectedBillDetail.payment?.upi_amount_paise,
            tenderedCashPaise: selectedBillDetail.payment?.cash_amount_paise,
            changeDuePaise: (selectedBillDetail.payment?.cash_amount_paise || 0) > selectedBillDetail.bill.grand_total_paise
              ? (selectedBillDetail.payment?.cash_amount_paise || 0) - selectedBillDetail.bill.grand_total_paise
              : 0,
          }}
        />
      )}

      {/* Return / Refund Modal — Big Landscape Width */}
      <Modal
        isOpen={isReturnOpen}
        onClose={() => setIsReturnOpen(false)}
        title={
          returningBill
            ? isAlreadyFullyReturned
              ? `Bill: ${String(returningBill.bill_number).padStart(5, '0')} — Already Fully Returned`
              : `Return Items — Bill: ${String(returningBill.bill_number).padStart(5, '0')}`
            : 'Process Return'
        }
        maxWidth="5xl"
        closeOnBackdropClick={false}
        footer={
          isAlreadyFullyReturned ? (
            <div className="flex items-center justify-end w-full">
              <button
                type="button"
                onClick={() => setIsReturnOpen(false)}
                className="btn-secondary text-sm font-semibold px-5"
              >
                Close
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-between w-full">
              <button
                type="button"
                onClick={() => setIsReturnOpen(false)}
                className="btn-secondary text-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmReturn}
                disabled={isReturning || selectedReturnCount === 0 || !returnReason.trim()}
                className="btn-danger text-sm font-bold flex items-center gap-2 disabled:opacity-50"
              >
                {isReturning ? (
                  <div className="spinner w-4 h-4 border-white" />
                ) : (
                  <>
                    <RotateCcw className="w-4 h-4" />
                    <span>Confirm Return ({formatCurrency(returnRefundTotal)})</span>
                  </>
                )}
              </button>
            </div>
          )
        }
      >
        {isReturnLoading ? (
          <div className="py-8 text-center text-surface-400">
            <div className="spinner mx-auto mb-2" />
            Loading bill items...
          </div>
        ) : isAlreadyFullyReturned ? (
          <div className="space-y-4">
            {/* Bill Info Strip */}
            <div className="p-3.5 rounded-lg bg-surface-50 border border-surface-200 flex items-center justify-between">
              <div>
                <div className="text-xs text-surface-500 uppercase font-semibold">Original Bill Total</div>
                <div className="text-lg font-bold text-surface-900 font-mono">
                  {formatCurrency(returningBill?.grand_total_paise || 0)}
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs text-surface-500 uppercase font-semibold">Bill Status</div>
                <div className="mt-0.5">
                  <span className="badge badge-neutral font-bold text-xs uppercase">
                    Cancelled (Already Fully Returned)
                  </span>
                </div>
              </div>
            </div>

            {/* Already Fully Returned Notice Banner */}
            <div className="p-6 rounded-xl bg-slate-50 border border-slate-200 text-center space-y-2">
              <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <h4 className="font-bold text-surface-900 text-base">Already Fully Returned</h4>
              <p className="text-xs text-surface-500 max-w-md mx-auto">
                Every product item from Bill #{String(returningBill?.bill_number).padStart(5, '0')} has already been returned and refunded. No further returns can be processed for this bill.
              </p>
            </div>

            {/* Already Returned Products Section */}
            {((returningBillDetail?.returned_items && returningBillDetail.returned_items.length > 0) ||
              returningBillDetail?.items.some((it) => (it.returned_quantity && it.returned_quantity > 0) || it.quantity === 0) ||
              returningBill?.status === 'returned' ||
              returningBill?.status === 'cancelled') && (
              <div className="space-y-2 p-3 bg-amber-50/70 rounded-xl border border-amber-200 text-xs">
                <div className="flex items-center gap-2 text-amber-900 font-bold uppercase tracking-wide">
                  <RotateCcw className="w-4 h-4 text-amber-700" />
                  <span>Returned Products & Quantities</span>
                  <span className="ml-auto text-2xs font-mono font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded-full border border-amber-300">
                    {returningBillDetail?.returned_items && returningBillDetail.returned_items.length > 0
                      ? `${returningBillDetail.returned_items.length} ${returningBillDetail.returned_items.length === 1 ? 'Product Returned' : 'Products Returned'}`
                      : 'Previously Returned'}
                  </span>
                </div>

                <div className="border border-amber-200 rounded-lg overflow-hidden bg-white shadow-2xs">
                  <table className="table w-full text-xs">
                    <thead className="bg-amber-100/60 text-amber-950 font-bold">
                      <tr>
                        <th className="py-2 text-left whitespace-nowrap">Returned Product</th>
                        <th className="py-2 text-center w-28 whitespace-nowrap">Returned Qty</th>
                        <th className="py-2 text-right w-28 whitespace-nowrap">Unit Price</th>
                        <th className="py-2 text-right w-28 whitespace-nowrap">Refund Amount</th>
                        <th className="py-2 text-left w-48 whitespace-nowrap">Return Reason</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-amber-100">
                      {returningBillDetail?.returned_items && returningBillDetail.returned_items.length > 0 ? (
                        returningBillDetail.returned_items.map((ret, idx) => (
                          <tr key={ret.id || idx} className="hover:bg-amber-50/40">
                            <td className="font-semibold text-surface-900 whitespace-nowrap">
                              <span className="font-bold">{ret.product_name}</span>
                              {ret.product_code && (
                                <span className="text-3xs text-surface-400 font-mono ml-1.5">({ret.product_code})</span>
                              )}
                            </td>
                            <td className="text-center font-mono">
                              <span className="inline-flex items-center font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-300">
                                {ret.quantity} {ret.quantity === 1 ? 'Unit' : 'Units'}
                              </span>
                            </td>
                            <td className="text-right font-mono text-surface-700">
                              {formatCurrency(ret.unit_price_paise)}
                            </td>
                            <td className="text-right font-mono font-bold text-red-600">
                              -{formatCurrency(ret.line_total_paise || ret.unit_price_paise * ret.quantity)}
                            </td>
                            <td className="text-surface-700 text-2xs italic whitespace-nowrap">
                              <span>"{ret.reason || 'Customer Return'}"</span>
                              {ret.returned_at && (
                                <span className="text-3xs text-surface-400 not-italic font-mono ml-1.5">
                                  [{ret.returned_at}]
                                </span>
                              )}
                            </td>
                          </tr>
                        ))
                      ) : (
                        returningBillDetail?.items
                          .filter((it) => (it.returned_quantity && it.returned_quantity > 0) || it.quantity === 0)
                          .map((it) => {
                            const retQty = it.returned_quantity || 1;
                            const refund = it.unit_price_paise * retQty;
                            return (
                              <tr key={it.id} className="hover:bg-amber-50/40">
                                <td className="font-semibold text-surface-900 whitespace-nowrap">
                                  <span className="font-bold">{it.product_name_snapshot || (it as any).product_name || 'Item'}</span>
                                  <span className="text-3xs text-surface-400 font-mono ml-1.5">
                                    ({it.product_code_snapshot || 'N/A'})
                                  </span>
                                </td>
                                <td className="text-center font-mono">
                                  <span className="inline-flex items-center font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-300">
                                    {retQty} {retQty === 1 ? 'Unit' : 'Units'}
                                  </span>
                                </td>
                                <td className="text-right font-mono text-surface-700">
                                  {formatCurrency(it.unit_price_paise)}
                                </td>
                                <td className="text-right font-mono font-bold text-red-600">
                                  -{formatCurrency(refund)}
                                </td>
                                <td className="text-surface-700 text-2xs italic whitespace-nowrap">
                                  "{returningBill?.void_reason || 'Customer Return'}"
                                </td>
                              </tr>
                            );
                          })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {/* Bill Info Strip */}
            <div className="p-3 rounded-lg bg-surface-50 border border-surface-200 flex items-center justify-between">
              <div>
                <div className="text-xs text-surface-500 uppercase font-semibold">Original Bill Total</div>
                <div className="text-lg font-bold text-surface-900 font-mono">
                  {formatCurrency(returningBill?.grand_total_paise || 0)}
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs text-surface-500 uppercase font-semibold">Refund Amount</div>
                <div className="text-lg font-bold text-red-600 font-mono">
                  {returnRefundTotal > 0 ? `-${formatCurrency(returnRefundTotal)}` : formatCurrency(0)}
                </div>
              </div>
            </div>

            {/* Previously Returned Products Section (if partial return occurred) */}
            {((returningBillDetail?.returned_items && returningBillDetail.returned_items.length > 0) ||
              returningBillDetail?.items.some((it) => (it.returned_quantity && it.returned_quantity > 0) || it.quantity === 0) ||
              returningBill?.status === 'returned') && (
              <div className="space-y-2 p-3 bg-amber-50/70 rounded-xl border border-amber-200 text-xs">
                <div className="flex items-center gap-2 text-amber-900 font-bold uppercase tracking-wide">
                  <RotateCcw className="w-4 h-4 text-amber-700" />
                  <span>Previously Returned Products & Quantities</span>
                  <span className="ml-auto text-2xs font-mono font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded-full border border-amber-300">
                    {returningBillDetail?.returned_items && returningBillDetail.returned_items.length > 0
                      ? `${returningBillDetail.returned_items.length} ${returningBillDetail.returned_items.length === 1 ? 'Product Returned' : 'Products Returned'}`
                      : 'Previously Returned'}
                  </span>
                </div>

                <div className="border border-amber-200 rounded-lg overflow-hidden bg-white shadow-2xs">
                  <table className="table w-full text-xs">
                    <thead className="bg-amber-100/60 text-amber-950 font-bold">
                      <tr>
                        <th className="py-2 text-left whitespace-nowrap">Returned Product</th>
                        <th className="py-2 text-center w-28 whitespace-nowrap">Returned Qty</th>
                        <th className="py-2 text-right w-28 whitespace-nowrap">Unit Price</th>
                        <th className="py-2 text-right w-28 whitespace-nowrap">Refund Amount</th>
                        <th className="py-2 text-left w-48 whitespace-nowrap">Return Reason</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-amber-100">
                      {returningBillDetail?.returned_items && returningBillDetail.returned_items.length > 0 ? (
                        returningBillDetail.returned_items.map((ret, idx) => (
                          <tr key={ret.id || idx} className="hover:bg-amber-50/40">
                            <td className="font-semibold text-surface-900 whitespace-nowrap">
                              <span className="font-bold">{ret.product_name}</span>
                              {ret.product_code && (
                                <span className="text-3xs text-surface-400 font-mono ml-1.5">({ret.product_code})</span>
                              )}
                            </td>
                            <td className="text-center font-mono">
                              <span className="inline-flex items-center font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-300">
                                {ret.quantity} {ret.quantity === 1 ? 'Unit' : 'Units'}
                              </span>
                            </td>
                            <td className="text-right font-mono text-surface-700">
                              {formatCurrency(ret.unit_price_paise)}
                            </td>
                            <td className="text-right font-mono font-bold text-red-600">
                              -{formatCurrency(ret.line_total_paise || ret.unit_price_paise * ret.quantity)}
                            </td>
                            <td className="text-surface-700 text-2xs italic whitespace-nowrap">
                              <span>"{ret.reason || 'Customer Return'}"</span>
                              {ret.returned_at && (
                                <span className="text-3xs text-surface-400 not-italic font-mono ml-1.5">
                                  [{ret.returned_at}]
                                </span>
                              )}
                            </td>
                          </tr>
                        ))
                      ) : (
                        returningBillDetail?.items
                          .filter((it) => (it.returned_quantity && it.returned_quantity > 0) || it.quantity === 0)
                          .map((it) => {
                            const retQty = it.returned_quantity || 1;
                            const refund = it.unit_price_paise * retQty;
                            return (
                              <tr key={it.id} className="hover:bg-amber-50/40">
                                <td className="font-semibold text-surface-900 whitespace-nowrap">
                                  <span className="font-bold">{it.product_name_snapshot || (it as any).product_name || 'Item'}</span>
                                  <span className="text-3xs text-surface-400 font-mono ml-1.5">
                                    ({it.product_code_snapshot || 'N/A'})
                                  </span>
                                </td>
                                <td className="text-center font-mono">
                                  <span className="inline-flex items-center font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-300">
                                    {retQty} {retQty === 1 ? 'Unit' : 'Units'}
                                  </span>
                                </td>
                                <td className="text-right font-mono text-surface-700">
                                  {formatCurrency(it.unit_price_paise)}
                                </td>
                                <td className="text-right font-mono font-bold text-red-600">
                                  -{formatCurrency(refund)}
                                </td>
                                <td className="text-surface-700 text-2xs italic whitespace-nowrap">
                                  "{returningBill?.void_reason || 'Customer Return'}"
                                </td>
                              </tr>
                            );
                          })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Instructions & Quick Actions */}
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <p className="text-xs text-surface-500">
                Select the items you want to return and specify the return quantity. The refund amount will be calculated automatically.
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => toggleSelectAll(true)}
                  className="text-2xs font-semibold text-primary-700 bg-primary-50 hover:bg-primary-100 px-2.5 py-1 rounded border border-primary-200 transition-colors cursor-pointer"
                >
                  Return All Items
                </button>
                <button
                  type="button"
                  onClick={() => toggleSelectAll(false)}
                  className="text-2xs font-semibold text-surface-600 bg-surface-100 hover:bg-surface-200 px-2.5 py-1 rounded border border-surface-200 transition-colors cursor-pointer"
                >
                  Clear Selection
                </button>
              </div>
            </div>

            {/* Return Items Table (Clean, Perfectly Aligned) */}
            <div className="border border-surface-200 rounded-lg overflow-hidden">
              <table className="table w-full">
                <thead>
                  <tr>
                    <th className="w-12 text-center whitespace-nowrap">
                      <input
                        type="checkbox"
                        checked={
                          returnItems.length > 0 &&
                          returnItems
                            .filter((item) => item.billItem.quantity > 0)
                            .every((item) => item.selected && item.returnQty > 0)
                        }
                        onChange={(e) => toggleSelectAll(e.target.checked)}
                        className="form-checkbox"
                        title="Select / Deselect All Available Items"
                      />
                    </th>
                    <th className="text-left whitespace-nowrap">Product</th>
                    <th className="text-right w-28 whitespace-nowrap">Unit Price</th>
                    <th className="text-center w-28 whitespace-nowrap">Available</th>
                    <th className="text-center w-44 whitespace-nowrap">Return Qty</th>
                    <th className="text-right w-32 whitespace-nowrap">Refund</th>
                  </tr>
                </thead>
                <tbody>
                  {returnItems.map((item, index) => {
                    const itemBase = item.billItem.unit_price_paise * item.returnQty;
                    const itemGst =
                      gstEnabled && item.billItem.gst_enabled && item.billItem.gst_percentage_x100 > 0
                        ? Math.round((itemBase * item.billItem.gst_percentage_x100) / 10000)
                        : 0;
                    const lineRefund = itemBase + itemGst;
                    const isAvailable = item.billItem.quantity > 0;

                    return (
                      <tr
                        key={item.billItem.id}
                        className={item.selected ? 'bg-amber-50/50' : !isAvailable ? 'opacity-50 bg-surface-50/50' : ''}
                      >
                        <td className="text-center">
                          {isAvailable ? (
                            <input
                              type="checkbox"
                              checked={item.selected}
                              onChange={() => toggleReturnItem(index)}
                              className="form-checkbox cursor-pointer"
                            />
                          ) : (
                            <span className="text-3xs text-surface-400 font-mono">—</span>
                          )}
                        </td>
                        <td className="font-medium text-surface-900 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-surface-950">
                              {item.billItem.product_name_snapshot || (item.billItem as any).product_name || (item.billItem as any).name || 'Item'}
                            </span>
                            <span className="text-xs text-surface-400 font-mono">
                              ({item.billItem.product_code_snapshot || (item.billItem as any).product_code || (item.billItem as any).code || 'N/A'})
                            </span>
                            {!isAvailable && (
                              <span className="inline-flex text-3xs font-semibold px-1.5 py-0.5 rounded bg-red-100 text-red-800 border border-red-300">
                                Already Fully Returned
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="text-right font-mono whitespace-nowrap">
                          <div>{formatCurrency(item.billItem.unit_price_paise)}</div>
                          {gstEnabled && item.billItem.gst_enabled && item.billItem.gst_percentage_x100 > 0 ? (
                            <span className="inline-block text-2xs text-emerald-700 bg-emerald-50 px-1 py-0.2 rounded border border-emerald-200">
                              +{(item.billItem.gst_percentage_x100 / 100).toFixed(0)}% GST
                            </span>
                          ) : null}
                        </td>
                        <td className="text-center font-mono font-bold whitespace-nowrap">
                          {item.billItem.quantity}
                          {(item.billItem.returned_quantity && item.billItem.returned_quantity > 0) ? (
                            <span className="text-3xs text-amber-700 block font-normal">
                              ({item.billItem.returned_quantity} prev. returned)
                            </span>
                          ) : null}
                        </td>
                        {/* Return Qty Column — Clean Tactile Stepper Control */}
                        <td className="text-center whitespace-nowrap py-2.5">
                          {isAvailable ? (
                            item.selected ? (
                              <div className="inline-flex flex-col items-center gap-0.5">
                                <div className="inline-flex items-center justify-center border-2 border-amber-400 rounded-lg overflow-hidden bg-white shadow-2xs">
                                  <button
                                    type="button"
                                    onClick={() => updateReturnQty(index, Math.max(1, item.returnQty - 1))}
                                    disabled={item.returnQty <= 1}
                                    className="w-8 h-8 flex items-center justify-center text-surface-700 hover:bg-amber-100 hover:text-amber-900 active:bg-amber-200 disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed transition-colors text-base font-bold select-none cursor-pointer"
                                    title="Decrease return quantity"
                                  >
                                    −
                                  </button>
                                  <input
                                    type="number"
                                    min="1"
                                    max={item.billItem.quantity}
                                    value={item.returnQty}
                                    onChange={(e) =>
                                      updateReturnQty(index, parseInt(e.target.value) || 1)
                                    }
                                    className="w-14 h-8 text-center text-sm bg-white font-mono font-bold text-surface-950 focus:outline-none border-x border-amber-200 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => updateReturnQty(index, Math.min(item.billItem.quantity, item.returnQty + 1))}
                                    disabled={item.returnQty >= item.billItem.quantity}
                                    className="w-8 h-8 flex items-center justify-center text-surface-700 hover:bg-amber-100 hover:text-amber-900 active:bg-amber-200 disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed transition-colors text-base font-bold select-none cursor-pointer"
                                    title="Increase return quantity"
                                  >
                                    +
                                  </button>
                                </div>
                                <span className="text-[10px] font-mono text-surface-400">
                                  max: {item.billItem.quantity}
                                </span>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => toggleReturnItem(index)}
                                className="inline-flex items-center gap-1 text-2xs font-semibold px-2.5 py-1 rounded-md bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 hover:border-amber-300 transition-colors cursor-pointer"
                                title="Click to select for return"
                              >
                                <span>Select Item</span>
                              </button>
                            )
                          ) : (
                            <span className="text-surface-400 text-xs italic">0 available</span>
                          )}
                        </td>
                        <td className="text-right font-mono font-bold whitespace-nowrap">
                          {item.selected && item.returnQty > 0 ? (
                            <div>
                              <span className="text-red-600">
                                -{formatCurrency(lineRefund)}
                              </span>
                              {itemGst > 0 && (
                                <span className="text-2xs text-surface-400 block font-normal">
                                  incl. {formatCurrency(itemGst)} GST
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-surface-400 font-mono text-sm">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Return Reason with Quick Presets */}
            <div className="form-group space-y-1.5">
              <label className="form-label text-xs font-semibold">Reason for Return *</label>
              <div className="flex flex-wrap gap-1.5 mb-1.5">
                {[
                  'Customer Return',
                  'Defective / Damaged Item',
                  'Wrong Item Purchased',
                  'Product Expired',
                  'Customer Changed Mind',
                ].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setReturnReason(preset)}
                    className={`text-2xs px-2 py-1 rounded-md border transition-colors cursor-pointer ${
                      returnReason === preset
                        ? 'bg-amber-100 text-amber-900 border-amber-300 font-bold'
                        : 'bg-surface-50 text-surface-600 border-surface-200 hover:bg-surface-100'
                    }`}
                  >
                    {preset}
                  </button>
                ))}
              </div>
              <input
                type="text"
                value={returnReason}
                onChange={(e) => setReturnReason(e.target.value)}
                placeholder="Enter or select reason for return..."
                className="form-input text-sm"
                required
              />
            </div>

            {/* Summary & Status Outcome Preview */}
            {selectedReturnCount > 0 && (
              <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-sm space-y-2">
                <div className="flex items-center justify-between text-amber-900">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-amber-700 flex-shrink-0" />
                    <span>
                      <strong>{selectedReturnCount} item(s)</strong> selected for return
                    </span>
                  </div>
                  <span className="font-mono font-bold text-base text-red-600">
                    Refund: {formatCurrency(returnRefundTotal)}
                  </span>
                </div>
                <div className="pt-2 border-t border-amber-200/80 flex items-center justify-between text-xs">
                  <span className="text-surface-600">Updated Bill Status:</span>
                  {isAllItemsReturned ? (
                    <span className="badge badge-neutral font-bold">
                      CANCELLED (Full Return)
                    </span>
                  ) : (
                    <span className="badge badge-warning font-bold">
                      RETURNED (Partial Return — {formatCurrency((returningBill?.grand_total_paise || 0) - returnRefundTotal)} remaining)
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Void Modal */}
      <Modal
        isOpen={isVoidOpen}
        onClose={() => setIsVoidOpen(false)}
        title={voidingBill ? `Void Bill: ${String(voidingBill.bill_number).padStart(5, '0')}` : 'Void Bill'}
        maxWidth="md"
        closeOnBackdropClick={false}
        footer={
          <div className="flex items-center justify-end gap-2 w-full">
            <button
              type="button"
              onClick={() => setIsVoidOpen(false)}
              className="btn-secondary text-sm"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirmVoid}
              disabled={isVoiding || !voidReason.trim()}
              className="btn-danger text-sm font-bold flex items-center gap-1.5 disabled:opacity-50"
            >
              {isVoiding ? (
                <>
                  <div className="spinner w-3.5 h-3.5 border-white" />
                  <span>Voiding Bill...</span>
                </>
              ) : (
                <>
                  <Ban className="w-4 h-4" />
                  <span>Confirm Void Bill</span>
                </>
              )}
            </button>
          </div>
        }
      >
        <div className="space-y-3.5">
          {voidingBill && (
            <div className="p-3 rounded-lg bg-surface-50 border border-surface-200 flex items-center justify-between text-xs">
              <div>
                <span className="text-surface-500">Bill Number:</span>{' '}
                <strong className="font-mono text-surface-900">#{voidingBill.bill_number}</strong>
                <span className="text-surface-400 mx-2">•</span>
                <span className="text-surface-500">Staff:</span>{' '}
                <strong className="text-surface-900">{voidingBill.user_name || 'Staff'}</strong>
              </div>
              <div className="font-mono font-bold text-sm text-surface-900">
                {formatCurrency(voidingBill.grand_total_paise)}
              </div>
            </div>
          )}

          <p className="text-xs text-surface-600 leading-relaxed">
            Voiding will cancel this transaction and zero out sales revenue while preserving the audit record for compliance.
          </p>

          <div className="form-group space-y-1.5">
            <label className="form-label text-xs font-semibold">Reason for Voiding *</label>
            <div className="flex flex-wrap gap-1.5 mb-1">
              {[
                'Customer Cancellation',
                'Billed by Mistake',
                'Duplicate Entry',
                'Payment Mode Wrong',
                'Customer Left Without Paying',
              ].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setVoidReason(preset)}
                  className={`text-2xs px-2 py-1 rounded-md border transition-colors cursor-pointer ${
                    voidReason === preset
                      ? 'bg-red-100 text-red-900 border-red-300 font-bold'
                      : 'bg-surface-50 text-surface-600 border-surface-200 hover:bg-surface-100'
                  }`}
                >
                  {preset}
                </button>
              ))}
            </div>
            <input
              type="text"
              value={voidReason}
              onChange={(e) => setVoidReason(e.target.value)}
              placeholder="Enter or select reason for voiding..."
              className="form-input text-sm"
              required
              autoFocus
            />
          </div>
        </div>
      </Modal>
    </div>
  );
};
