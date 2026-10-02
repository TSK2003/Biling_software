import React, { useState, useEffect } from 'react';
import { Printer, CheckCircle2, ArrowRight, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { Modal } from './Modal';
import { api } from '../lib/ipc';
import { useSettings } from '../contexts/SettingsContext';
import { formatCurrency, amountInWordsINR, formatDateDMY, formatPaymentMethod, getGlobalCurrencySymbol } from '../lib/format';
import type { CartItem } from '../types';

export interface ReceiptBillItem {
  product_name: string;
  product_code?: string;
  quantity: number;
  unit_price_paise: number;
  line_total_paise: number;
}

export interface ReceiptBillData {
  billId?: number;
  billNumber: number;
  billUuid?: string;
  businessDate: string;
  billTime?: string;
  cashierName?: string;
  items: CartItem[] | ReceiptBillItem[];
  subtotalPaise: number;
  discountAmountPaise: number;
  discountType?: string;
  discountValue?: number;
  gstTotalPaise: number;
  grandTotalPaise: number;
  paymentMethod: string;
  cashAmountPaise?: number;
  upiAmountPaise?: number;
  tenderedCashPaise?: number;
  changeDuePaise?: number;
}

interface ReceiptPrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  billData: ReceiptBillData | null;
  onStartNextBill?: () => void;
  title?: string;
}

