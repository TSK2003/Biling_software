import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  Search,
  ShoppingCart,
  Plus,
  Minus,
  Trash2,
  CreditCard,
  Banknote,
  QrCode,
  CheckCircle2,
  RotateCcw,
  PackagePlus,
  X,
  AlertCircle,
  AlertTriangle,
  Ban,
  Sparkles,
} from 'lucide-react';
import { api } from '../../lib/ipc';
import { useAuth } from '../../contexts/AuthContext';
import { useSettings } from '../../contexts/SettingsContext';
import { formatCurrency, paiseToRupeesStr, rupeesToPaise } from '../../lib/format';
import { Modal } from '../../components/Modal';
import { Header } from '../../components/Header';
import { CustomSelect } from '../../components/CustomSelect';
import { ReceiptPrintModal, ReceiptBillData } from '../../components/ReceiptPrintModal';
import type { BillingProduct, Category, CartItem, CompleteBillResponse, DraftBill } from '../../types';
import toast from 'react-hot-toast';

// ===================== Multi-Tab Bill System =====================
interface BillTab {
  id: string;
  label: string;
  cart: CartItem[];
  discountType: 'none' | 'percentage' | 'fixed';
  discountValue: number;
}

const TABS_KEY = 'billing_tabs';
const MAX_TABS = 10;

function createNewTab(num: number): BillTab {
  return {
    id: `tab-${num}-${Date.now()}`,
    label: `Bill ${num}`,
    cart: [],
    discountType: 'none',
    discountValue: 0,
  };
}

function loadTabsFromStorage(): { tabs: BillTab[]; activeId: string } {
  try {
    const raw = sessionStorage.getItem(TABS_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      if (Array.isArray(data.tabs) && data.tabs.length > 0) {
        const renumbered = data.tabs.map((t: BillTab, idx: number) => ({
          ...t,
          label: `Bill ${idx + 1}`,
        }));
        const validActiveId = renumbered.some((t: BillTab) => t.id === data.activeId)
          ? data.activeId
          : renumbered[0].id;
        return {
          tabs: renumbered,
          activeId: validActiveId,
        };
      }
    }
  } catch { /* ignore */ }
  const first = createNewTab(1);
  return { tabs: [first], activeId: first.id };
}
// =================================================================

