import React, { useState, useEffect } from 'react';
import { Printer, CheckCircle2, ArrowRight } from 'lucide-react';
import { Modal } from './Modal';
import { useSettings } from '../contexts/SettingsContext';
import { formatCurrency, amountInWordsINR } from '../lib/format';
import type { CartItem } from '../types';

export interface ReceiptBillItem {
  product_name: string;
  product_code?: string;
  quantity: number;
  unit_price_paise: number;
  line_total_paise: number;
}

export interface ReceiptBillData {
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
  shopLogo,
  gstEnabled,
  gstNumber,
  fssaiNumber,
  receiptFooter,
}) => {
  const totalQuantity = billData.items.reduce((acc, i) => acc + i.quantity, 0);
  const halfGstPaise = Math.round(billData.gstTotalPaise / 2);

  return (
    <div
      id="printable-receipt"
      className="bg-white rounded-lg border border-surface-300 shadow-sm p-4 font-mono text-surface-950 w-[340px] text-xs leading-normal print-thermal80"
    >
      {/* Shop Header */}
      <div className="text-center pb-2 border-b border-dashed border-surface-400">
        {shopLogo && (
          <div className="flex justify-center mb-1.5">
            <img src={shopLogo} alt={shopName} className="h-10 object-contain" />
          </div>
        )}
        <h2 className="text-sm font-black tracking-wider uppercase text-black">
          {shopName}
        </h2>
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
        {gstEnabled && gstNumber && (
          <p className="text-3xs font-bold text-surface-900 mt-0.5">
            GSTIN: {gstNumber}
          </p>
        )}
        {fssaiNumber && (
          <p className="text-3xs font-semibold text-surface-700 mt-0.5">
            FSSAI / Lic: {fssaiNumber}
          </p>
        )}
      </div>

      {/* Bill Meta Row */}
      <div className="py-2 border-b border-dashed border-surface-400 text-3xs flex flex-col gap-0.5">
        <div className="flex justify-between items-center font-bold">
          <span>INVOICE: #{billData.billNumber}</span>
          <span>{billData.businessDate} {billData.billTime || ''}</span>
        </div>
        <div className="flex justify-between items-center text-surface-700">
          <span>Cashier: {billData.cashierName || 'Staff'}</span>
          <span className="font-bold uppercase text-black">
            Mode: {billData.paymentMethod.replace('_', ' + ')}
          </span>
        </div>
      </div>

      {/* 80mm 4-Column Table */}
      <div className="py-2 border-b border-dashed border-surface-400">
        <table className="w-full text-2xs">
          <thead>
            <tr className="border-b border-surface-300 text-surface-600 text-3xs font-bold uppercase">
              <th className="text-left py-0.5">Item</th>
              <th className="text-center py-0.5 w-10">Qty</th>
              <th className="text-right py-0.5 w-14">Rate</th>
              <th className="text-right py-0.5 w-16">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-200">
            {billData.items.map((it, idx) => {
              const name = 'product_name' in it ? it.product_name : (it as any).product_name_snapshot || 'Item';
              const unitPrice = 'unit_price_paise' in it ? it.unit_price_paise : 0;
              const lineTotal = 'line_total_paise' in it ? it.line_total_paise : unitPrice * it.quantity;
              return (
                <tr key={idx} className="py-0.5">
                  <td className="py-0.5 text-left font-semibold text-black pr-1 leading-tight">
                    {name}
                  </td>
                  <td className="py-0.5 text-center font-bold text-surface-800">
                    {it.quantity}
                  </td>
                  <td className="py-0.5 text-right text-surface-700">
                    {formatCurrency(unitPrice)}
                  </td>
                  <td className="py-0.5 text-right font-black text-black">
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
          <span className="font-bold">{formatCurrency(billData.subtotalPaise)}</span>
        </div>

        {billData.discountAmountPaise > 0 && (
          <div className="flex justify-between text-red-600 font-bold">
            <span>Discount:</span>
            <span>-{formatCurrency(billData.discountAmountPaise)}</span>
          </div>
        )}

        {gstEnabled && billData.gstTotalPaise > 0 && (
          <>
            <div className="flex justify-between text-surface-700">
              <span>CGST:</span>
              <span>{formatCurrency(halfGstPaise)}</span>
            </div>
            <div className="flex justify-between text-surface-700">
              <span>SGST:</span>
              <span>{formatCurrency(billData.gstTotalPaise - halfGstPaise)}</span>
            </div>
          </>
        )}

        {/* Grand Total */}
        <div className="flex justify-between items-center pt-1 border-t border-surface-400 text-xs font-black text-black">
          <span className="uppercase tracking-tight">NET TOTAL:</span>
          <span className="text-sm font-black">{formatCurrency(billData.grandTotalPaise)}</span>
        </div>
      </div>

      {/* Payment & Change breakdown */}
      <div className="py-1.5 border-b border-dashed border-surface-400 text-3xs space-y-0.5 text-surface-800">
        <div className="flex justify-between">
          <span>Payment Mode:</span>
          <span className="font-black uppercase text-black">
            {billData.paymentMethod.replace('_', ' + ')}
          </span>
        </div>
        {billData.paymentMethod === 'cash' && billData.tenderedCashPaise && billData.tenderedCashPaise > 0 ? (
          <>
            <div className="flex justify-between">
              <span>Tendered Cash:</span>
              <span className="font-bold">{formatCurrency(billData.tenderedCashPaise)}</span>
            </div>
            <div className="flex justify-between font-black text-black">
              <span>Change Returned:</span>
              <span>{formatCurrency(billData.changeDuePaise || 0)}</span>
            </div>
          </>
        ) : null}
      </div>

      {/* Footer Thank You Note */}
      <div className="pt-2 text-center text-4xs text-surface-600 space-y-0.5">
        <p className="font-bold text-black uppercase">{receiptFooter}</p>
        <p>Goods once sold cannot be returned without bill.</p>
        <p className="text-surface-400 font-mono text-[9px] pt-0.5">
          *** AESCION POS TERMINAL (80mm) ***
        </p>
      </div>
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
  gstEnabled: boolean;
  gstNumber: string;
  receiptFooter: string;
}> = ({
  billData,
  shopName,
  shopPhone,
  shopAddress,
  gstEnabled,
  gstNumber,
  receiptFooter,
}) => {
  return (
    <div
      id="printable-receipt"
      className="bg-white rounded-lg border border-surface-300 shadow-sm p-2.5 font-mono text-surface-950 w-[240px] text-2xs leading-tight print-thermal58"
    >
      {/* Header */}
      <div className="text-center pb-1.5 border-b border-dashed border-surface-400">
        <h2 className="text-xs font-black tracking-wider uppercase text-black">
          {shopName}
        </h2>
        {shopAddress && (
          <p className="text-4xs text-surface-700 mt-0.5 truncate">{shopAddress}</p>
        )}
        {shopPhone && (
          <p className="text-4xs text-surface-800 font-bold">Ph: {shopPhone}</p>
        )}
        {gstEnabled && gstNumber && (
          <p className="text-4xs font-bold text-surface-900">GST: {gstNumber}</p>
        )}
      </div>

      {/* Meta */}
      <div className="py-1 border-b border-dashed border-surface-400 text-4xs flex flex-col gap-0.5">
        <div className="flex justify-between items-center font-bold">
          <span>INV: #{billData.billNumber}</span>
          <span>{billData.businessDate} {billData.billTime ? billData.billTime.slice(0, 5) : ''}</span>
        </div>
        <div className="flex justify-between items-center text-surface-600">
          <span>By: {billData.cashierName || 'Staff'}</span>
          <span className="font-bold text-black uppercase">{billData.paymentMethod.replace('_', '+')}</span>
        </div>
      </div>

      {/* Condensed 2-Line Items */}
      <div className="py-1.5 border-b border-dashed border-surface-400 space-y-1.5 text-3xs">
        <div className="flex justify-between border-b border-surface-300 pb-0.5 font-bold uppercase text-surface-600 text-4xs">
          <span>Item & Qty x Rate</span>
          <span>Amount</span>
        </div>
        {billData.items.map((it, idx) => {
          const name = 'product_name' in it ? it.product_name : (it as any).product_name_snapshot || 'Item';
          const unitPrice = 'unit_price_paise' in it ? it.unit_price_paise : 0;
          const lineTotal = 'line_total_paise' in it ? it.line_total_paise : unitPrice * it.quantity;
          return (
            <div key={idx} className="flex justify-between items-baseline">
              <div className="truncate pr-1">
                <div className="font-bold text-black truncate">{name}</div>
                <div className="text-4xs text-surface-600">
                  {it.quantity} x {formatCurrency(unitPrice)}
                </div>
              </div>
              <div className="font-bold text-black flex-shrink-0">
                {formatCurrency(lineTotal)}
              </div>
            </div>
          );
        })}
      </div>

      {/* Totals */}
      <div className="py-1 border-b border-dashed border-surface-400 space-y-0.5 text-3xs">
        <div className="flex justify-between text-surface-700">
          <span>Subtotal:</span>
          <span>{formatCurrency(billData.subtotalPaise)}</span>
        </div>
        {billData.discountAmountPaise > 0 && (
          <div className="flex justify-between text-red-600 font-bold">
            <span>Discount:</span>
            <span>-{formatCurrency(billData.discountAmountPaise)}</span>
          </div>
        )}
        {gstEnabled && billData.gstTotalPaise > 0 && (
          <div className="flex justify-between text-surface-700">
            <span>Taxes (GST):</span>
            <span>{formatCurrency(billData.gstTotalPaise)}</span>
          </div>
        )}
        <div className="flex justify-between items-center pt-0.5 border-t border-surface-400 text-xs font-black text-black">
          <span>TOTAL:</span>
          <span>{formatCurrency(billData.grandTotalPaise)}</span>
        </div>
      </div>

      {/* Tendered & Change */}
      {billData.paymentMethod === 'cash' && billData.tenderedCashPaise && billData.tenderedCashPaise > 0 ? (
        <div className="py-1 border-b border-dashed border-surface-400 text-4xs space-y-0.5 text-surface-700">
          <div className="flex justify-between">
            <span>Cash Tendered:</span>
            <span>{formatCurrency(billData.tenderedCashPaise)}</span>
          </div>
          <div className="flex justify-between font-bold text-black">
            <span>Change Return:</span>
            <span>{formatCurrency(billData.changeDuePaise || 0)}</span>
          </div>
        </div>
      ) : null}

      {/* Footer */}
      <div className="pt-1.5 text-center text-4xs text-surface-500 space-y-0.5">
        <p className="font-bold text-black">{receiptFooter}</p>
        <p className="text-[8px] font-mono">*** 58mm MINI POS ***</p>
      </div>
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
  const totalQuantity = billData.items.reduce((acc, i) => acc + i.quantity, 0);
  const halfGstPaise = Math.round(billData.gstTotalPaise / 2);

  return (
    <div
      id="printable-receipt"
      className="bg-white rounded-lg border border-surface-400 shadow-md p-6 font-sans text-surface-900 w-full max-w-[760px] text-xs leading-normal print-a4"
    >
      {/* Top Banner: Tax Invoice Label */}
      <div className="flex items-center justify-between border-b-2 border-surface-900 pb-3 mb-4">
        <div className="flex items-center gap-3">
          {shopLogo ? (
            <img src={shopLogo} alt={shopName} className="h-12 max-w-[120px] object-contain" />
          ) : (
            <div className="w-12 h-12 bg-surface-900 text-white font-bold flex items-center justify-center rounded text-sm">
              {shopName.slice(0, 2).toUpperCase()}
            </div>
          )}
          <div>
            <h1 className="text-lg font-black tracking-wide text-surface-950 uppercase">
              {shopName}
            </h1>
            <p className="text-2xs text-surface-600 font-medium whitespace-pre-line max-w-sm">
              {shopAddress || 'Store Location & Billing Desk'}
            </p>
            <div className="flex items-center gap-3 text-2xs text-surface-700 font-semibold mt-0.5">
              {shopPhone && <span>Phone: {shopPhone}</span>}
              {shopEmail && <span>Email: {shopEmail}</span>}
            </div>
            <div className="flex items-center gap-3 text-2xs text-surface-800 font-bold mt-0.5">
              {gstEnabled && gstNumber && <span>GSTIN: {gstNumber}</span>}
              {fssaiNumber && <span>FSSAI / Lic: {fssaiNumber}</span>}
            </div>
          </div>
        </div>

        <div className="text-right">
          <div className="inline-block bg-surface-950 text-white font-black px-3 py-1 text-xs rounded uppercase tracking-wider mb-2">
            Tax Invoice / Cash Bill
          </div>
          <div className="text-2xs space-y-0.5 text-surface-700">
            <div className="font-bold text-surface-950 text-xs">
              Invoice #: <span className="font-mono text-primary-700">INV-#{billData.billNumber}</span>
            </div>
            <div>Date: <span className="font-semibold font-mono">{billData.businessDate}</span></div>
            <div>Time: <span className="font-semibold font-mono">{billData.billTime || ''}</span></div>
            <div>Place of Supply: <span className="font-semibold">Local State (INTRA-STATE)</span></div>
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
            Payment Method: <span className="font-bold uppercase text-surface-900">{billData.paymentMethod.replace('_', ' + ')}</span>
          </div>
        </div>
      </div>

      {/* Formal Bordered Table */}
      <div className="border border-surface-300 rounded-lg overflow-hidden mb-4">
        <table className="w-full text-2xs text-left">
          <thead className="bg-surface-100 border-b border-surface-300 font-bold text-surface-800 uppercase tracking-wider text-3xs">
            <tr>
              <th className="py-2 px-2.5 w-10 text-center">#</th>
              <th className="py-2 px-2.5">Item Description</th>
              <th className="py-2 px-2.5 w-20 text-center">Code</th>
              <th className="py-2 px-2.5 w-14 text-center">Qty</th>
              <th className="py-2 px-2.5 w-20 text-right">Unit Rate</th>
              <th className="py-2 px-2.5 w-16 text-right">Disc</th>
              <th className="py-2 px-2.5 w-24 text-right">Amount (₹)</th>
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
                  <td className="py-2 px-2.5 text-center font-mono text-surface-500 font-semibold">{idx + 1}</td>
                  <td className="py-2 px-2.5 font-bold text-surface-900">{name}</td>
                  <td className="py-2 px-2.5 text-center font-mono text-surface-600 text-3xs">{code}</td>
                  <td className="py-2 px-2.5 text-center font-bold font-mono text-surface-900">{it.quantity}</td>
                  <td className="py-2 px-2.5 text-right font-mono text-surface-700">{formatCurrency(unitPrice)}</td>
                  <td className="py-2 px-2.5 text-right font-mono text-red-600">—</td>
                  <td className="py-2 px-2.5 text-right font-mono font-bold text-surface-950">{formatCurrency(lineTotal)}</td>
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
              {amountInWordsINR(billData.grandTotalPaise)}
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
              <span className="font-bold text-surface-900 uppercase">{billData.paymentMethod.replace('_', ' + ')}</span>
            </div>
            {billData.paymentMethod === 'cash' && billData.tenderedCashPaise && billData.tenderedCashPaise > 0 ? (
              <div className="flex justify-between text-2xs pt-1 border-t border-surface-100 font-mono">
                <span className="text-surface-600">Tendered: {formatCurrency(billData.tenderedCashPaise)}</span>
                <span className="font-bold text-surface-900">Change Return: {formatCurrency(billData.changeDuePaise || 0)}</span>
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

            {gstEnabled && billData.gstTotalPaise > 0 && (
              <div className="py-1 space-y-1">
                <div className="flex justify-between items-center text-surface-600 text-3xs">
                  <span>Central GST (CGST):</span>
                  <span className="font-mono font-semibold">{formatCurrency(halfGstPaise)}</span>
                </div>
                <div className="flex justify-between items-center text-surface-600 text-3xs">
                  <span>State GST (SGST):</span>
                  <span className="font-mono font-semibold">{formatCurrency(billData.gstTotalPaise - halfGstPaise)}</span>
                </div>
              </div>
            )}

            <div className="flex justify-between items-center text-surface-700 py-1">
              <span>Round Off:</span>
              <span className="font-mono text-surface-500">₹0.00</span>
            </div>
          </div>

          {/* Net Payable Highlight Box */}
          <div className="p-2.5 bg-surface-900 text-white rounded-lg flex items-center justify-between">
            <span className="font-bold text-xs uppercase tracking-wider">Net Amount:</span>
            <span className="font-mono text-base font-black">
              {formatCurrency(billData.grandTotalPaise)}
            </span>
          </div>
        </div>
      </div>

      {/* Signatory Footer Strip */}
      <div className="pt-4 border-t border-surface-300 flex items-end justify-between text-2xs">
        <div className="text-3xs text-surface-500">
          <p className="font-bold text-surface-700">{receiptFooter}</p>
          <p>This is a computer generated invoice. No signature required for retail counter sales.</p>
        </div>

        <div className="text-center w-48">
          <div className="font-bold text-surface-900 text-2xs mb-8">For {shopName.toUpperCase()}</div>
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
  const { settings, gstEnabled, updateSetting } = useSettings();

  const [paperSize, setPaperSize] = useState<'Thermal80' | 'Thermal58' | 'A4'>(
    (settings['printer_paper_size'] as any) || 'Thermal80'
  );

  useEffect(() => {
    if (settings['printer_paper_size']) {
      setPaperSize(settings['printer_paper_size'] as any);
    }
  }, [settings['printer_paper_size']]);

  const handleSelectPaper = (size: 'Thermal80' | 'Thermal58' | 'A4') => {
    setPaperSize(size);
    updateSetting('printer_paper_size', size).catch(() => {});
  };

  const shopName = settings['shop_name'] || 'AESCION BILLING';
  const shopPhone = settings['shop_phone'] || '';
  const shopAddress = settings['shop_address'] || '';
  const shopEmail = settings['shop_email'] || '';
  const shopLogo = settings['shop_logo'] || '';
  const gstNumber = settings['gst_number'] || '';
  const fssaiNumber = settings['fssai_number'] || '';
  const receiptFooter = settings['receipt_footer_note'] || 'Thank you for shopping with us! Please visit again.';

  const handlePrint = () => {
    window.print();
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
  }, [isOpen]);

  if (!billData) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title || `Bill #${billData.billNumber} Completed`}
      maxWidth={paperSize === 'A4' ? '4xl' : 'lg'}
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
            className="btn-primary h-11 px-6 text-xs font-bold flex items-center justify-center gap-2 rounded-xl shadow-md cursor-pointer hover:opacity-95 transition-all whitespace-nowrap"
            title="Print receipt [Ctrl+P or F8]"
          >
            <Printer className="w-4 h-4" />
            <span>Print Receipt</span>
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Success Confirmation Banner */}
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center flex-shrink-0">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div>
              <div className="text-sm font-bold text-emerald-900">
                Payment Completed Successfully!
              </div>
              <div className="text-2xs text-emerald-700 font-medium">
                Bill #{billData.billNumber} • Recorded in database
              </div>
            </div>
          </div>

          <div className="text-right">
            <div className="text-2xs text-emerald-700 font-bold uppercase tracking-wider">Grand Total</div>
            <div className="font-mono text-lg font-black text-emerald-950">
              {formatCurrency(billData.grandTotalPaise)}
            </div>
          </div>
        </div>

        {/* Change Due Callout (if cash change exists) */}
        {billData.changeDuePaise !== undefined && billData.changeDuePaise > 0 && (
          <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-between">
            <span className="text-xs font-bold text-amber-900 uppercase tracking-wide">
              Change to Return to Customer:
            </span>
            <span className="font-mono text-xl font-black text-amber-950">
              {formatCurrency(billData.changeDuePaise)}
            </span>
          </div>
        )}

        {/* Format Selector: 80mm Thermal, 58mm Thermal, Standard A4 */}
        <div className="bg-surface-100 p-1.5 rounded-xl border border-surface-200 flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 text-xs font-bold text-surface-700 pl-1">
            <Printer className="w-4 h-4 text-primary-600" />
            <span>Printer Format:</span>
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => handleSelectPaper('Thermal80')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                paperSize === 'Thermal80'
                  ? 'bg-primary-600 text-white shadow-sm'
                  : 'bg-white text-surface-700 border border-surface-200 hover:bg-surface-50'
              }`}
            >
              80mm Thermal
            </button>

            <button
              type="button"
              onClick={() => handleSelectPaper('Thermal58')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                paperSize === 'Thermal58'
                  ? 'bg-primary-600 text-white shadow-sm'
                  : 'bg-white text-surface-700 border border-surface-200 hover:bg-surface-50'
              }`}
            >
              58mm Thermal
            </button>

            <button
              type="button"
              onClick={() => handleSelectPaper('A4')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                paperSize === 'A4'
                  ? 'bg-primary-600 text-white shadow-sm'
                  : 'bg-white text-surface-700 border border-surface-200 hover:bg-surface-50'
              }`}
            >
              A4 Sheet
            </button>
          </div>
        </div>

        {/* ========================================================= */}
        {/* PRINTABLE BILL RECEIPT (Visible on screen and on paper) */}
        {/* ========================================================= */}
        <div className="overflow-x-auto p-1 bg-surface-100/60 rounded-xl border border-surface-200 flex justify-center">
          {paperSize === 'Thermal80' && (
            <Thermal80Receipt
              billData={billData}
              shopName={shopName}
              shopPhone={shopPhone}
              shopAddress={shopAddress}
              shopLogo={shopLogo}
              gstEnabled={gstEnabled}
              gstNumber={gstNumber}
              fssaiNumber={fssaiNumber}
              receiptFooter={receiptFooter}
            />
          )}

          {paperSize === 'Thermal58' && (
            <Thermal58Receipt
              billData={billData}
              shopName={shopName}
              shopPhone={shopPhone}
              shopAddress={shopAddress}
              gstEnabled={gstEnabled}
              gstNumber={gstNumber}
              receiptFooter={receiptFooter}
            />
          )}

          {paperSize === 'A4' && (
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
            />
          )}
        </div>
      </div>
    </Modal>
  );
};