/* ========================================================================= */
/* 1. Thermal 80mm (3-Inch Standard POS Thermal Roll)                        */
/* ========================================================================= */
const Thermal80Receipt: React.FC<{
  billData: ReceiptBillData;
  shopName: string;
  shopPhone: string;
  shopAddress: string;
  shopEmail: string;
  shopLogo: string;
  gstEnabled: boolean;
  gstNumber: string;
  fssaiNumber: string;
  receiptFooter: string;
  paperFormat?: string;
}> = ({
  billData,
  shopName,
  shopPhone,
  shopAddress,
  shopEmail,
  shopLogo,
  gstEnabled,
  gstNumber,
  fssaiNumber,
  receiptFooter,
  paperFormat = 'Thermal80',
}) => {
  const totalQuantity = billData.items.reduce((acc, i) => acc + i.quantity, 0);
  const effectiveGstPaise = gstEnabled ? billData.gstTotalPaise : 0;
  const effectiveGrandTotalPaise = gstEnabled
    ? billData.grandTotalPaise
    : Math.max(0, billData.subtotalPaise - billData.discountAmountPaise);
  const halfGstPaise = Math.round(effectiveGstPaise / 2);
  const printClass = `print-${paperFormat.toLowerCase()}`;

  const isSplit =
    billData.paymentMethod === 'upi_cash' ||
    billData.paymentMethod === 'cash_upi' ||
    (billData.paymentMethod &&
      billData.paymentMethod.toLowerCase().includes('upi') &&
      billData.paymentMethod.toLowerCase().includes('cash')) ||
    ((billData.cashAmountPaise ?? 0) > 0 && (billData.upiAmountPaise ?? 0) > 0);

  const cashPart =
    billData.cashAmountPaise !== undefined && billData.cashAmountPaise > 0
      ? billData.cashAmountPaise
      : billData.tenderedCashPaise &&
        billData.tenderedCashPaise > 0 &&
        billData.tenderedCashPaise < effectiveGrandTotalPaise
      ? billData.tenderedCashPaise
      : Math.floor(effectiveGrandTotalPaise / 2);

  const upiPart =
    billData.upiAmountPaise !== undefined && billData.upiAmountPaise > 0
      ? billData.upiAmountPaise
      : Math.max(0, effectiveGrandTotalPaise - cashPart);

  const tenderedCash = billData.tenderedCashPaise || 0;

  return (
    <div
      id="printable-receipt"
      className={`bg-white rounded-lg border border-surface-300 shadow-sm p-4 font-mono text-surface-950 w-[340px] text-xs leading-normal ${printClass} select-text`}
    >
      {/* Shop & Company Header */}
      <div className="text-center pb-2 border-b border-dashed border-surface-400">
        {shopLogo && (
          <div className="flex justify-center mb-1.5">
            <img
              src={shopLogo}
              alt={shopName || 'Logo'}
              className="h-10 object-contain max-w-[140px]"
              onError={(e) => {
                (e.target as HTMLElement).style.display = 'none';
              }}
            />
          </div>
        )}
        {shopName && (
          <h2 className="text-sm font-black tracking-wider uppercase text-black">
            {shopName}
          </h2>
        )}
        {shopAddress && (
          <p className="text-3xs text-surface-700 mt-0.5 leading-snug whitespace-pre-line">
            {shopAddress}
          </p>
        )}
        {shopPhone && (
          <p className="text-3xs text-surface-800 font-bold mt-0.5">
            Phone: <span>{shopPhone}</span>
          </p>
        )}
        {shopEmail && (
          <p className="text-3xs text-surface-700 mt-0.5">
            Email: <span>{shopEmail}</span>
          </p>
        )}
        {gstEnabled && gstNumber && (
          <p className="text-3xs font-bold text-surface-900 mt-0.5">
            GSTIN: {gstNumber}
          </p>
        )}
        {fssaiNumber && (
          <p className="text-3xs font-semibold text-surface-700 mt-0.5">
            FSSAI: {fssaiNumber}
          </p>
        )}
      </div>

      {/* Bill Meta Row */}
      <div className="py-2 border-b border-dashed border-surface-400 text-3xs flex flex-col gap-0.5">
        <div className="flex justify-between items-center font-bold">
          <span>Bill: {String(billData.billNumber).padStart(5, '0')}</span>
          <span>{formatDateDMY(billData.businessDate)} {billData.billTime || ''}</span>
        </div>
        <div className="flex justify-between items-center text-surface-700">
          <span>Cashier: {billData.cashierName || 'Staff'}</span>
          <span className="font-bold uppercase text-black">
            Mode: {formatPaymentMethod(billData.paymentMethod)}
          </span>
        </div>
      </div>

      {/* 80mm 4-Column Table with optimized widths for large figures */}
      <div className="py-2 border-b border-dashed border-surface-400">
        <table className="w-full text-2xs table-fixed">
          <colgroup>
            <col className="w-[42%]" />
            <col className="w-[12%]" />
            <col className="w-[23%]" />
            <col className="w-[23%]" />
          </colgroup>
          <thead>
            <tr className="border-b border-surface-300 text-surface-600 text-3xs font-bold uppercase">
              <th className="text-left py-0.5">Item</th>
              <th className="text-center py-0.5">Qty</th>
              <th className="text-right py-0.5">Rate</th>
              <th className="text-right py-0.5">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-200">
            {billData.items.map((it, idx) => {
              const name = 'product_name' in it ? it.product_name : (it as any).product_name_snapshot || 'Item';
              const unitPrice = 'unit_price_paise' in it ? it.unit_price_paise : 0;
              const lineTotal = 'line_total_paise' in it ? it.line_total_paise : unitPrice * it.quantity;
              return (
                <tr key={idx} className="py-0.5">
                  <td className="py-1 text-left font-semibold text-black pr-1 leading-tight align-top break-words">
                    {name}
                  </td>
                  <td className="py-1 text-center font-bold text-surface-800 align-top">
                    {it.quantity}
                  </td>
                  <td className="py-1 text-right text-surface-700 align-top font-mono tabular-nums whitespace-nowrap text-3xs">
                    {formatCurrency(unitPrice)}
                  </td>
                  <td className="py-1 text-right font-black text-black align-top font-mono tabular-nums whitespace-nowrap text-3xs">
                    {formatCurrency(lineTotal)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Calculations Breakdown */}
      <div className="py-1.5 border-b border-dashed border-surface-400 space-y-0.5 text-3xs">
        <div className="flex justify-between text-surface-800">
          <span>Subtotal ({billData.items.length} items, {totalQuantity} qty):</span>
          <span className="font-bold tabular-nums">{formatCurrency(billData.subtotalPaise)}</span>
        </div>

        {billData.discountAmountPaise > 0 && (
          <div className="flex justify-between text-red-600 font-bold">
            <span>Discount:</span>
            <span className="tabular-nums">-{formatCurrency(billData.discountAmountPaise)}</span>
          </div>
        )}

        {gstEnabled && effectiveGstPaise > 0 && (
          <>
            <div className="flex justify-between text-surface-700">
              <span>CGST:</span>
              <span className="tabular-nums">{formatCurrency(halfGstPaise)}</span>
            </div>
            <div className="flex justify-between text-surface-700">
              <span>SGST:</span>
              <span className="tabular-nums">{formatCurrency(effectiveGstPaise - halfGstPaise)}</span>
            </div>
          </>
        )}

        {/* Grand Total */}
        <div className="flex justify-between items-center pt-1 border-t border-surface-400 text-xs font-black text-black">
          <span className="uppercase tracking-tight">NET TOTAL:</span>
          <span className="text-sm font-black tabular-nums">{formatCurrency(effectiveGrandTotalPaise)}</span>
        </div>
      </div>

      {/* Payment & Change breakdown */}
      <div className="py-1.5 border-b border-dashed border-surface-400 text-3xs space-y-0.5 text-surface-800">
        <div className="flex justify-between">
          <span>Payment Mode:</span>
          <span className="font-black uppercase text-black">
            {formatPaymentMethod(billData.paymentMethod)}
          </span>
        </div>
        {isSplit ? (
          <>
            <div className="flex justify-between font-bold text-black">
              <span>Cash Paid:</span>
              <span className="tabular-nums">{formatCurrency(cashPart)}</span>
            </div>
            <div className="flex justify-between font-bold text-black">
              <span>UPI Paid:</span>
              <span className="tabular-nums">{formatCurrency(upiPart)}</span>
            </div>
            {tenderedCash > cashPart && (
              <>
                <div className="flex justify-between text-surface-600">
                  <span>Tendered Cash:</span>
                  <span className="tabular-nums">{formatCurrency(tenderedCash)}</span>
                </div>
                <div className="flex justify-between font-black text-black">
                  <span>Change Returned:</span>
                  <span className="tabular-nums">{formatCurrency(tenderedCash - cashPart)}</span>
                </div>
              </>
            )}
          </>
        ) : billData.tenderedCashPaise && billData.tenderedCashPaise > 0 ? (
          <>
            <div className="flex justify-between">
              <span>Tendered Cash:</span>
              <span className="font-bold tabular-nums">{formatCurrency(billData.tenderedCashPaise)}</span>
            </div>
            <div className="flex justify-between font-black text-black">
              <span>Change Returned:</span>
              <span className="tabular-nums">{formatCurrency(billData.changeDuePaise || Math.max(0, billData.tenderedCashPaise - effectiveGrandTotalPaise))}</span>
            </div>
          </>
        ) : null}
      </div>

      {/* Footer Thank You Note with Clean Simple Alignment */}
      {receiptFooter && (
        <div className="pt-2.5 pb-0.5 text-center">
          <div className="border-t border-dashed border-surface-400 pt-2">
            <p className="font-extrabold text-black text-xs uppercase tracking-wider">
              {receiptFooter}
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

/* ========================================================================= */
/* 2. Thermal 58mm (2-Inch Mini Thermal Roll)                                */
/* ========================================================================= */
const Thermal58Receipt: React.FC<{
  billData: ReceiptBillData;
  shopName: string;
  shopPhone: string;
  shopAddress: string;
  shopEmail: string;
  shopLogo: string;
  gstEnabled: boolean;
  gstNumber: string;
  fssaiNumber: string;
  receiptFooter: string;
}> = ({
  billData,
  shopName,
  shopPhone,
  shopAddress,
  shopEmail,
  shopLogo,
  gstEnabled,
  gstNumber,
  fssaiNumber,
  receiptFooter,
}) => {
  const effectiveGstPaise = gstEnabled ? billData.gstTotalPaise : 0;
  const effectiveGrandTotalPaise = gstEnabled
    ? billData.grandTotalPaise
    : Math.max(0, billData.subtotalPaise - billData.discountAmountPaise);

  const isSplit =
    billData.paymentMethod === 'upi_cash' ||
    billData.paymentMethod === 'cash_upi' ||
    (billData.paymentMethod &&
      billData.paymentMethod.toLowerCase().includes('upi') &&
      billData.paymentMethod.toLowerCase().includes('cash')) ||
    ((billData.cashAmountPaise ?? 0) > 0 && (billData.upiAmountPaise ?? 0) > 0);

  const cashPart =
    billData.cashAmountPaise !== undefined && billData.cashAmountPaise > 0
      ? billData.cashAmountPaise
      : billData.tenderedCashPaise &&
        billData.tenderedCashPaise > 0 &&
        billData.tenderedCashPaise < effectiveGrandTotalPaise
      ? billData.tenderedCashPaise
      : Math.floor(effectiveGrandTotalPaise / 2);

  const upiPart =
    billData.upiAmountPaise !== undefined && billData.upiAmountPaise > 0
      ? billData.upiAmountPaise
      : Math.max(0, effectiveGrandTotalPaise - cashPart);

  const tenderedCash = billData.tenderedCashPaise || 0;

  return (
    <div
      id="printable-receipt"
      className="bg-white rounded-lg border border-surface-300 shadow-sm p-2.5 font-mono text-surface-950 w-[240px] text-2xs leading-tight print-thermal58 select-text"
    >
      {/* Header */}
      <div className="text-center pb-1.5 border-b border-dashed border-surface-400">
        {shopLogo && (
          <div className="flex justify-center mb-1">
            <img
              src={shopLogo}
              alt={shopName || 'Logo'}
              className="h-8 object-contain max-w-[100px]"
              onError={(e) => {
                (e.target as HTMLElement).style.display = 'none';
              }}
            />
          </div>
        )}
        {shopName && (
          <h2 className="text-xs font-black tracking-wider uppercase text-black">
            {shopName}
          </h2>
        )}
        {shopAddress && (
          <p className="text-4xs text-surface-700 mt-0.5 leading-tight">{shopAddress}</p>
        )}
        {shopPhone && (
          <p className="text-4xs text-surface-800 font-bold">Ph: {shopPhone}</p>
        )}
        {shopEmail && (
          <p className="text-4xs text-surface-700">Email: {shopEmail}</p>
        )}
        {gstEnabled && gstNumber && (
          <p className="text-4xs font-bold text-surface-900">GSTIN: {gstNumber}</p>
        )}
        {fssaiNumber && (
          <p className="text-4xs font-semibold text-surface-700">FSSAI: {fssaiNumber}</p>
        )}
      </div>

      {/* Meta */}
      <div className="py-1 border-b border-dashed border-surface-400 text-4xs flex flex-col gap-0.5">
        <div className="flex justify-between items-center font-bold">
          <span>Bill: {String(billData.billNumber).padStart(5, '0')}</span>
          <span>{formatDateDMY(billData.businessDate)} {billData.billTime ? billData.billTime.slice(0, 5) : ''}</span>
        </div>
        <div className="flex justify-between items-center text-surface-600">
          <span>By: {billData.cashierName || 'Staff'}</span>
          <span className="font-bold text-black uppercase">{formatPaymentMethod(billData.paymentMethod)}</span>
        </div>
      </div>

      {/* 2-Line Items Layout (Never truncates big product names) */}
      <div className="py-1.5 border-b border-dashed border-surface-400 space-y-1.5 text-3xs">
        <div className="flex justify-between border-b border-surface-300 pb-0.5 font-bold uppercase text-surface-600 text-4xs">
          <span>Item & Qty × Rate</span>
          <span>Total</span>
        </div>
        {billData.items.map((it, idx) => {
          const name = 'product_name' in it ? it.product_name : (it as any).product_name_snapshot || 'Item';
          const unitPrice = 'unit_price_paise' in it ? it.unit_price_paise : 0;
          const lineTotal = 'line_total_paise' in it ? it.line_total_paise : unitPrice * it.quantity;
          return (
            <div key={idx} className="space-y-0.5 border-b border-surface-100 pb-1">
              <div className="font-bold text-black text-3xs leading-snug break-words">
                {name}
              </div>
              <div className="flex justify-between items-center text-4xs text-surface-700 font-mono gap-1">
                <span className="truncate">{it.quantity} × {formatCurrency(unitPrice)}</span>
                <span className="font-bold text-black font-mono tabular-nums whitespace-nowrap shrink-0">{formatCurrency(lineTotal)}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Totals */}
      <div className="py-1 border-b border-dashed border-surface-400 space-y-0.5 text-3xs">
        <div className="flex justify-between text-surface-700">
          <span>Subtotal:</span>
          <span className="tabular-nums">{formatCurrency(billData.subtotalPaise)}</span>
        </div>
        {billData.discountAmountPaise > 0 && (
          <div className="flex justify-between text-red-600 font-bold">
            <span>Discount:</span>
            <span className="tabular-nums">-{formatCurrency(billData.discountAmountPaise)}</span>
          </div>
        )}
        {gstEnabled && effectiveGstPaise > 0 && (
          <div className="flex justify-between text-surface-700">
            <span>Taxes (GST):</span>
            <span className="tabular-nums">{formatCurrency(effectiveGstPaise)}</span>
          </div>
        )}
        <div className="flex justify-between items-center pt-0.5 border-t border-surface-400 text-xs font-black text-black">
          <span>TOTAL:</span>
          <span className="tabular-nums">{formatCurrency(effectiveGrandTotalPaise)}</span>
        </div>
      </div>

      {/* Tendered & Change */}
      <div className="py-1 border-b border-dashed border-surface-400 text-4xs space-y-0.5 text-surface-700 font-mono">
        <div className="flex justify-between">
          <span>Mode:</span>
          <span className="font-bold text-black uppercase">
            {formatPaymentMethod(billData.paymentMethod)}
          </span>
        </div>
        {isSplit ? (
          <>
            <div className="flex justify-between font-bold text-black">
              <span>Cash Paid:</span>
              <span className="tabular-nums">{formatCurrency(cashPart)}</span>
            </div>
            <div className="flex justify-between font-bold text-black">
              <span>UPI Paid:</span>
              <span className="tabular-nums">{formatCurrency(upiPart)}</span>
            </div>
            {tenderedCash > cashPart && (
              <>
                <div className="flex justify-between text-surface-600">
                  <span>Tendered:</span>
                  <span className="tabular-nums">{formatCurrency(tenderedCash)}</span>
                </div>
                <div className="flex justify-between font-bold text-black">
                  <span>Change Return:</span>
                  <span className="tabular-nums">{formatCurrency(tenderedCash - cashPart)}</span>
                </div>
              </>
            )}
          </>
        ) : billData.tenderedCashPaise && billData.tenderedCashPaise > 0 ? (
          <>
            <div className="flex justify-between">
              <span>Cash Tendered:</span>
              <span className="tabular-nums">{formatCurrency(billData.tenderedCashPaise)}</span>
            </div>
            <div className="flex justify-between font-bold text-black">
              <span>Change Return:</span>
              <span className="tabular-nums">{formatCurrency(billData.changeDuePaise || Math.max(0, billData.tenderedCashPaise - effectiveGrandTotalPaise))}</span>
            </div>
          </>
        ) : null}
      </div>

      {/* Footer Thank You Note */}
      {receiptFooter && (
        <div className="pt-2 pb-0.5 text-center">
          <div className="border-t border-dashed border-surface-400 pt-1.5">
            <p className="font-extrabold text-black uppercase text-3xs tracking-wider">
              {receiptFooter}
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

/* ========================================================================= */
/* 3. Standard A4 Tax Invoice (Formal Full Sheet Invoice)                    */
/* ========================================================================= */
const A4TaxInvoice: React.FC<{
  billData: ReceiptBillData;
  shopName: string;
  shopPhone: string;
  shopAddress: string;
  shopEmail: string;
  shopLogo: string;
  gstEnabled: boolean;
  gstNumber: string;
  fssaiNumber: string;
  receiptFooter: string;
  paperFormat?: string;
}> = ({
  billData,
  shopName,
  shopPhone,
  shopAddress,
  shopEmail,
  shopLogo,
  gstEnabled,
  gstNumber,
  fssaiNumber,
  receiptFooter,
  paperFormat = 'A4',
}) => {
  const totalQuantity = billData.items.reduce((acc, i) => acc + i.quantity, 0);
  const effectiveGstPaise = gstEnabled ? billData.gstTotalPaise : 0;
  const effectiveGrandTotalPaise = gstEnabled
    ? billData.grandTotalPaise
    : Math.max(0, billData.subtotalPaise - billData.discountAmountPaise);
  const halfGstPaise = Math.round(effectiveGstPaise / 2);
  const printClass = `print-${paperFormat.toLowerCase()}`;

  const isSplit =
    billData.paymentMethod === 'upi_cash' ||
    billData.paymentMethod === 'cash_upi' ||
    (billData.paymentMethod &&
      billData.paymentMethod.toLowerCase().includes('upi') &&
      billData.paymentMethod.toLowerCase().includes('cash')) ||
    ((billData.cashAmountPaise ?? 0) > 0 && (billData.upiAmountPaise ?? 0) > 0);

  const cashPart =
    billData.cashAmountPaise !== undefined && billData.cashAmountPaise > 0
      ? billData.cashAmountPaise
      : billData.tenderedCashPaise &&
        billData.tenderedCashPaise > 0 &&
        billData.tenderedCashPaise < effectiveGrandTotalPaise
      ? billData.tenderedCashPaise
      : Math.floor(effectiveGrandTotalPaise / 2);

  const upiPart =
    billData.upiAmountPaise !== undefined && billData.upiAmountPaise > 0
      ? billData.upiAmountPaise
      : Math.max(0, effectiveGrandTotalPaise - cashPart);

  const tenderedCash = billData.tenderedCashPaise || 0;

  return (
    <div
      id="printable-receipt"
      className={`bg-white rounded-lg border border-surface-400 shadow-md p-6 font-sans text-surface-900 w-full max-w-[760px] text-xs leading-normal ${printClass} select-text`}
    >
      {/* Top Banner: Tax Invoice Label & Company Header */}
      <div className="flex items-center justify-between border-b-2 border-surface-900 pb-3 mb-4">
        <div className="flex items-center gap-3">
          {shopLogo && (
            <div className="w-12 h-12 rounded-lg bg-surface-50 border border-surface-200 flex items-center justify-center p-1 overflow-hidden flex-shrink-0">
              <img
                src={shopLogo}
                alt={shopName || 'Logo'}
                className="w-full h-full object-contain"
                onError={(e) => {
                  (e.target as HTMLElement).style.display = 'none';
                }}
              />
            </div>
          )}
          <div>
            {shopName && (
              <h1 className="text-lg font-black tracking-wide text-surface-950 uppercase">
                {shopName}
              </h1>
            )}
            {shopAddress && (
              <p className="text-2xs text-surface-600 font-medium whitespace-pre-line max-w-sm">
                {shopAddress}
              </p>
            )}
            <div className="flex items-center gap-3 text-2xs text-surface-700 font-semibold mt-0.5">
              {shopPhone && <span>Phone: {shopPhone}</span>}
              {shopEmail && <span>Email: {shopEmail}</span>}
            </div>
            <div className="flex items-center gap-3 text-2xs text-surface-800 font-bold mt-0.5">
              {gstEnabled && gstNumber && <span>GSTIN: {gstNumber}</span>}
              {fssaiNumber && <span>FSSAI: {fssaiNumber}</span>}
            </div>
          </div>
        </div>

        <div className="text-right">
          <div className="inline-block bg-surface-950 text-white font-black px-3 py-1 text-xs rounded uppercase tracking-wider mb-2">
            {gstEnabled ? 'Tax Invoice' : 'Cash Bill / Retail Invoice'}
          </div>
          <div className="text-2xs space-y-0.5 text-surface-700">
            <div className="font-bold text-surface-950 text-xs">
              Bill: <span className="font-mono text-primary-700">{String(billData.billNumber).padStart(5, '0')}</span>
            </div>
            <div>Date: <span className="font-semibold font-mono">{formatDateDMY(billData.businessDate)}</span></div>
            <div>Time: <span className="font-semibold font-mono">{billData.billTime || ''}</span></div>
            {gstEnabled && <div>Place of Supply: <span className="font-semibold">Local State (INTRA-STATE)</span></div>}
          </div>
        </div>
      </div>

      {/* Bill To & Cashier Strip */}
      <div className="grid grid-cols-2 gap-4 p-3 bg-surface-50 rounded-lg border border-surface-200 mb-4 text-2xs">
        <div>
          <span className="font-bold text-surface-500 uppercase tracking-wider">Billed To (Customer):</span>
          <div className="font-bold text-surface-900 mt-0.5 text-xs">Cash / Retail Customer (Walk-in)</div>
          <div className="text-surface-600">POS Retail Counter Sale</div>
        </div>
        <div className="text-right">
          <span className="font-bold text-surface-500 uppercase tracking-wider">Counter & Staff Info:</span>
          <div className="font-bold text-surface-900 mt-0.5">
            Cashier: <span className="font-semibold">{billData.cashierName || 'Administrator'}</span>
          </div>
          <div className="text-surface-700 font-medium">
            Payment Method: <span className="font-bold uppercase text-surface-900">{formatPaymentMethod(billData.paymentMethod)}</span>
          </div>
        </div>
      </div>

      {/* Formal Bordered Table with table-fixed for big product names */}
      <div className="border border-surface-300 rounded-lg overflow-hidden mb-4">
        <table className="w-full text-2xs text-left table-fixed">
          <thead className="bg-surface-100 border-b border-surface-300 font-bold text-surface-800 uppercase tracking-wider text-3xs">
            <tr>
              <th className="py-2 px-2.5 w-10 text-center">#</th>
              <th className="py-2 px-2.5 w-[37%]">Item Description</th>
              <th className="py-2 px-2.5 w-[14%] text-center">Code</th>
              <th className="py-2 px-2.5 w-[10%] text-center">Qty</th>
              <th className="py-2 px-2.5 w-[14%] text-right">Unit Rate</th>
              <th className="py-2 px-2.5 w-[10%] text-right">Disc</th>
              <th className="py-2 px-2.5 w-[15%] text-right">{gstEnabled ? `Amount (${getGlobalCurrencySymbol()})` : `Total (${getGlobalCurrencySymbol()})`}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-200">
            {billData.items.map((it, idx) => {
              const name = 'product_name' in it ? it.product_name : (it as any).product_name_snapshot || 'Item';
              const code = ('product_code' in it ? it.product_code : (it as any).product_code_snapshot) || '—';
              const unitPrice = 'unit_price_paise' in it ? it.unit_price_paise : 0;
              const lineTotal = 'line_total_paise' in it ? it.line_total_paise : unitPrice * it.quantity;

              return (
                <tr key={idx} className="hover:bg-surface-50/50">
                  <td className="py-2 px-2.5 text-center font-mono text-surface-500 font-semibold align-top">{idx + 1}</td>
                  <td className="py-2 px-2.5 font-bold text-surface-900 align-top break-words">{name}</td>
                  <td className="py-2 px-2.5 text-center font-mono text-surface-600 text-3xs align-top">{code}</td>
                  <td className="py-2 px-2.5 text-center font-bold font-mono text-surface-900 align-top">{it.quantity}</td>
                  <td className="py-2 px-2.5 text-right font-mono text-surface-700 align-top whitespace-nowrap tabular-nums">{formatCurrency(unitPrice)}</td>
                  <td className="py-2 px-2.5 text-right font-mono text-red-600 align-top">—</td>
                  <td className="py-2 px-2.5 text-right font-mono font-bold text-surface-950 align-top whitespace-nowrap tabular-nums">{formatCurrency(lineTotal)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Bottom Summary Section (2-Columns) */}
      <div className="grid grid-cols-12 gap-4 mb-4">
        {/* Left Col: Amount in Words, Payment Breakdown, Terms */}
        <div className="col-span-7 flex flex-col justify-between space-y-3">
          <div className="p-3 bg-surface-50 rounded-lg border border-surface-200">
            <div className="text-3xs uppercase font-bold text-surface-500 tracking-wider">
              Total Amount in Words:
            </div>
            <div className="text-xs font-bold text-surface-950 font-serif italic mt-0.5">
              {amountInWordsINR(effectiveGrandTotalPaise)}
            </div>
          </div>

          {/* Payment & Cash info */}
          <div className="p-2.5 rounded-lg border border-surface-200 text-2xs space-y-1">
            <div className="flex justify-between font-medium">
              <span className="text-surface-600">Payment Status:</span>
              <span className="font-bold text-emerald-700 uppercase">Paid Successfully</span>
            </div>
            <div className="flex justify-between font-medium">
              <span className="text-surface-600">Payment Channel:</span>
              <span className="font-bold text-surface-900 uppercase">{formatPaymentMethod(billData.paymentMethod)}</span>
            </div>
            {isSplit ? (
              <div className="pt-1 border-t border-surface-100 font-mono space-y-0.5">
                <div className="flex justify-between text-surface-800 font-bold">
                  <span>Cash Paid:</span>
                  <span>{formatCurrency(cashPart)}</span>
                </div>
                <div className="flex justify-between text-surface-800 font-bold">
                  <span>UPI Paid:</span>
                  <span>{formatCurrency(upiPart)}</span>
                </div>
                {tenderedCash > cashPart && (
                  <div className="flex justify-between text-surface-600 pt-0.5 border-t border-dashed border-surface-200">
                    <span>Tendered Cash: {formatCurrency(tenderedCash)}</span>
                    <span className="font-bold text-surface-900">Change Return: {formatCurrency(tenderedCash - cashPart)}</span>
                  </div>
                )}
              </div>
            ) : billData.tenderedCashPaise && billData.tenderedCashPaise > 0 ? (
              <div className="flex justify-between text-2xs pt-1 border-t border-surface-100 font-mono">
                <span className="text-surface-600">Tendered: {formatCurrency(billData.tenderedCashPaise)}</span>
                <span className="font-bold text-surface-900">Change Return: {formatCurrency(billData.changeDuePaise || Math.max(0, billData.tenderedCashPaise - effectiveGrandTotalPaise))}</span>
              </div>
            ) : null}
          </div>

          {/* Terms & Conditions */}
          <div className="text-3xs text-surface-500 space-y-0.5">
            <div className="font-bold uppercase text-surface-700">Terms & Conditions:</div>
            <div>1. Goods once sold cannot be returned without original cash invoice.</div>
            <div>2. All disputes are subject to local jurisdiction.</div>
          </div>
        </div>

        {/* Right Col: Totals Box */}
        <div className="col-span-5 border border-surface-300 rounded-lg p-3 bg-surface-50 flex flex-col justify-between space-y-2 text-2xs">
          <div className="space-y-1.5 divide-y divide-surface-200">
            <div className="flex justify-between items-center text-surface-700 pb-1">
              <span>Gross Subtotal ({totalQuantity} items):</span>
              <span className="font-mono font-bold text-surface-900">{formatCurrency(billData.subtotalPaise)}</span>
            </div>

            {billData.discountAmountPaise > 0 && (
              <div className="flex justify-between items-center text-red-600 py-1">
                <span className="font-semibold">Discount:</span>
                <span className="font-mono font-bold">-{formatCurrency(billData.discountAmountPaise)}</span>
              </div>
            )}

            {gstEnabled && effectiveGstPaise > 0 && (
              <div className="py-1 space-y-1">
                <div className="flex justify-between items-center text-surface-600 text-3xs">
                  <span>Central GST (CGST):</span>
                  <span className="font-mono font-semibold">{formatCurrency(halfGstPaise)}</span>
                </div>
                <div className="flex justify-between items-center text-surface-600 text-3xs">
                  <span>State GST (SGST):</span>
                  <span className="font-mono font-semibold">{formatCurrency(effectiveGstPaise - halfGstPaise)}</span>
                </div>
              </div>
            )}

            <div className="flex justify-between items-center text-surface-700 py-1">
              <span>Round Off:</span>
              <span className="font-mono text-surface-500">{formatCurrency(0)}</span>
            </div>
          </div>

          {/* Net Payable Highlight Box */}
          <div className="p-2.5 bg-surface-900 text-white rounded-lg flex items-center justify-between">
            <span className="font-bold text-xs uppercase tracking-wider">Net Amount:</span>
            <span className="font-mono text-base font-black">
              {formatCurrency(effectiveGrandTotalPaise)}
            </span>
          </div>
        </div>
      </div>

      {/* Signatory & AESCION Footer Strip */}
      <div className="pt-4 border-t border-surface-300 flex items-end justify-between text-2xs">
        <div className="text-3xs text-surface-600 space-y-1 max-w-md">
          {receiptFooter && (
            <p className="font-bold text-surface-900 text-xs uppercase tracking-wide">
              {receiptFooter}
            </p>
          )}
          <p>{gstEnabled ? 'This is a computer generated tax invoice.' : 'This is a computer generated cash bill.'}</p>
        </div>

        <div className="text-center w-48">
          <div className="font-bold text-surface-900 text-2xs mb-8">For {(shopName || 'AUTHORIZED STORE').toUpperCase()}</div>
          <div className="border-t border-surface-400 pt-1 text-3xs font-semibold text-surface-600 uppercase">
            Authorized Signatory
          </div>
        </div>
      </div>
    </div>
  );
};

/* ========================================================================= */
/* Main Controller Component: ReceiptPrintModal                              */
/* ========================================================================= */
export const ReceiptPrintModal: React.FC<ReceiptPrintModalProps> = ({
  isOpen,
  onClose,
  billData,
  onStartNextBill,
  title,
}) => {
  const { settings, gstEnabled } = useSettings();

  // Paper format configured by Admin in Settings or saved in localStorage
  const adminConfiguredSize: string =
    settings['printer_paper_size'] ||
    localStorage.getItem('pos_saved_paper_size') ||
    'Thermal80';

  const savedPrinterName =
    settings['printer_name'] ||
    localStorage.getItem('pos_saved_printer_name') ||
    undefined;

  const isThermalPrinter = savedPrinterName
    ? /thermal|rp3200|pos|receipt|tm-|tvs|star|xp-|mpt|zj-|bluetooth/i.test(savedPrinterName)
    : false;

  // If a thermal printer (like TVSE RP3200 Lite) is selected, ensure it displays the proper Thermal printer size (Thermal80 or Thermal58)
  const defaultResolvedFormat = (isThermalPrinter && ['A4', 'A5', 'B5', 'Letter'].includes(adminConfiguredSize))
    ? 'Thermal80'
    : adminConfiguredSize;

  const [activePaperFormat, setActivePaperFormat] = useState<string>(defaultResolvedFormat);

  useEffect(() => {
    setActivePaperFormat(defaultResolvedFormat);
  }, [defaultResolvedFormat, isOpen]);

  const isSheetFormat = ['A4', 'A5', 'B5', 'Letter'].includes(activePaperFormat);
  const is58mm = activePaperFormat === 'Thermal58';

  const savedCopies =
    Number(settings['printer_copies']) ||
    Number(localStorage.getItem('pos_saved_printer_copies')) ||
    1;

  const printShopLogo = settings['print_shop_logo'] !== 'false';
  const printShopName = settings['print_shop_name'] !== 'false';
  const printShopPhone = settings['print_shop_phone'] !== 'false';
  const printShopAddress = settings['print_shop_address'] !== 'false';
  const printShopEmail = settings['print_shop_email'] !== 'false';
  const printFssaiNumber = settings['print_fssai_number'] !== 'false';
  const printReceiptFooter = settings['print_receipt_footer'] !== 'false';

  const shopName = printShopName ? (settings['shop_name'] || 'AESCION BILLING') : '';
  const shopPhone = printShopPhone ? (settings['shop_phone'] || '') : '';
  const shopAddress = printShopAddress ? (settings['shop_address'] || '') : '';
  const shopEmail = printShopEmail ? (settings['shop_email'] || '') : '';
  const shopLogo = printShopLogo ? (settings['shop_logo'] || '') : '';
  const gstNumber = settings['gst_number'] || '';
  const fssaiNumber = printFssaiNumber ? (settings['fssai_number'] || '') : '';
  const receiptFooter = printReceiptFooter ? (settings['receipt_footer_note'] || 'Thank you for shopping with us! Please visit again.') : '';

  const [isPrinting, setIsPrinting] = useState(false);

  const effectiveGstPaise = gstEnabled ? (billData?.gstTotalPaise || 0) : 0;
  const effectiveGrandTotalPaise = billData
    ? (gstEnabled
        ? billData.grandTotalPaise
        : Math.max(0, billData.subtotalPaise - billData.discountAmountPaise))
    : 0;
  const effectiveChangeDuePaise = billData?.changeDuePaise ?? (
    billData?.tenderedCashPaise && billData.tenderedCashPaise > effectiveGrandTotalPaise
      ? billData.tenderedCashPaise - effectiveGrandTotalPaise
      : 0
  );

  const handlePrint = async () => {
    if (!billData || isPrinting) return;

    setIsPrinting(true);
    try {
      // Map items for native direct printing
      const printItems = billData.items.map((it) => {
        const name = 'product_name' in it ? it.product_name : (it as any).product_name_snapshot || 'Item';
        const unitPrice = 'unit_price_paise' in it ? it.unit_price_paise : 0;
        const lineTotal = 'line_total_paise' in it ? it.line_total_paise : unitPrice * it.quantity;
        return {
          name,
          quantity: it.quantity,
          unit_price_paise: unitPrice,
          line_total_paise: lineTotal,
        };
      });

      const res = await api.printReceipt({
        bill_id: billData.billId,
        bill_number: billData.billNumber,
        business_date: billData.businessDate,
        bill_time: billData.billTime,
        cashier_name: billData.cashierName || 'Staff',
        items: printItems,
        subtotal_paise: billData.subtotalPaise,
        discount_amount_paise: billData.discountAmountPaise,
        gst_total_paise: effectiveGstPaise,
        grand_total_paise: effectiveGrandTotalPaise,
        payment_method: billData.paymentMethod,
        tendered_cash_paise: billData.cashAmountPaise || billData.tenderedCashPaise,
        change_due_paise: effectiveChangeDuePaise,
        paper_size: activePaperFormat,
        printer_name: savedPrinterName,
        copies: savedCopies,
        shop_logo: shopLogo || undefined,
      });

      toast.success(res || `Bill: ${String(billData.billNumber).padStart(5, '0')} printed successfully`);
    } catch (err: any) {
      console.error('Direct print failed:', err);
      const errMsg = typeof err === 'string' ? err : err?.message || 'Unable to print. Please verify the selected printer.';
      toast.error(errMsg);
    } finally {
      setIsPrinting(false);
    }
  };

  const handleDone = () => {
    if (onStartNextBill) {
      onStartNextBill();
    } else {
      onClose();
    }
  };

  // Keyboard shortcut Ctrl+P or F8 to print
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey && (e.key === 'p' || e.key === 'P')) || e.key === 'F8') {
        e.preventDefault();
        handlePrint();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handlePrint]);

  if (!billData) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title || `Bill: ${String(billData.billNumber).padStart(5, '0')} Completed`}
      maxWidth={isSheetFormat ? '4xl' : 'lg'}
      footer={
        <div className="flex items-center justify-between gap-3 w-full">
          <button
            type="button"
            onClick={handleDone}
            className="btn-secondary h-11 px-5 text-xs font-bold rounded-xl flex items-center justify-center gap-2 cursor-pointer hover:bg-surface-100 transition-colors whitespace-nowrap"
          >
            <span>Continue to Next Bill</span>
            <ArrowRight className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={handlePrint}
            disabled={isPrinting}
            className="btn-primary h-11 px-6 text-xs font-bold flex items-center justify-center gap-2 rounded-xl shadow-md cursor-pointer hover:opacity-95 transition-all whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
            title="Print receipt [Ctrl+P or F8]"
          >
            {isPrinting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Printing...</span>
              </>
            ) : (
              <>
                <Printer className="w-4 h-4" />
                <span>Print Receipt</span>
              </>
            )}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Success Confirmation Banner */}
        <div className="p-3.5 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center flex-shrink-0">
              <CheckCircle2 className="w-4 h-4" />
            </div>
            <div>
              <div className="text-sm font-bold text-emerald-900">
                Payment Completed Successfully!
              </div>
              <div className="text-2xs text-emerald-700 font-medium">
                Bill: {String(billData.billNumber).padStart(5, '0')} • Recorded in database
              </div>
            </div>
          </div>

          <div className="text-right">
            <div className="text-2xs text-emerald-700 font-bold uppercase tracking-wider">Grand Total</div>
            <div className="font-mono text-lg font-black text-emerald-950">
              {formatCurrency(effectiveGrandTotalPaise)}
            </div>
          </div>
        </div>

        {/* Change Due Callout (if cash change exists) */}
        {effectiveChangeDuePaise > 0 && (
          <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 flex items-center justify-between">
            <span className="text-xs font-bold text-amber-900 uppercase tracking-wide">
              Change to Return to Customer:
            </span>
            <span className="font-mono text-xl font-black text-amber-950">
              {formatCurrency(effectiveChangeDuePaise)}
            </span>
          </div>
        )}

        {/* ========================================================= */}
        {/* PRINTABLE BILL RECEIPT (Visible on screen and on paper) */}
        {/* ========================================================= */}
        <div className="overflow-x-auto p-2 bg-surface-50 rounded-lg border border-surface-200 flex justify-center">
          {is58mm ? (
            <Thermal58Receipt
              billData={billData}
              shopName={shopName}
              shopPhone={shopPhone}
              shopAddress={shopAddress}
              shopEmail={shopEmail}
              shopLogo={shopLogo}
              gstEnabled={gstEnabled}
              gstNumber={gstNumber}
              fssaiNumber={fssaiNumber}
              receiptFooter={receiptFooter}
            />
          ) : isSheetFormat ? (
            <A4TaxInvoice
              billData={billData}
              shopName={shopName}
              shopPhone={shopPhone}
              shopAddress={shopAddress}
              shopEmail={shopEmail}
              shopLogo={shopLogo}
              gstEnabled={gstEnabled}
              gstNumber={gstNumber}
              fssaiNumber={fssaiNumber}
              receiptFooter={receiptFooter}
              paperFormat={activePaperFormat}
            />
          ) : (
            <Thermal80Receipt
              billData={billData}
              shopName={shopName}
              shopPhone={shopPhone}
              shopAddress={shopAddress}
              shopEmail={shopEmail}
              shopLogo={shopLogo}
              gstEnabled={gstEnabled}
              gstNumber={gstNumber}
              fssaiNumber={fssaiNumber}
              receiptFooter={receiptFooter}
              paperFormat={activePaperFormat}
            />
          )}
        </div>
      </div>
    </Modal>
  );
};