export const BillingPage: React.FC = () => {
  const { user, isAdmin } = useAuth();
  const { gstEnabled, defaultPaymentMethod, currencySymbol } = useSettings();

  // ===================== Tab State =====================
  const [_initTabs] = useState(loadTabsFromStorage);
  const [tabs, setTabs] = useState<BillTab[]>(_initTabs.tabs);
  const [activeTabId, setActiveTabId] = useState<string>(_initTabs.activeId);
  const [nextBillNumber, setNextBillNumber] = useState<number>(1);

  // Derived active tab + index + cart
  const activeTabIndex = useMemo(() => {
    const idx = tabs.findIndex((t) => t.id === activeTabId);
    return idx >= 0 ? idx : 0;
  }, [tabs, activeTabId]);

  const activeTab = tabs[activeTabIndex] || tabs[0];
  const cart = activeTab.cart;
  const discountType = activeTab.discountType;
  const discountValue = activeTab.discountValue;

  // Tab-scoped update helpers
  const updateActiveTab = useCallback(
    (updater: (tab: BillTab) => BillTab) => {
      setTabs((prev) => prev.map((t) => (t.id === activeTabId ? updater(t) : t)));
    },
    [activeTabId]
  );

  const setCartForTab = useCallback(
    (newCart: CartItem[] | ((prev: CartItem[]) => CartItem[])) => {
      updateActiveTab((tab) => ({
        ...tab,
        cart: typeof newCart === 'function' ? newCart(tab.cart) : newCart,
      }));
    },
    [updateActiveTab]
  );

  const setDiscountTypeForTab = useCallback(
    (type: 'none' | 'percentage' | 'fixed') => {
      updateActiveTab((tab) => ({
        ...tab,
        discountType: type,
        discountValue: type === 'none' ? 0 : tab.discountValue,
      }));
    },
    [updateActiveTab]
  );

  const setDiscountValueForTab = useCallback(
    (value: number) => {
      updateActiveTab((tab) => ({ ...tab, discountValue: value }));
    },
    [updateActiveTab]
  );

  // ===================== Tab Operations =====================
  const handleAddTab = useCallback(() => {
    if (tabs.length >= MAX_TABS) {
      toast.error(`Maximum ${MAX_TABS} bill tabs allowed at once`);
      return;
    }
    const newIndex = tabs.length + 1;
    const newTab = createNewTab(newIndex);
    setTabs((prev) => {
      const nextList = [...prev, newTab];
      return nextList.map((t, idx) => ({ ...t, label: `Bill ${idx + 1}` }));
    });
    setActiveTabId(newTab.id);
  }, [tabs.length]);

  const handleCloseTab = useCallback(
    (tabId: string) => {
      const closingIndex = tabs.findIndex((t) => t.id === tabId);
      if (closingIndex === -1) return;
      const tab = tabs[closingIndex];
      const billNum = closingIndex + 1;

      // If tab has items, confirm discard
      if (tab.cart.length > 0) {
        if (
          !window.confirm(
            `"Bill ${billNum}" has ${tab.cart.length} item(s) in the cart.\nDiscard this bill draft?`
          )
        ) {
          return;
        }
      }

      // If last tab: just reset instead of closing
      if (tabs.length <= 1) {
        setTabs([createNewTab(1)]);
        if (user?.id) api.deleteDraft(user.id);
        toast.success('Bill 1 cleared');
        return;
      }

      // Renumber remaining tabs sequentially: 1, 2, 3...
      // Closing intermediator (e.g. Tab 2 of 3) causes Tab 3 to become Tab 2
      const remainingTabs = tabs
        .filter((t) => t.id !== tabId)
        .map((t, idx) => ({
          ...t,
          label: `Bill ${idx + 1}`,
        }));

      setTabs(remainingTabs);

      if (activeTabId === tabId) {
        const nextActiveIndex = Math.min(closingIndex, remainingTabs.length - 1);
        setActiveTabId(remainingTabs[nextActiveIndex].id);
      }
      toast.success(`Bill ${billNum} closed. Remaining bills renumbered.`);
    },
    [tabs, activeTabId, user?.id]
  );

  // ===================== Catalog State =====================
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [products, setProducts] = useState<BillingProduct[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Payment Modal State
  const [isPaymentOpen, setIsPaymentOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'upi' | 'upi_cash'>('cash');
  const [tenderedCash, setTenderedCash] = useState<string>('');
  const [splitUpi, setSplitUpi] = useState<string>('');
  const [splitCash, setSplitCash] = useState<string>('');
  const [isCompleting, setIsCompleting] = useState(false);

  // Success Receipt Modal State
  const [completedBill, setCompletedBill] = useState<CompleteBillResponse | null>(null);
  const [completedBillData, setCompletedBillData] = useState<ReceiptBillData | null>(null);
  const [isReceiptOpen, setIsReceiptOpen] = useState(false);

  // Draft Recovery State
  const [recoveredDraft, setRecoveredDraft] = useState<DraftBill | null>(null);
  const [isRecoveryOpen, setIsRecoveryOpen] = useState(false);

  // Custom Item Modal State
  const [isCustomItemOpen, setIsCustomItemOpen] = useState(false);
  const [customItemName, setCustomItemName] = useState('');
  const [customItemPrice, setCustomItemPrice] = useState('');
  const [customItemQty, setCustomItemQty] = useState('1');
  const [customItemGstEnabled, setCustomItemGstEnabled] = useState(false);
  const [customItemGstPct, setCustomItemGstPct] = useState('5');

  const searchInputRef = useRef<HTMLInputElement>(null);

  // ========= Persist ALL tabs to sessionStorage (navigation safety) =========
  useEffect(() => {
    sessionStorage.setItem(
      TABS_KEY,
      JSON.stringify({ tabs, activeId: activeTabId })
    );
  }, [tabs, activeTabId]);

  // ========= Load initial categories & products =========
  useEffect(() => {
    const initData = async () => {
      try {
        const [cats, prods, nextNum] = await Promise.all([
          api.getCategories(true),
          api.getBillingProducts(),
          api.getNextBillNumber().catch(() => 1),
        ]);
        setCategories(cats);
        setProducts(prods);
        if (typeof nextNum === 'number') {
          setNextBillNumber(nextNum);
        }

        // Enrich any existing tab carts with image_path from prods if missing
        setTabs((prevTabs) =>
          prevTabs.map((tab) => ({
            ...tab,
            cart: tab.cart.map((ci) => {
              if (ci.image_path) return ci;
              const match = prods.find((p) => p.id === ci.product_id);
              return match?.image_path ? { ...ci, image_path: match.image_path } : ci;
            }),
          }))
        );

        // Only check backend draft if ALL tabs are empty (fresh session)
        const hasExistingItems = tabs.some((t) => t.cart.length > 0);
        if (!hasExistingItems && user?.id) {
          const draft = await api.loadDraft(user.id);
          if (draft && draft.cart_items.length > 0) {
            setRecoveredDraft(draft);
            setIsRecoveryOpen(true);
          }
        }
      } catch (err) {
        console.error('Failed to load billing data', err);
      } finally {
        setIsLoading(false);
      }
    };
    initData();
  }, [user?.id]);

  // ========= Search & category filter =========
  useEffect(() => {
    const fetchFiltered = async () => {
      try {
        const prods = await api.getBillingProducts(
          selectedCategory || undefined,
          searchQuery.trim() || undefined
        );
        setProducts(prods);
      } catch (err) {
        console.error('Search error', err);
      }
    };
    const timer = setTimeout(fetchFiltered, 250);
    return () => clearTimeout(timer);
  }, [selectedCategory, searchQuery]);

  // ========= Autosave active tab draft to SQLite backend =========
  useEffect(() => {
    if (!user?.id) return;
    const saveTimer = setTimeout(() => {
      if (cart.length > 0) {
        api.saveDraft(
          user.id,
          JSON.stringify(cart),
          JSON.stringify({ discount_type: discountType, discount_value: discountValue })
        );
      } else {
        api.deleteDraft(user.id);
      }
    }, 2000);
    return () => clearTimeout(saveTimer);
  }, [cart, discountType, discountValue, user?.id]);

  // ========= Comprehensive POS Keyboard Shortcuts =========
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInput =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable;

      // F2 or Ctrl+F → Search Focus
      if (e.key === 'F2' || (e.ctrlKey && (e.key === 'f' || e.key === 'F'))) {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
        return;
      }

      // F4 → Open Payment Modal
      if (e.key === 'F4') {
        e.preventDefault();
        if (cart.length > 0) {
          handleOpenPayment();
        } else {
          toast.error('Cart is empty. Add products first.');
        }
        return;
      }

      // Ctrl+N → New Bill Tab
      if (e.ctrlKey && (e.key === 'n' || e.key === 'N')) {
        e.preventDefault();
        handleAddTab();
        return;
      }

      // Ctrl+P → Print / View Receipt
      if (e.ctrlKey && (e.key === 'p' || e.key === 'P')) {
        e.preventDefault();
        if (completedBill) {
          setIsReceiptOpen(true);
        }
        return;
      }

      // Escape → Close active modals
      if (e.key === 'Escape') {
        setIsPaymentOpen(false);
        setIsReceiptOpen(false);
        setIsRecoveryOpen(false);
        setIsCustomItemOpen(false);
        if (isInput) (target as HTMLInputElement).blur();
        return;
      }

      // '+' / '-' → Adjust last item quantity if not inside an input
      if (!isInput && cart.length > 0) {
        const lastItem = cart[cart.length - 1];
        if (e.key === '+' || e.key === '=') {
          e.preventDefault();
          updateQuantity(lastItem.product_id, lastItem.quantity + 1);
        } else if (e.key === '-' || e.key === '_') {
          e.preventDefault();
          updateQuantity(lastItem.product_id, lastItem.quantity - 1);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [cart, completedBill, tabs]);

  // ========= Cart Manipulations (tab-scoped) =========
  const addToCart = useCallback(
    (product: BillingProduct) => {
      const isRestockable = !!product.is_restockable;
      const availableStock = product.current_stock ?? 0;

      if (isRestockable && availableStock <= 0) {
        toast.error(`"${product.name}" is Out of Stock (0 units available)`);
        return;
      }

      setCartForTab((prev) => {
        const existing = prev.find((item) => item.product_id === product.id);
        if (existing) {
          if (isRestockable && existing.quantity + 1 > availableStock) {
            toast.error(`Cannot add more. Only ${availableStock} units of "${product.name}" available in stock.`);
            return prev;
          }
          return prev.map((item) =>
            item.product_id === product.id
              ? { ...item, quantity: item.quantity + 1 }
              : item
          );
        }
        return [
          ...prev,
          {
            product_id: product.id,
            product_code: product.product_code,
            product_name: product.name,
            category_name: product.category_name,
            image_path: product.image_path,
            unit_price_paise: product.selling_price_paise,
            quantity: 1,
            gst_enabled: product.gst_enabled,
            gst_percentage_x100: product.gst_percentage_x100,
          },
        ];
      });
    },
    [setCartForTab]
  );

  // Add custom item to cart
  const handleAddCustomItem = () => {
    if (!customItemName.trim() || !customItemPrice) {
      toast.error('Please enter item name and price');
      return;
    }

    const pricePaise = rupeesToPaise(customItemPrice);
    if (pricePaise <= 0) {
      toast.error('Price must be greater than 0');
      return;
    }

    const qty = parseInt(customItemQty) || 1;
    const customId = -(Date.now() + Math.floor(Math.random() * 10000)); // Unique negative ID to distinguish from real products
    const gstPctX100 = customItemGstEnabled ? Math.round(parseFloat(customItemGstPct || '0') * 100) : 0;

    setCartForTab((prev) => [
      ...prev,
      {
        product_id: customId,
        product_code: 'CUSTOM',
        product_name: customItemName.trim(),
        category_name: 'Custom',
        image_path: null,
        unit_price_paise: pricePaise,
        quantity: qty,
        gst_enabled: customItemGstEnabled,
        gst_percentage_x100: gstPctX100,
      },
    ]);

    toast.success(`Custom item "${customItemName.trim()}" added to cart`);
    setIsCustomItemOpen(false);
    setCustomItemName('');
    setCustomItemPrice('');
    setCustomItemQty('1');
    setCustomItemGstEnabled(false);
    setCustomItemGstPct('5');
  };

  const updateQuantity = (productId: number, qty: number) => {
    if (qty <= 0) {
      removeFromCart(productId);
      return;
    }
    const catProd = products.find((p) => p.id === productId);
    if (catProd && catProd.is_restockable) {
      const availableStock = catProd.current_stock ?? 0;
      if (qty > availableStock) {
        toast.error(`Only ${availableStock} units in stock for "${catProd.name}"`);
        qty = availableStock;
      }
    }
    setCartForTab((prev) =>
      prev.map((item) =>
        item.product_id === productId ? { ...item, quantity: qty } : item
      )
    );
  };

  const removeFromCart = (productId: number) => {
    setCartForTab((prev) => prev.filter((item) => item.product_id !== productId));
  };

  const handleClearCart = () => {
    if (cart.length === 0) return;
    updateActiveTab((tab) => ({
      ...tab,
      cart: [],
      discountType: 'none',
      discountValue: 0,
    }));
    if (user?.id) api.deleteDraft(user.id);
  };

  // ========= Monetary Calculations (Strict Integer Paise) =========
  const calculations = useMemo(() => {
    let subtotalPaise = 0;
    let gstTotalPaise = 0;

    for (const item of cart) {
      const lineTotal = item.unit_price_paise * item.quantity;
      subtotalPaise += lineTotal;

      if (gstEnabled && item.gst_enabled && item.gst_percentage_x100 > 0) {
        const itemGst = Math.round(
          (lineTotal * item.gst_percentage_x100) / 10000
        );
        gstTotalPaise += itemGst;
      }
    }

    let discountAmountPaise = 0;
    if (discountType === 'percentage' && discountValue > 0) {
      const clampedPct = Math.min(Math.max(discountValue, 0), 100);
      discountAmountPaise = Math.round((subtotalPaise * clampedPct) / 100);
    } else if (discountType === 'fixed' && discountValue > 0) {
      discountAmountPaise = rupeesToPaise(discountValue);
    }

    // Ensure discount does not exceed subtotal
    discountAmountPaise = Math.min(discountAmountPaise, subtotalPaise);

    const grandTotalPaise = Math.max(
      0,
      subtotalPaise + gstTotalPaise - discountAmountPaise
    );

    return {
      subtotalPaise,
      gstTotalPaise,
      discountAmountPaise,
      grandTotalPaise,
      itemCount: cart.reduce((sum, item) => sum + item.quantity, 0),
    };
  }, [cart, discountType, discountValue, gstEnabled]);

  // ========= Stock Validation for Cart Items =========
  const outOfStockCartItems = useMemo(() => {
    return cart.filter((item) => {
      const p = products.find((prod) => prod.id === item.product_id);
      if (p && p.is_restockable) {
        const avail = p.current_stock ?? 0;
        return avail <= 0 || item.quantity > avail;
      }
      return false;
    });
  }, [cart, products]);

  const hasOutOfStockItems = outOfStockCartItems.length > 0;

  // ========= Payment Handling =========
  const handleOpenPayment = () => {
    if (cart.length === 0) return;
    if (hasOutOfStockItems) {
      const names = outOfStockCartItems.map((i) => `"${i.product_name}"`).join(', ');
      toast.error(`Cannot proceed: Stock is zero or exceeded for ${names}. Please adjust cart before payment.`);
      return;
    }
    setPaymentMethod((defaultPaymentMethod as any) || 'cash');
    setTenderedCash(paiseToRupeesStr(calculations.grandTotalPaise));
    setSplitCash(
      paiseToRupeesStr(Math.floor(calculations.grandTotalPaise / 2))
    );
    setSplitUpi(
      paiseToRupeesStr(
        calculations.grandTotalPaise -
          Math.floor(calculations.grandTotalPaise / 2)
      )
    );
    setIsPaymentOpen(true);
  };

  const handleCompleteBill = async () => {
    if (!user?.id || cart.length === 0) return;
    if (hasOutOfStockItems) {
      const names = outOfStockCartItems.map((i) => `"${i.product_name}"`).join(', ');
      toast.error(`Cannot complete bill: Stock is zero or exceeded for ${names}. Please remove them to proceed.`);
      return;
    }

    let cashPaise = 0;
    let cardPaise = 0;
    let upiPaise = 0;

    if (paymentMethod === 'cash') {
      const tendered = rupeesToPaise(tenderedCash);
      if (tendered < calculations.grandTotalPaise) {
        toast.error('Tendered cash is less than the total payable amount');
        return;
      }
      cashPaise = tendered;
    } else if (paymentMethod === 'card') {
      cardPaise = calculations.grandTotalPaise;
    } else if (paymentMethod === 'upi') {
      upiPaise = calculations.grandTotalPaise;
    } else if (paymentMethod === 'upi_cash') {
      cashPaise = rupeesToPaise(splitCash);
      upiPaise = rupeesToPaise(splitUpi);
      if (cashPaise + upiPaise < calculations.grandTotalPaise) {
        toast.error('Sum of UPI + Cash must match the Grand Total');
        return;
      }
    }

    setIsCompleting(true);
    try {
      const response = await api.completeBill({
        userId: user.id,
        items: cart,
        discountType,
        discountValue,
        paymentMethod,
        cashAmountPaise: cashPaise,
        cardAmountPaise: cardPaise,
        upiAmountPaise: upiPaise,
      });

      const billData: ReceiptBillData = {
        billId: response.bill_id,
        billNumber: response.bill_number,
        billUuid: response.bill_uuid,
        businessDate: response.business_date,
        billTime: response.bill_time || new Date().toLocaleTimeString(),
        cashierName: user?.display_name || user?.username || 'Staff',
        items: [...cart],
        subtotalPaise: calculations.subtotalPaise,
        discountAmountPaise: calculations.discountAmountPaise,
        discountType,
        discountValue,
        gstTotalPaise: calculations.gstTotalPaise,
        grandTotalPaise: calculations.grandTotalPaise,
        paymentMethod,
        tenderedCashPaise: paymentMethod === 'cash' || paymentMethod === 'upi_cash' ? cashPaise : 0,
        changeDuePaise: response.change_due_paise ?? Math.max(0, cashPaise - calculations.grandTotalPaise),
      };

      setCompletedBill(response);
      setCompletedBillData(billData);
      setIsPaymentOpen(false);
      setIsReceiptOpen(true);

      // Auto-close the completed tab if there are other tabs open
      if (tabs.length > 1) {
        const closingIndex = tabs.findIndex((t) => t.id === activeTabId);
        const remaining = tabs
          .filter((t) => t.id !== activeTabId)
          .map((t, idx) => ({ ...t, label: `Bill ${idx + 1}` }));
        setTabs(remaining);
        const nextActiveIndex = Math.min(
          closingIndex >= 0 ? closingIndex : 0,
          remaining.length - 1
        );
        setActiveTabId(remaining[nextActiveIndex].id);
      } else {
        // Only tab: reset it for next bill
        updateActiveTab((tab) => ({
          ...tab,
          cart: [],
          discountType: 'none',
          discountValue: 0,
        }));
      }

      if (user?.id) api.deleteDraft(user.id);
      api.getNextBillNumber().then((n) => setNextBillNumber(n)).catch(() => setNextBillNumber((p) => p + 1));
      api.getBillingProducts(selectedCategory || undefined, searchQuery.trim() || undefined).then(setProducts).catch(console.error);
      toast.success(`Bill #${response.bill_number} generated successfully!`);
    } catch (err: any) {
      toast.error(typeof err === 'string' ? err : 'Failed to complete bill');
    } finally {
      setIsCompleting(false);
    }
  };

  // ========= Draft Recovery Handlers =========
  const handleResumeDraft = () => {
    if (recoveredDraft) {
      const enrichedCart = recoveredDraft.cart_items.map((ci) => {
        if (ci.image_path) return ci;
        const match = products.find((p) => p.id === ci.product_id);
        return match?.image_path ? { ...ci, image_path: match.image_path } : ci;
      });
      updateActiveTab((tab) => ({
        ...tab,
        cart: enrichedCart,
        discountType: recoveredDraft.discount?.discount_type || 'none',
        discountValue: recoveredDraft.discount?.discount_value || 0,
      }));
      toast.success('Unfinished bill restored from crash recovery!');
    }
    setIsRecoveryOpen(false);
  };

  const handleDiscardDraft = () => {
    if (user?.id) api.deleteDraft(user.id);
    setIsRecoveryOpen(false);
  };

  // =================================================================
  // RENDER
  // =================================================================
  return (
    <div className="flex flex-col h-full overflow-hidden bg-surface-100">
      {/* Top Header */}
      <Header
        title="POS Billing Terminal"
        subtitle="Quick order entry and instant checkout"
        actions={
          <div className="flex items-center gap-1.5 lg:gap-2">
            <span className="text-xs font-mono font-bold text-primary-700 bg-primary-50 px-2.5 py-1.5 rounded-lg border border-primary-200 shadow-2xs whitespace-nowrap">
              Bill #{activeTabIndex + 1}
            </span>
            <span className="text-xs font-mono text-surface-600 bg-surface-100 px-2.5 py-1.5 rounded-lg border border-surface-200 whitespace-nowrap hidden sm:inline-block">
              Inv #{nextBillNumber}
            </span>
            <span className="text-xs font-mono text-surface-600 bg-surface-100 px-2.5 py-1.5 rounded-lg border border-surface-200 whitespace-nowrap hidden 2xl:inline-block">
              <kbd className="font-bold text-surface-800">F2</kbd> Search • <kbd className="font-bold text-surface-800">F4</kbd> Pay • <kbd className="font-bold text-surface-800">Ctrl+N</kbd> New
            </span>
          </div>
        }
      />

      {/* Main POS Grid Area */}
      <div className="flex-1 flex overflow-hidden p-3 gap-3">
        {/* Left Column: Category Tabs + Search + Products Catalog */}
        <div className="flex-1 flex flex-col min-w-0 bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
          {/* Search Bar & Category Filter Bar */}
          <div className="p-3.5 border-b border-surface-200 space-y-3 bg-surface-50/50">
            {/* Search Input + Custom Item Button */}
            <div className="flex items-center gap-2.5">
              <div className="relative flex-1">
                <Search className="w-5 h-5 text-surface-400 absolute left-3.5 top-3.5" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      const q = searchQuery.trim().toLowerCase();
                      if (!q) return;
                      const matched =
                        products.find(
                          (p) =>
                            p.product_code.toLowerCase() === q ||
                            p.name.toLowerCase() === q
                        ) || (products.length === 1 ? products[0] : null);

                      if (matched) {
                        if (matched.is_restockable && (matched.current_stock ?? 0) <= 0) {
                          toast.error(`"${matched.name}" is Out of Stock (0 available)`);
                          return;
                        }
                        addToCart(matched);
                        setSearchQuery('');
                        toast.success(`Added ${matched.name}`);
                      } else if (products.length > 1) {
                        if (products[0].is_restockable && (products[0].current_stock ?? 0) <= 0) {
                          toast.error(`"${products[0].name}" is Out of Stock (0 available)`);
                          return;
                        }
                        addToCart(products[0]);
                        setSearchQuery('');
                        toast.success(`Added ${products[0].name}`);
                      } else {
                        toast.error(`No product matching "${searchQuery}"`);
                      }
                    }
                  }}
                  placeholder="Scan barcode or search products... [F2]"
                  className="form-input pl-11 h-12 text-base shadow-xs"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-3 top-3.5 text-sm text-surface-400 hover:text-surface-600 font-medium"
                  >
                    Clear
                  </button>
                )}
              </div>
              <button
                onClick={() => setIsCustomItemOpen(true)}
                className="btn-secondary flex items-center gap-2 whitespace-nowrap text-base font-semibold h-12 px-4 shadow-xs"
                title="Add a custom item directly to the bill"
              >
                <PackagePlus className="w-5 h-5 text-primary-600" />
                <span>Custom Item</span>
              </button>
            </div>

            {/* Category Filter Pills */}
            <div className="flex items-center gap-2.5 overflow-x-auto pb-1 no-scrollbar">
              <button
                onClick={() => setSelectedCategory(null)}
                className={`category-tab ${
                  selectedCategory === null ? 'active' : ''
                }`}
              >
                All Items
              </button>
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategory(cat.id)}
                  className={`category-tab ${
                    selectedCategory === cat.id ? 'active' : ''
                  }`}
                >
                  {cat.name}
                </button>
              ))}
            </div>
          </div>

          {/* Product Cards Grid */}
          <div className="flex-1 p-3 overflow-y-auto">
            {isLoading ? (
              <div className="h-full flex items-center justify-center text-surface-400">
                <div className="spinner mr-2" /> Loading catalog...
              </div>
            ) : products.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-surface-400 text-sm">
                <p>No products found.</p>
                <p className="text-xs text-surface-400 mt-1">
                  Add products in the Catalog tab to get started.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-4 2xl:grid-cols-5 gap-3">
                {products.map((product) => {
                  const isRestockable = !!product.is_restockable;
                  const currentStock = product.current_stock ?? 0;
                  const isOutOfStock = isRestockable && currentStock <= 0;
                  const isRedAlert = isRestockable && currentStock > 0 && currentStock <= 2;
                  const isYellowAlert = isRestockable && currentStock >= 3 && currentStock <= 5;

                  let borderStyle = '';
                  if (isOutOfStock) {
                    borderStyle = 'border-2 border-red-300 bg-surface-100/70 opacity-60 grayscale-[30%] cursor-not-allowed hover:border-red-400';
                  } else if (isRedAlert) {
                    borderStyle = 'border-2 border-red-500 bg-red-50/20 shadow-xs shadow-red-200/50 hover:border-red-600';
                  } else if (isYellowAlert) {
                    borderStyle = 'border-2 border-amber-400 bg-amber-50/20 shadow-xs shadow-amber-200/50 hover:border-amber-500';
                  }

                  return (
                    <div
                      key={product.id}
                      onClick={() => {
                        if (isOutOfStock) {
                          toast.error(`"${product.name}" is Out of Stock (0 available)`);
                          return;
                        }
                        addToCart(product);
                      }}
                      className={`product-card flex flex-col justify-between group relative transition-all ${borderStyle}`}
                      title={
                        isRestockable
                          ? isOutOfStock
                            ? `"${product.name}" is Out of Stock`
                            : `Click to add ${product.name} to cart (Stock: ${currentStock})`
                          : `Click to add ${product.name} to cart`
                      }
                    >
                      <div>
                        {/* Product Image preview or initial fallback */}
                        <div className="relative w-full aspect-[4/3] rounded-lg bg-surface-100 mb-2 flex items-center justify-center text-primary-600 font-black text-3xl overflow-hidden group-hover:bg-primary-50 transition-colors">
                          {product.image_path ? (
                            <img
                              src={product.image_path}
                              alt={product.name}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                            />
                          ) : (
                            product.name.charAt(0).toUpperCase()
                          )}

                          {/* Dynamic Color Badges for Restockable Products */}
                          {isOutOfStock && (
                            <div className="absolute top-1.5 right-1.5 z-10 flex items-center gap-1 px-2 py-0.5 rounded-md font-mono font-bold text-xs bg-red-700 text-white shadow-md">
                              <Ban className="w-3 h-3 text-white flex-shrink-0" />
                              <span>Out of Stock</span>
                            </div>
                          )}
                          {isRedAlert && (
                            <div className="absolute top-1.5 right-1.5 z-10 flex items-center gap-1 px-2 py-0.5 rounded-md font-mono font-bold text-xs bg-red-600 text-white shadow-md animate-pulse">
                              <AlertCircle className="w-3 h-3 text-white flex-shrink-0" />
                              <span>{currentStock} Left</span>
                            </div>
                          )}
                          {isYellowAlert && (
                            <div className="absolute top-1.5 right-1.5 z-10 flex items-center gap-1 px-2 py-0.5 rounded-md font-mono font-bold text-xs bg-amber-500 text-white shadow-md">
                              <AlertTriangle className="w-3 h-3 text-white flex-shrink-0" />
                              <span>{currentStock} Left</span>
                            </div>
                          )}
                        </div>
                        <div className="product-card-name" title={product.name}>
                          {product.name}
                        </div>
                        <div className="flex items-center justify-between mt-0.5">
                          <div
                            className="product-card-code"
                            title={product.product_code}
                          >
                            {product.product_code}
                          </div>
                          {isRestockable && currentStock > 5 && (
                            <span className="text-xs font-mono font-bold text-surface-600">
                              {currentStock} in stock
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center justify-between mt-2 pt-2 border-t border-surface-100 gap-1.5 min-w-0">
                        <span className="product-card-price truncate tabular-nums min-w-0" title={formatCurrency(product.selling_price_paise)}>
                          {formatCurrency(product.selling_price_paise)}
                        </span>
                        <span className="text-xs sm:text-sm bg-primary-50 group-hover:bg-primary-600 group-hover:text-white text-primary-700 px-2.5 py-1 rounded-lg font-extrabold transition-all shrink-0 whitespace-nowrap shadow-2xs group-hover:shadow-xs">
                          +Add
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Active Cart Panel — Expanded Width */}
        <div className="w-[440px] xl:w-[460px] flex flex-col bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
          {/* ======== MULTI-TAB BAR (Notepad++ Style) ======== */}
          <div className="flex items-end gap-1 px-2.5 pt-2 pb-0 bg-surface-100/90 border-b border-surface-200 overflow-x-auto no-scrollbar flex-shrink-0 h-11 select-none">
            {tabs.map((tab, idx) => {
              const tabItemCount = tab.cart.reduce((s, i) => s + i.quantity, 0);
              const isActive = tab.id === activeTabId;
              const billLabel = `Bill ${idx + 1}`;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTabId(tab.id)}
                  className={`group flex items-center gap-1.5 px-3.5 h-9 text-xs font-semibold whitespace-nowrap rounded-t-lg relative cursor-pointer transition-colors duration-100 border border-b-0 -mb-px outline-none ${
                    isActive
                      ? 'bg-white text-primary-700 border-surface-200 shadow-xs z-10 font-bold'
                      : 'bg-transparent text-surface-500 border-transparent hover:text-surface-800 hover:bg-surface-200/60'
                  }`}
                >
                  <span>{billLabel}</span>
                  {tabItemCount > 0 && (
                    <span
                      className={`text-2xs px-1.5 py-0.5 rounded-full font-bold leading-none ${
                        isActive
                          ? 'bg-primary-100 text-primary-700'
                          : 'bg-surface-300 text-surface-700'
                      }`}
                    >
                      {tabItemCount}
                    </span>
                  )}
                  {tabs.length > 1 && (
                    <span
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCloseTab(tab.id);
                      }}
                      className="ml-0.5 p-0.5 rounded hover:bg-red-100 hover:text-red-600 text-surface-400 opacity-60 group-hover:opacity-100 transition-colors cursor-pointer"
                      title={`Close ${billLabel}`}
                    >
                      <X className="w-3 h-3" />
                    </span>
                  )}
                </button>
              );
            })}
            {tabs.length < MAX_TABS && (
              <button
                type="button"
                onClick={handleAddTab}
                className="h-8 w-8 mb-1 flex items-center justify-center rounded-lg text-surface-400 hover:text-primary-600 hover:bg-surface-200/80 transition-colors ml-0.5 flex-shrink-0 cursor-pointer outline-none"
                title="Open a new bill tab (Ctrl+N)"
              >
                <Plus className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Cart Header */}
          <div className="card-header bg-surface-50/50 py-3 px-4">
            <div className="flex items-center gap-2.5">
              <ShoppingCart className="w-5 h-5 text-primary-600 flex-shrink-0" />
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-base font-bold text-surface-900">
                    Bill {activeTabIndex + 1}
                  </span>
                  <span className="badge badge-primary text-2xs font-semibold px-2 py-0.5">
                    Draft #{activeTabIndex + 1}
                  </span>
                </div>
                <div className="text-[11px] text-surface-500 font-medium">
                  Active POS Draft &bull; Next Invoice #{nextBillNumber}
                </div>
              </div>
              <span className="badge badge-info text-xs px-2.5 py-0.5 ml-auto">
                {calculations.itemCount} items
              </span>
            </div>
            {cart.length > 0 && (
              <button
                onClick={handleClearCart}
                className="text-sm text-red-600 hover:text-red-700 font-semibold flex items-center gap-1 cursor-pointer"
                title="Clear entire cart"
              >
                <Trash2 className="w-4 h-4" />
                <span>Clear</span>
              </button>
            )}
          </div>

          {/* Cart Items List */}
          <div className="flex-1 overflow-y-auto p-2">
            {cart.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-surface-400 text-sm">
                <ShoppingCart className="w-10 h-10 text-surface-300 mb-2" />
                <p className="font-medium text-surface-600">Cart is empty</p>
                <p className="text-xs text-surface-400 mt-1">
                  Click any product on the left to start billing
                </p>
              </div>
            ) : (
              <div className="space-y-1.5">
                {cart.map((item) => {
                  const catProd = products.find((p) => p.id === item.product_id);
                  const itemImage = item.image_path || catProd?.image_path;
                  const isRestockable = !!catProd?.is_restockable;
                  const avail = isRestockable ? (catProd?.current_stock ?? 0) : undefined;
                  const isZeroStock = isRestockable && avail !== undefined && avail <= 0;
                  const isExceeded = isRestockable && avail !== undefined && item.quantity > avail;
                  const hasStockIssue = isZeroStock || isExceeded;
                  const atMax = isRestockable && avail !== undefined && item.quantity >= avail;

                  return (
                    <div
                      key={item.product_id}
                      className={`p-2.5 rounded-xl border flex flex-col gap-1.5 transition-all ${
                        hasStockIssue
                          ? 'bg-red-50/70 border-red-300 ring-1 ring-red-400/30'
                          : item.product_code === 'CUSTOM'
                          ? 'bg-amber-50/50 border-amber-200'
                          : 'bg-surface-50 border-surface-200'
                      }`}
                    >
                      <div className="flex items-start gap-2 justify-between">
                        {/* Cart Item Thumbnail */}
                        <div className="w-12 h-12 rounded-lg bg-surface-100 border border-surface-200 flex items-center justify-center overflow-hidden flex-shrink-0">
                          {itemImage ? (
                            <img
                              src={itemImage}
                              alt={item.product_name}
                              className="w-full h-full object-cover"
                              onError={(e) => {
                                (e.currentTarget as HTMLElement).style.display = 'none';
                              }}
                            />
                          ) : (
                            <div className="text-base font-bold text-surface-400 flex items-center justify-center">
                              {item.product_code === 'CUSTOM' ? (
                                <Sparkles className="w-4 h-4 text-amber-500" />
                              ) : (
                                item.product_name.charAt(0).toUpperCase()
                              )}
                            </div>
                          )}
                        </div>

                        <div className="min-w-0 flex-1 pr-1">
                          <div className="text-base font-extrabold text-surface-900 leading-snug break-words">
                            {item.product_name}
                            {item.product_code === 'CUSTOM' && (
                              <span className="ml-1.5 text-2xs bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded font-bold">
                                Custom
                              </span>
                            )}
                            {gstEnabled && item.gst_enabled && item.gst_percentage_x100 > 0 && (
                              <span className="ml-1.5 text-2xs bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded font-bold font-mono">
                                GST {item.gst_percentage_x100 / 100}%
                              </span>
                            )}
                          </div>
                          <div className="text-xs sm:text-sm text-surface-600 font-mono mt-0.5 flex items-center gap-1.5 flex-wrap font-medium">
                            <span>{formatCurrency(item.unit_price_paise)} each</span>
                            {isZeroStock && (
                              <span className="text-xs text-red-700 bg-red-100/90 border border-red-200 px-1.5 py-0.5 rounded font-bold flex items-center gap-1">
                                <AlertCircle className="w-3 h-3 text-red-600 flex-shrink-0" />
                                Out of Stock (0 available)
                              </span>
                            )}
                            {!isZeroStock && isExceeded && (
                              <span className="text-xs text-red-700 bg-red-100/90 border border-red-200 px-1.5 py-0.5 rounded font-bold flex items-center gap-1">
                                <AlertTriangle className="w-3 h-3 text-red-600 flex-shrink-0" />
                                Exceeds Stock ({avail} max)
                              </span>
                            )}
                            {!hasStockIssue && atMax && (
                              <span className="text-xs text-amber-700 bg-amber-100/70 px-1.5 py-0.5 rounded font-semibold">
                                Max Stock ({avail})
                              </span>
                            )}
                          </div>
                        </div>
                        <div
                          className="text-base sm:text-lg font-black text-surface-900 font-mono shrink-0 text-right tabular-nums whitespace-nowrap pl-1"
                          title={formatCurrency(item.unit_price_paise * item.quantity)}
                        >
                          {formatCurrency(item.unit_price_paise * item.quantity)}
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-1.5 border-t border-surface-200/60">
                        {/* Quantity Buttons with Stock Capping */}
                        <div className="qty-control bg-white flex-shrink-0">
                          <button
                            onClick={() =>
                              updateQuantity(item.product_id, item.quantity - 1)
                            }
                            className="qty-btn"
                            title="Decrease quantity (-)"
                          >
                            <Minus className="w-4 h-4" />
                          </button>
                          <input
                            type="number"
                            min="1"
                            max={avail}
                            value={item.quantity}
                            onChange={(e) =>
                              updateQuantity(
                                item.product_id,
                                parseInt(e.target.value) || 1
                              )
                            }
                            className="qty-input"
                          />
                          <button
                            onClick={() =>
                              updateQuantity(item.product_id, item.quantity + 1)
                            }
                            disabled={atMax || isZeroStock}
                            className={`qty-btn ${atMax || isZeroStock ? 'opacity-35 cursor-not-allowed bg-surface-100' : ''}`}
                            title={
                              isZeroStock
                                ? 'Product is out of stock (0 available)'
                                : atMax
                                ? `Maximum stock reached (${avail} units)`
                                : "Increase quantity (+)"
                            }
                          >
                            <Plus className="w-4 h-4" />
                          </button>
                        </div>

                        {/* Remove Button */}
                        <button
                          onClick={() => removeFromCart(item.product_id)}
                          className="text-surface-400 hover:text-red-600 p-1.5 transition-colors"
                          title="Remove product"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Cart Summary & Checkout Footer */}
          <div className="p-4 border-t border-surface-200 bg-surface-50/50 space-y-2.5">
            {/* Subtotal */}
            <div className="flex items-center justify-between text-base text-surface-700">
              <span className="font-medium">Subtotal</span>
              <span className="font-mono font-bold">
                {formatCurrency(calculations.subtotalPaise)}
              </span>
            </div>

            {/* Discount Control Row with Staff Limits and Dynamic Currency */}
            <div className="flex items-center justify-between text-base">
              <div className="flex items-center gap-1.5">
                <span className="text-surface-700 font-medium">Discount:</span>
                <CustomSelect
                  value={discountType}
                  onChange={(val) => {
                    setDiscountTypeForTab(val as any);
                  }}
                  options={[
                    { value: 'none', label: 'None' },
                    { value: 'percentage', label: '% Pct' },
                    { value: 'fixed', label: `${currencySymbol} Fixed` },
                  ]}
                  size="sm"
                  buttonClassName="w-24 h-7 text-xs font-medium rounded-lg"
                />
              </div>

              {discountType !== 'none' ? (
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    min="0"
                    max={discountType === 'percentage' ? 100 : undefined}
                    value={discountValue || ''}
                    onChange={(e) => {
                      const entered = parseFloat(e.target.value) || 0;
                      const maxAllowed = isAdmin ? 100 : (user?.max_discount_pct ?? 10);
                      if (discountType === 'percentage' && !isAdmin && entered > maxAllowed) {
                        toast.error(`Staff discount limit is ${maxAllowed}%. Clamped to limit.`);
                        setDiscountValueForTab(maxAllowed);
                        return;
                      }
                      setDiscountValueForTab(entered);
                    }}
                    placeholder="0"
                    className="w-20 text-right text-base px-2 py-1 border border-surface-300 rounded-lg bg-white font-mono font-bold"
                  />
                  <span className="font-mono text-base text-red-600 font-bold">
                    -{formatCurrency(calculations.discountAmountPaise)}
                  </span>
                </div>
              ) : (
                <span className="text-sm text-surface-400 font-mono">
                  {formatCurrency(0)}
                </span>
              )}
            </div>

            {/* Optional GST Row - Only shown when GST is enabled and > 0 */}
            {gstEnabled && calculations.gstTotalPaise > 0 && (
              <div className="flex items-center justify-between text-base text-surface-700">
                <span className="font-medium">GST (Taxes)</span>
                <span className="font-mono font-bold">
                  {formatCurrency(calculations.gstTotalPaise)}
                </span>
              </div>
            )}

            {/* Grand Total Bar */}
            <div className="pt-3 border-t-2 border-surface-200 flex items-center justify-between">
              <span className="text-xl font-extrabold text-surface-900">
                Grand Total
              </span>
              <span className="text-3xl font-black text-primary-700 font-mono tracking-tight tabular-nums">
                {formatCurrency(calculations.grandTotalPaise)}
              </span>
            </div>

            {/* Out of Stock Alert Banner */}
            {hasOutOfStockItems && (
              <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-800 font-bold flex items-center gap-2.5 shadow-2xs">
                <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0" />
                <span>Items with 0 stock or exceeding stock detected. Remove or adjust them before checkout.</span>
              </div>
            )}

            {/* Checkout Button */}
            <button
              onClick={handleOpenPayment}
              disabled={cart.length === 0 || hasOutOfStockItems}
              className="btn-success w-full py-4 flex items-center justify-center gap-3 text-lg font-extrabold shadow-md cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed mt-2 tracking-wide"
            >
              <span>Collect Payment [F4]</span>
              <span className="font-mono text-base bg-accent-700 px-3 py-1 rounded-md font-bold whitespace-nowrap tabular-nums">
                {formatCurrency(calculations.grandTotalPaise)}
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* Custom Item Modal */}
      <Modal
        isOpen={isCustomItemOpen}
        onClose={() => setIsCustomItemOpen(false)}
        title="Add Custom Item to Bill"
        maxWidth="sm"
        footer={
          <div className="flex items-center justify-end gap-2 w-full">
            <button
              onClick={() => setIsCustomItemOpen(false)}
              className="btn-secondary text-sm"
            >
              Cancel
            </button>
            <button
              onClick={handleAddCustomItem}
              className="btn-primary text-sm flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>Add to Cart</span>
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-surface-500">
            Add a custom product directly to the bill without creating it in the
            product catalog.
          </p>

          <div className="form-group">
            <label className="form-label text-sm font-semibold">
              Item Name *
            </label>
            <input
              type="text"
              value={customItemName}
              onChange={(e) => setCustomItemName(e.target.value)}
              placeholder="Item Name"
              className="form-input text-base h-11"
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="form-group">
              <label className="form-label text-sm font-semibold">
                Price (₹) *
              </label>
              <input
                type="number"
                step="any"
                min="0"
                value={customItemPrice}
                onChange={(e) => setCustomItemPrice(e.target.value)}
                placeholder="0.00"
                className="form-input font-mono font-bold text-base h-11"
              />
            </div>

            <div className="form-group">
              <label className="form-label text-sm font-semibold">
                Quantity
              </label>
              <input
                type="number"
                min="1"
                value={customItemQty}
                onChange={(e) => setCustomItemQty(e.target.value)}
                placeholder="1"
                className="form-input font-mono font-bold text-base h-11"
              />
            </div>
          </div>

          {/* GST Toggle Option for Custom Item - Only if GST enabled */}
          {gstEnabled && (
            <div className="p-3 rounded-lg bg-surface-50 border border-surface-200 space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs font-semibold text-surface-800">Item GST Rate</div>
                  <div className="text-3xs text-surface-500">Apply GST percentage on this custom item</div>
                </div>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={customItemGstEnabled}
                    onChange={(e) => setCustomItemGstEnabled(e.target.checked)}
                    className="form-checkbox"
                  />
                  <span className="text-xs font-medium text-surface-700">Enable GST</span>
                </label>
              </div>

              {customItemGstEnabled && (
                <div className="pt-2 border-t border-surface-200 flex items-center justify-between gap-2">
                  <span className="text-xs text-surface-600 font-medium">GST Percentage:</span>
                  <CustomSelect
                    value={customItemGstPct}
                    onChange={setCustomItemGstPct}
                    options={[
                      { value: '0', label: '0%' },
                      { value: '5', label: '5%' },
                      { value: '12', label: '12%' },
                      { value: '18', label: '18%' },
                      { value: '28', label: '28%' },
                    ]}
                    size="sm"
                    buttonClassName="w-24 h-8 text-xs font-mono font-medium rounded-lg"
                  />
                </div>
              )}
            </div>
          )}

          <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800">
            <strong>Note:</strong> Custom items are not saved to your product
            catalog. They appear only on this bill.
          </div>
        </div>
      </Modal>

      {/* Payment Modal — Clean, Spacious & Perfectly Aligned */}
      <Modal
        isOpen={isPaymentOpen}
        onClose={() => setIsPaymentOpen(false)}
        title="Complete Payment & Generate Bill"
        maxWidth="lg"
        closeOnBackdropClick={false}
        footer={
          <div className="flex items-center justify-between gap-3 w-full">
            <button
              type="button"
              onClick={() => setIsPaymentOpen(false)}
              className="btn-secondary h-12 px-5 text-sm font-semibold rounded-xl flex items-center justify-center gap-2 cursor-pointer hover:bg-surface-100 transition-colors whitespace-nowrap"
            >
              <span>Back to Cart</span>
            </button>
            <button
              type="button"
              onClick={handleCompleteBill}
              disabled={
                isCompleting ||
                (paymentMethod === 'cash' &&
                  rupeesToPaise(tenderedCash) < calculations.grandTotalPaise)
              }
              className="btn-success h-12 px-6 text-base font-bold flex items-center justify-center gap-2.5 rounded-xl shadow-md cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition-all whitespace-nowrap"
            >
              {isCompleting ? (
                <>
                  <div className="spinner w-5 h-5 border-white" />
                  <span>Processing...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
                  <span>
                    Confirm Payment ({formatCurrency(calculations.grandTotalPaise)})
                  </span>
                </>
              )}
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          {/* Bill Summary Strip — Improved with gradient */}
          <div className="p-4 rounded-xl bg-gradient-to-r from-primary-50 to-primary-100/50 border border-primary-200 flex items-center justify-between">
            <div>
              <div className="text-xs text-primary-600 uppercase font-bold tracking-wider">
                Total Payable
              </div>
              <div className="text-3xl font-black text-primary-700 font-mono mt-0.5">
                {formatCurrency(calculations.grandTotalPaise)}
              </div>
            </div>
            <div className="text-right text-sm text-surface-600 space-y-0.5">
              <div>
                {calculations.itemCount} items •{' '}
                {formatCurrency(calculations.subtotalPaise)}
              </div>
              {calculations.discountAmountPaise > 0 && (
                <div className="text-red-600 font-semibold">
                  Discount: -{formatCurrency(calculations.discountAmountPaise)}
                </div>
              )}
              {gstEnabled && calculations.gstTotalPaise > 0 && (
                <div>GST: {formatCurrency(calculations.gstTotalPaise)}</div>
              )}
            </div>
          </div>

          {/* Payment Method Selector Grid */}
          <div>
            <label className="form-label mb-2 block text-sm font-semibold text-surface-800">
              Select Payment Method
            </label>
            <div className="grid grid-cols-4 gap-2.5">
              <button
                type="button"
                onClick={() => setPaymentMethod('cash')}
                className={`h-20 rounded-xl border-2 text-center flex flex-col items-center justify-center gap-1.5 transition-all cursor-pointer ${
                  paymentMethod === 'cash'
                    ? 'border-primary-600 bg-primary-50 text-primary-700 font-bold shadow-xs'
                    : 'border-surface-200 hover:bg-surface-50 text-surface-700'
                }`}
              >
                <Banknote className="w-6 h-6" />
                <span className="text-sm font-bold">Cash</span>
              </button>

              <button
                type="button"
                onClick={() => setPaymentMethod('upi')}
                className={`h-20 rounded-xl border-2 text-center flex flex-col items-center justify-center gap-1.5 transition-all cursor-pointer ${
                  paymentMethod === 'upi'
                    ? 'border-primary-600 bg-primary-50 text-primary-700 font-bold shadow-xs'
                    : 'border-surface-200 hover:bg-surface-50 text-surface-700'
                }`}
              >
                <QrCode className="w-6 h-6" />
                <span className="text-sm font-bold">UPI</span>
              </button>

              <button
                type="button"
                onClick={() => setPaymentMethod('card')}
                className={`h-20 rounded-xl border-2 text-center flex flex-col items-center justify-center gap-1.5 transition-all cursor-pointer ${
                  paymentMethod === 'card'
                    ? 'border-primary-600 bg-primary-50 text-primary-700 font-bold shadow-xs'
                    : 'border-surface-200 hover:bg-surface-50 text-surface-700'
                }`}
              >
                <CreditCard className="w-6 h-6" />
                <span className="text-sm font-bold">Card</span>
              </button>

              <button
                type="button"
                onClick={() => setPaymentMethod('upi_cash')}
                className={`h-20 rounded-xl border-2 text-center flex flex-col items-center justify-center gap-1 transition-all cursor-pointer ${
                  paymentMethod === 'upi_cash'
                    ? 'border-primary-600 bg-primary-50 text-primary-700 font-bold shadow-xs'
                    : 'border-surface-200 hover:bg-surface-50 text-surface-700'
                }`}
              >
                <span className="font-black text-xs leading-none">₹+QR</span>
                <span className="text-sm font-bold">UPI+Cash</span>
              </button>
            </div>
          </div>

          {/* Cash Tendered & Change Calculation */}
          {paymentMethod === 'cash' && (
            <div className="p-4 rounded-xl bg-surface-50 border border-surface-200 space-y-3.5">
              <div className="form-group">
                <label className="form-label text-sm font-semibold text-surface-800">
                  Tendered Cash Amount (₹)
                </label>
                <input
                  type="number"
                  value={tenderedCash}
                  onChange={(e) => setTenderedCash(e.target.value)}
                  className="form-input font-mono text-2xl font-bold h-14 pl-4"
                  placeholder="0.00"
                  autoFocus
                />
              </div>

              {/* Quick Cash Buttons */}
              <div className="flex gap-2 flex-wrap">
                {[50, 100, 200, 500, 1000, 2000].map((amt) => (
                  <button
                    key={amt}
                    type="button"
                    onClick={() => setTenderedCash(String(amt))}
                    className="btn-secondary text-sm font-mono font-bold py-2 px-3 cursor-pointer"
                  >
                    ₹{amt}
                  </button>
                ))}
              </div>

              {/* Change Return Calculation */}
              <div className="flex items-center justify-between pt-3 border-t border-surface-200">
                <span className="font-semibold text-base text-surface-700">
                  Change to Return:
                </span>
                <span
                  className={`font-mono text-2xl font-black ${
                    rupeesToPaise(tenderedCash) >= calculations.grandTotalPaise
                      ? 'text-accent-700'
                      : 'text-red-600'
                  }`}
                >
                  {rupeesToPaise(tenderedCash) >= calculations.grandTotalPaise
                    ? formatCurrency(
                        rupeesToPaise(tenderedCash) -
                          calculations.grandTotalPaise
                      )
                    : 'Insufficient Cash'}
                </span>
              </div>
            </div>
          )}

          {/* Split Payment Form (UPI + Cash) */}
          {paymentMethod === 'upi_cash' && (
            <div className="p-4 rounded-xl bg-surface-50 border border-surface-200 space-y-3.5">
              <div className="grid grid-cols-2 gap-3">
                <div className="form-group">
                  <label className="form-label text-sm font-semibold text-surface-800 flex items-center justify-between">
                    <span>UPI Amount (₹)</span>
                    <span className="text-3xs text-primary-600 font-medium">Auto-Adjusts Cash</span>
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={splitUpi}
                    onChange={(e) => {
                      const val = e.target.value;
                      setSplitUpi(val);
                      if (val.trim() === '') {
                        setSplitCash(paiseToRupeesStr(calculations.grandTotalPaise));
                      } else {
                        const upiPaise = rupeesToPaise(val);
                        const rem = Math.max(0, calculations.grandTotalPaise - upiPaise);
                        setSplitCash(paiseToRupeesStr(rem));
                      }
                    }}
                    className="form-input font-mono text-base font-bold h-12"
                    placeholder="0.00"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label text-sm font-semibold text-surface-800 flex items-center justify-between">
                    <span>Cash Amount (₹)</span>
                    <span className="text-3xs text-primary-600 font-medium">Auto-Adjusts UPI</span>
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={splitCash}
                    onChange={(e) => {
                      const val = e.target.value;
                      setSplitCash(val);
                      if (val.trim() === '') {
                        setSplitUpi(paiseToRupeesStr(calculations.grandTotalPaise));
                      } else {
                        const cashPaise = rupeesToPaise(val);
                        const rem = Math.max(0, calculations.grandTotalPaise - cashPaise);
                        setSplitUpi(paiseToRupeesStr(rem));
                      }
                    }}
                    className="form-input font-mono text-base font-bold h-12"
                    placeholder="0.00"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between pt-2.5 border-t border-surface-200">
                <span className="text-base text-surface-700 font-medium">
                  Total Paid / Bill Total:
                </span>
                <div className="text-right">
                  <span className={`font-mono font-black text-xl ${
                    rupeesToPaise(splitUpi) + rupeesToPaise(splitCash) >= calculations.grandTotalPaise
                      ? 'text-emerald-700'
                      : 'text-amber-600'
                  }`}>
                    {formatCurrency(
                      rupeesToPaise(splitUpi) + rupeesToPaise(splitCash)
                    )}
                  </span>
                  <span className="font-mono text-xs text-surface-500 font-medium ml-1.5">
                    / {formatCurrency(calculations.grandTotalPaise)}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      </Modal>

      {/* Bill Success & Receipt Print Modal */}
      <ReceiptPrintModal
        isOpen={isReceiptOpen}
        onClose={() => setIsReceiptOpen(false)}
        billData={completedBillData}
        onStartNextBill={() => {
          setIsReceiptOpen(false);
          searchInputRef.current?.focus();
        }}
      />

      {/* Startup Crash Recovery Dialog */}
      <Modal
        isOpen={isRecoveryOpen}
        onClose={handleDiscardDraft}
        title="Unfinished Bill Recovered"
        maxWidth="sm"
        footer={
          <div className="flex items-center justify-between w-full">
            <button
              onClick={handleDiscardDraft}
              className="btn-secondary text-sm"
            >
              Discard Draft
            </button>
            <button
              onClick={handleResumeDraft}
              className="btn-primary text-sm flex items-center gap-1.5"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Resume Bill</span>
            </button>
          </div>
        }
      >
        <div className="py-2 text-sm text-surface-600 space-y-2">
          <p>
            An unfinished billing draft with{' '}
            <b>{recoveredDraft?.cart_items.length} items</b> was recovered after
            an unexpected shutdown or application exit.
          </p>
          <p>Would you like to resume this order or start a new one?</p>
        </div>
      </Modal>
    </div>
  );
};
