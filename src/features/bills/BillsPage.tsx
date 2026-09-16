import React, { useState, useEffect } from 'react';
import { Search, Eye, Ban, Calendar, RotateCcw, CheckCircle2 } from 'lucide-react';
import { api } from '../../lib/ipc';
import { formatCurrency } from '../../lib/format';
import { Modal } from '../../components/Modal';
import { Header } from '../../components/Header';
import { useAuth } from '../../contexts/AuthContext';
import type { Bill, BillDetail, BillItem } from '../../types';
import toast from 'react-hot-toast';

// Return item state tracker
interface ReturnItemState {
  billItem: BillItem;
  selected: boolean;
  returnQty: number;
}

export const BillsPage: React.FC = () => {
  const { user, isAdmin } = useAuth();
  const [bills, setBills] = useState<Bill[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [selectedStatus, setSelectedStatus] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  // Bill Detail Modal
  const [selectedBillDetail, setSelectedBillDetail] = useState<BillDetail | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isDetailLoading, setIsDetailLoading] = useState(false);

  // Void Bill Modal
  const [isVoidOpen, setIsVoidOpen] = useState(false);
  const [voidingBillId, setVoidingBillId] = useState<number | null>(null);
  const [voidReason, setVoidReason] = useState('');
  const [isVoiding, setIsVoiding] = useState(false);

  // Return Bill Modal
  const [isReturnOpen, setIsReturnOpen] = useState(false);
  const [returningBill, setReturningBill] = useState<Bill | null>(null);
  const [returnItems, setReturnItems] = useState<ReturnItemState[]>([]);
  const [returnReason, setReturnReason] = useState('');
  const [isReturnLoading, setIsReturnLoading] = useState(false);
  const [isReturning, setIsReturning] = useState(false);

  const loadBills = async () => {
    setIsLoading(true);
    try {
      const res = await api.getBills({
        businessDate: selectedDate || undefined,
        status: selectedStatus || undefined,
        search: searchQuery.trim() || undefined,
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
    loadBills();
  }, [selectedDate, selectedStatus]);

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
    setVoidingBillId(bill.id);
    setVoidReason('');
    setIsVoidOpen(true);
  };

  const handleConfirmVoid = async () => {
    if (!user?.id || !voidingBillId || !voidReason.trim()) return;
    setIsVoiding(true);
    try {
      await api.voidBill(voidingBillId, user.id, voidReason.trim());
      toast.success('Bill voided successfully');
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
    setIsReturnLoading(true);
    setIsReturnOpen(true);

    try {
      const detail = await api.getBillDetail(bill.id);

      // Initialize return items with all items from the bill
      const items: ReturnItemState[] = detail.items.map((item) => ({
        billItem: item,
        selected: false,
        returnQty: item.quantity, // Default return qty = full quantity
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
      prev.map((item, i) =>
        i === index ? { ...item, selected: !item.selected } : item
      )
    );
  };

  const updateReturnQty = (index: number, qty: number) => {
    setReturnItems((prev) =>
      prev.map((item, i) =>
        i === index
          ? { ...item, returnQty: Math.min(Math.max(1, qty), item.billItem.quantity) }
          : item
      )
    );
  };

  // Calculate total refund amount
  const returnRefundTotal = returnItems
    .filter((item) => item.selected)
    .reduce((sum, item) => {
      const unitPrice = item.billItem.unit_price_paise;
      return sum + unitPrice * item.returnQty;
    }, 0);

  const selectedReturnCount = returnItems.filter((item) => item.selected).length;

  const handleConfirmReturn = async () => {
    if (!user?.id || !returningBill) return;

    if (selectedReturnCount === 0) {
      toast.error('Please select at least one item to return');
      return;
    }

    if (!returnReason.trim()) {
      toast.error('Please enter a reason for the return');
      return;
    }

    const returnItemsList = returnItems
      .filter((item) => item.selected)
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
      toast.success(`Return processed for Bill #${returningBill.bill_number}. Refund: ${formatCurrency(returnRefundTotal)}`);
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
        return <span className="badge badge-success">Completed</span>;
      case 'voided':
        return (
          <span
            className="badge badge-danger cursor-help"
            title={voidReason || 'Voided'}
          >
            Voided
          </span>
        );
      case 'returned':
        return <span className="badge badge-warning">Returned</span>;
      default:
        return <span className="badge badge-neutral">{status}</span>;
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
        <div className="card p-3 flex items-center justify-between gap-3 bg-white flex-wrap">
          <form onSubmit={handleSearchSubmit} className="relative flex-1 min-w-[240px]">
            <Search className="w-4 h-4 text-surface-400 absolute left-3 top-3" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by bill # or staff name..."
              className="form-input pl-9 text-sm"
            />
          </form>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 text-sm text-surface-600">
              <Calendar className="w-4 h-4" />
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="form-input text-sm py-1"
              />
            </div>

            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="form-select text-sm py-1"
            >
              <option value="">All Statuses</option>
              <option value="completed">Completed</option>
              <option value="voided">Voided</option>
              <option value="returned">Returned</option>
            </select>

            {(selectedDate || selectedStatus || searchQuery) && (
              <button
                onClick={() => {
                  setSelectedDate('');
                  setSelectedStatus('');
                  setSearchQuery('');
                }}
                className="text-sm text-surface-500 hover:text-surface-700 underline px-1"
              >
                Reset
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
                  <th className="w-32">Bill #</th>
                  <th className="w-44">Date & Time</th>
                  <th className="w-36">Staff</th>
                  <th className="w-28 text-center">Payment</th>
                  <th className="w-28 text-right">Subtotal</th>
                  <th className="w-24 text-right">Discount</th>
                  <th className="w-24 text-right">GST</th>
                  <th className="w-32 text-right">Grand Total</th>
                  <th className="w-28 text-center">Status</th>
                  <th className="w-40 text-right">Actions</th>
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
                      <td className="font-mono font-bold text-primary-700">
                        #{b.bill_number}
                      </td>
                      <td className="text-surface-700 font-mono">
                        {b.business_date} {b.bill_time}
                      </td>
                      <td className="font-medium text-surface-800">
                        {b.user_name || 'Staff'}
                      </td>
                      <td>
                        <span className="badge badge-neutral uppercase font-mono">
                          {b.payment_method || 'Cash'}
                        </span>
                      </td>
                      <td className="font-mono text-surface-600">
                        {formatCurrency(b.subtotal_paise)}
                      </td>
                      <td className="font-mono text-red-600">
                        {b.discount_amount_paise > 0
                          ? `-${formatCurrency(b.discount_amount_paise)}`
                          : '₹0.00'}
                      </td>
                      <td className="font-mono text-surface-600">
                        {b.gst_total_paise > 0
                          ? formatCurrency(b.gst_total_paise)
                          : '₹0.00'}
                      </td>
                      <td className="font-mono font-bold text-surface-900">
                        {formatCurrency(b.grand_total_paise)}
                      </td>
                      <td>
                        {getStatusBadge(b.status, b.void_reason)}
                      </td>
                      <td className="text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* View Details */}
                          <button
                            onClick={() => handleOpenDetail(b.id)}
                            className="p-1.5 text-surface-500 hover:text-primary-600 rounded hover:bg-surface-100 transition-colors"
                            title="View Bill Details"
                          >
                            <Eye className="w-4 h-4" />
                          </button>

                          {/* Return Button — on completed bills */}
                          {b.status === 'completed' && (
                            <button
                              onClick={() => handleOpenReturn(b)}
                              className="p-1.5 text-surface-400 hover:text-amber-600 rounded hover:bg-amber-50 transition-colors"
                              title="Return / Refund items from this bill"
                            >
                              <RotateCcw className="w-4 h-4" />
                            </button>
                          )}

                          {/* Void Button — admin only on completed bills */}
                          {isAdmin && b.status === 'completed' && (
                            <button
                              onClick={() => handleOpenVoid(b)}
                              className="p-1.5 text-surface-400 hover:text-red-600 rounded hover:bg-red-50 transition-colors"
                              title="Void Bill (Admin Only)"
                            >
                              <Ban className="w-4 h-4" />
                            </button>
                          )}
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

      {/* Bill Details Modal */}
      <Modal
        isOpen={isDetailOpen}
        onClose={() => setIsDetailOpen(false)}
        title={
          selectedBillDetail
            ? `Bill #${selectedBillDetail.bill.bill_number} Details`
            : 'Loading Bill...'
        }
        maxWidth="lg"
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
                  {selectedBillDetail.bill.business_date}{' '}
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
                <span className="font-semibold uppercase text-primary-700">
                  {selectedBillDetail.payment.payment_method}
                </span>
              </div>
            </div>

            {/* Items Snapshot Table */}
            <div>
              <div className="text-sm font-bold text-surface-700 uppercase tracking-wide mb-1.5">
                Purchased Items (Historical Snapshots)
              </div>
              <div className="border border-surface-200 rounded overflow-hidden">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th>Category</th>
                      <th className="text-right">Unit Price</th>
                      <th className="text-center">Qty</th>
                      <th className="text-right">Line Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedBillDetail.items.map((it) => (
                      <tr key={it.id}>
                        <td className="font-medium text-surface-900">
                          {it.product_name_snapshot}
                          <span className="text-xs text-surface-400 block font-mono">
                            {it.product_code_snapshot}
                          </span>
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
              {selectedBillDetail.bill.gst_total_paise > 0 && (
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

      {/* Return / Refund Modal */}
      <Modal
        isOpen={isReturnOpen}
        onClose={() => setIsReturnOpen(false)}
        title={
          returningBill
            ? `Return Items — Bill #${returningBill.bill_number}`
            : 'Process Return'
        }
        maxWidth="lg"
        footer={
          <div className="flex items-center justify-between w-full">
            <button
              onClick={() => setIsReturnOpen(false)}
              className="btn-secondary text-sm"
            >
              Cancel
            </button>
            <button
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
        }
      >
        {isReturnLoading ? (
          <div className="py-8 text-center text-surface-400">
            <div className="spinner mx-auto mb-2" />
            Loading bill items...
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
                  {returnRefundTotal > 0 ? `-${formatCurrency(returnRefundTotal)}` : '₹0.00'}
                </div>
              </div>
            </div>

            {/* Instructions */}
            <p className="text-sm text-surface-500">
              Select the items you want to return and adjust the return quantity if needed. The refund amount will be calculated automatically.
            </p>

            {/* Return Items Table */}
            <div className="border border-surface-200 rounded-lg overflow-hidden">
              <table className="table">
                <thead>
                  <tr>
                    <th className="w-12 text-center">Select</th>
                    <th>Product</th>
                    <th className="text-right w-28">Unit Price</th>
                    <th className="text-center w-24">Original Qty</th>
                    <th className="text-center w-28">Return Qty</th>
                    <th className="text-right w-28">Refund</th>
                  </tr>
                </thead>
                <tbody>
                  {returnItems.map((item, index) => (
                    <tr
                      key={item.billItem.id}
                      className={item.selected ? 'bg-amber-50/50' : ''}
                    >
                      <td className="text-center">
                        <input
                          type="checkbox"
                          checked={item.selected}
                          onChange={() => toggleReturnItem(index)}
                          className="form-checkbox"
                        />
                      </td>
                      <td className="font-medium text-surface-900">
                        {item.billItem.product_name_snapshot}
                        <span className="text-xs text-surface-400 block font-mono">
                          {item.billItem.product_code_snapshot}
                        </span>
                      </td>
                      <td className="text-right font-mono">
                        {formatCurrency(item.billItem.unit_price_paise)}
                      </td>
                      <td className="text-center font-mono font-bold">
                        {item.billItem.quantity}
                      </td>
                      <td className="text-center">
                        {item.selected ? (
                          <input
                            type="number"
                            min="1"
                            max={item.billItem.quantity}
                            value={item.returnQty}
                            onChange={(e) =>
                              updateReturnQty(index, parseInt(e.target.value) || 1)
                            }
                            className="w-16 h-8 text-center text-sm border border-surface-300 rounded bg-white font-mono font-bold mx-auto"
                          />
                        ) : (
                          <span className="text-surface-400">—</span>
                        )}
                      </td>
                      <td className="text-right font-mono font-bold">
                        {item.selected ? (
                          <span className="text-red-600">
                            -{formatCurrency(item.billItem.unit_price_paise * item.returnQty)}
                          </span>
                        ) : (
                          <span className="text-surface-400">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Return Reason */}
            <div className="form-group">
              <label className="form-label">Reason for Return *</label>
              <input
                type="text"
                value={returnReason}
                onChange={(e) => setReturnReason(e.target.value)}
                placeholder="e.g. Defective product, Customer changed mind, Wrong item delivered"
                className="form-input text-sm"
                required
              />
            </div>

            {/* Summary */}
            {selectedReturnCount > 0 && (
              <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-sm">
                <div className="flex items-center gap-2 text-amber-800">
                  <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                  <span>
                    <strong>{selectedReturnCount} item(s)</strong> selected for return.
                    Total refund: <strong className="font-mono">{formatCurrency(returnRefundTotal)}</strong>
                  </span>
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
        title="Void Completed Bill"
        maxWidth="sm"
        footer={
          <div className="flex items-center justify-end gap-2 w-full">
            <button
              onClick={() => setIsVoidOpen(false)}
              className="btn-secondary text-sm"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirmVoid}
              disabled={isVoiding || !voidReason.trim()}
              className="btn-danger text-sm font-bold"
            >
              {isVoiding ? 'Voiding...' : 'Confirm Void'}
            </button>
          </div>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-surface-600">
            Voiding will mark this transaction as cancelled in financial reports.
            The historical record will be preserved for audit compliance.
          </p>
          <div className="form-group">
            <label className="form-label">Reason for Voiding *</label>
            <input
              type="text"
              value={voidReason}
              onChange={(e) => setVoidReason(e.target.value)}
              placeholder="e.g. Customer cancelled order / Billing mistake"
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
