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
  FileCheck,
  PackagePlus,
} from 'lucide-react';
import { api } from '../../lib/ipc';
import { useAuth } from '../../contexts/AuthContext';
import { useSettings } from '../../contexts/SettingsContext';
import { formatCurrency, paiseToRupeesStr, rupeesToPaise } from '../../lib/format';
import { Modal } from '../../components/Modal';
import { Header } from '../../components/Header';
import type { BillingProduct, Category, CartItem, CompleteBillResponse, DraftBill } from '../../types';
import toast from 'react-hot-toast';

export const BillingPage: React.FC = () => {
  const { user } = useAuth();
  const { gstEnabled, defaultPaymentMethod } = useSettings();

  // State
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [products, setProducts] = useState<BillingProduct[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [discountType, setDiscountType] = useState<'none' | 'percentage' | 'fixed'>('none');
  const [discountValue, setDiscountValue] = useState<number>(0);
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
  const [isReceiptOpen, setIsReceiptOpen] = useState(false);

  // Draft Recovery State
  const [recoveredDraft, setRecoveredDraft] = useState<DraftBill | null>(null);
  const [isRecoveryOpen, setIsRecoveryOpen] = useState(false);

  // Custom Item Modal State
  const [isCustomItemOpen, setIsCustomItemOpen] = useState(false);
  const [customItemName, setCustomItemName] = useState('');
  const [customItemPrice, setCustomItemPrice] = useState('');
  const [customItemQty, setCustomItemQty] = useState('1');

  const searchInputRef = useRef<HTMLInputElement>(null);

  // Load initial categories & products
  useEffect(() => {
    const initData = async () => {
      try {
        const [cats, prods] = await Promise.all([
          api.getCategories(true),
          api.getBillingProducts(),
        ]);
        setCategories(cats);
        setProducts(prods);

        // Check for draft recovery
        if (user?.id) {
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

  // Search & category filter query
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

    const timer = setTimeout(fetchFiltered, 150);
    return () => clearTimeout(timer);
  }, [selectedCategory, searchQuery]);

  // Autosave draft to SQLite
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

  // Comprehensive POS Keyboard Shortcuts Listener (Section 58)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInput =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable;

      // 1. F2 or Ctrl + F -> Search Focus
      if (e.key === 'F2' || (e.ctrlKey && (e.key === 'f' || e.key === 'F'))) {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
        return;
      }

      // 2. F4 -> Open Payment Modal
      if (e.key === 'F4') {
        e.preventDefault();
        if (cart.length > 0) {
          handleOpenPayment();
        } else {
          toast.error('Cart is empty. Add products first.');
        }
        return;
      }

      // 3. Ctrl + N -> Clear / New Bill
      if (e.ctrlKey && (e.key === 'n' || e.key === 'N')) {
        e.preventDefault();
        handleClearCart();
        return;
      }

      // 4. Ctrl + P -> Print / View Receipt
      if (e.ctrlKey && (e.key === 'p' || e.key === 'P')) {
        e.preventDefault();
        if (completedBill) {
          setIsReceiptOpen(true);
        }
        return;
      }

      // 5. Escape -> Close active modals
      if (e.key === 'Escape') {
        setIsPaymentOpen(false);
        setIsReceiptOpen(false);
        setIsRecoveryOpen(false);
        setIsCustomItemOpen(false);
        if (isInput) (target as HTMLInputElement).blur();
        return;
      }

      // 6. '+' / '-' -> Adjust last item quantity if not inside an input
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
  }, [cart, completedBill]);

  // Cart Manipulations
  const addToCart = useCallback((product: BillingProduct) => {
    setCart((prev) => {
      const existing = prev.find((item) => item.product_id === product.id);
      if (existing) {
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
  }, []);

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
    const customId = -Date.now(); // Negative ID to distinguish from real products

    setCart((prev) => [
      ...prev,
      {
        product_id: customId,
        product_code: 'CUSTOM',
        product_name: customItemName.trim(),
        category_name: 'Custom',
        image_path: null,
        unit_price_paise: pricePaise,
        quantity: qty,
        gst_enabled: false,
        gst_percentage_x100: 0,
      },
    ]);

    toast.success(`Custom item "${customItemName.trim()}" added to cart`);
    setIsCustomItemOpen(false);
    setCustomItemName('');
    setCustomItemPrice('');
    setCustomItemQty('1');
  };

  const updateQuantity = (productId: number, qty: number) => {
    if (qty <= 0) {
      removeFromCart(productId);
      return;
    }
    setCart((prev) =>
      prev.map((item) =>
        item.product_id === productId ? { ...item, quantity: qty } : item
      )
    );
  };

  const removeFromCart = (productId: number) => {
    setCart((prev) => prev.filter((item) => item.product_id !== productId));
  };

  const handleClearCart = () => {
    if (cart.length === 0) return;
    setCart([]);
    setDiscountType('none');
    setDiscountValue(0);
    if (user?.id) api.deleteDraft(user.id);
  };

  // Monetary Calculations (Strict Integer Paise)
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

  // Payment Handling
  const handleOpenPayment = () => {
    if (cart.length === 0) return;
    setPaymentMethod(
      (defaultPaymentMethod as any) || 'cash'
    );
    setTenderedCash(paiseToRupeesStr(calculations.grandTotalPaise));
    setSplitCash(paiseToRupeesStr(Math.floor(calculations.grandTotalPaise / 2)));
    setSplitUpi(paiseToRupeesStr(calculations.grandTotalPaise - Math.floor(calculations.grandTotalPaise / 2)));
    setIsPaymentOpen(true);
  };

  const handleCompleteBill = async () => {
    if (!user?.id || cart.length === 0) return;

    let cashPaise = 0;
    let cardPaise = 0;
    let upiPaise = 0;

    if (paymentMethod === 'cash') {
      cashPaise = calculations.grandTotalPaise;
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

      setCompletedBill(response);
      setIsPaymentOpen(false);
      setIsReceiptOpen(true);
      handleClearCart();
      toast.success(`Bill #${response.bill_number} generated successfully!`);
    } catch (err: any) {
      toast.error(typeof err === 'string' ? err : 'Failed to complete bill');
    } finally {
      setIsCompleting(false);
    }
  };

  // Draft Recovery Handlers
  const handleResumeDraft = () => {
    if (recoveredDraft) {
      setCart(recoveredDraft.cart_items);
      if (recoveredDraft.discount) {
        setDiscountType(recoveredDraft.discount.discount_type);
        setDiscountValue(recoveredDraft.discount.discount_value);
      }
      toast.success('Unfinished bill restored from crash recovery!');
    }
    setIsRecoveryOpen(false);
  };

  const handleDiscardDraft = () => {
    if (user?.id) api.deleteDraft(user.id);
    setIsRecoveryOpen(false);
  };

  return (
    <div className="flex flex-col h-full overflow-hidden bg-surface-100">
      {/* Top Header */}
      <Header
        title="POS Billing Terminal"
        subtitle="Quick order entry and instant checkout"
        actions={
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-surface-500 bg-surface-100 px-2 py-1 rounded border border-surface-200">
              Shortcuts: <kbd className="font-bold text-surface-800">F2</kbd> Search | <kbd className="font-bold text-surface-800">F4</kbd> Pay | <kbd className="font-bold text-surface-800">Ctrl+N</kbd> New
            </span>
          </div>
        }
      />

      {/* Main POS Grid Area */}
      <div className="flex-1 flex overflow-hidden p-3 gap-3">
        {/* Left Column: Category Tabs + Search + Products Catalog */}
        <div className="flex-1 flex flex-col min-w-0 bg-white rounded border border-surface-200 shadow-card overflow-hidden">
          {/* Search Bar & Category Filter Bar */}
          <div className="p-3 border-b border-surface-200 space-y-2 bg-surface-50/50">
            {/* Search Input + Custom Item Button */}
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-surface-400 absolute left-3 top-3" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search products by name or code (PRD-000001)... [F2]"
                  className="form-input pl-9 text-sm"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2.5 top-2.5 text-xs text-surface-400 hover:text-surface-600"
                  >
                    Clear
                  </button>
                )}
              </div>
              <button
                onClick={() => setIsCustomItemOpen(true)}
                className="btn-secondary flex items-center gap-1.5 whitespace-nowrap text-sm h-10"
                title="Add a custom item directly to the bill"
              >
                <PackagePlus className="w-4 h-4 text-primary-600" />
                <span>Custom Item</span>
              </button>
            </div>

            {/* Category Filter Pills */}
            <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
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

          {/* Product Cards Grid — more columns for smaller cards */}
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
              <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-3">
                {products.map((product) => (
                  <div
                    key={product.id}
                    onClick={() => addToCart(product)}
                    className="product-card flex flex-col justify-between group"
                    title={`Click to add ${product.name} to cart`}
                  >
                    <div>
                      {/* Product Image preview or initial fallback */}
                      <div className="w-full aspect-[4/3] rounded-lg bg-surface-100 mb-2 flex items-center justify-center text-primary-600 font-bold text-xl overflow-hidden group-hover:bg-primary-50 transition-colors">
                        {product.image_path ? (
                          <img
                            src={product.image_path}
                            alt={product.name}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                          />
                        ) : (
                          product.name.charAt(0).toUpperCase()
                        )}
                      </div>
                      <div className="product-card-name" title={product.name}>
                        {product.name}
                      </div>
                      <div className="product-card-code" title={product.product_code}>
                        {product.product_code}
                      </div>
                    </div>
                    <div className="flex items-center justify-between mt-2 pt-2 border-t border-surface-100">
                      <span className="product-card-price">
                        {formatCurrency(product.selling_price_paise)}
                      </span>
                      <span className="text-2xs bg-primary-50 group-hover:bg-primary-600 group-hover:text-white text-primary-700 px-2 py-0.5 rounded font-bold transition-colors">
                        +Add
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Active Cart Panel */}
        <div className="w-96 flex flex-col bg-white rounded border border-surface-200 shadow-card overflow-hidden">
          {/* Cart Header */}
          <div className="card-header bg-surface-50/50">
            <div className="flex items-center gap-2">
              <ShoppingCart className="w-5 h-5 text-primary-600" />
              <span className="text-base font-bold text-surface-900">Current Order</span>
              <span className="badge badge-info">{calculations.itemCount} items</span>
            </div>
            {cart.length > 0 && (
              <button
                onClick={handleClearCart}
                className="text-sm text-red-600 hover:text-red-700 font-medium flex items-center gap-1 cursor-pointer"
                title="Clear entire cart (Ctrl+N)"
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
                {cart.map((item) => (
                  <div
                    key={item.product_id}
                    className={`p-2.5 rounded border flex flex-col gap-1.5 ${
                      item.product_code === 'CUSTOM'
                        ? 'bg-amber-50/50 border-amber-200'
                        : 'bg-surface-50 border-surface-200'
                    }`}
                  >
                    <div className="flex items-start gap-2 justify-between">
                      {/* Optional Cart Item Thumbnail */}
                      <div className="w-10 h-10 rounded bg-surface-100 border border-surface-200 flex items-center justify-center overflow-hidden flex-shrink-0">
                        {item.image_path ? (
                          <img
                            src={item.image_path}
                            alt={item.product_name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="text-sm font-bold text-surface-400">
                            {item.product_code === 'CUSTOM' ? '✦' : item.product_name.charAt(0).toUpperCase()}
                          </div>
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold text-surface-900 truncate">
                          {item.product_name}
                          {item.product_code === 'CUSTOM' && (
                            <span className="ml-1 text-2xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-bold">
                              Custom
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-surface-500 font-mono">
                          {formatCurrency(item.unit_price_paise)} each
                        </div>
                      </div>
                      <div className="text-sm font-bold text-surface-900 font-mono">
                        {formatCurrency(item.unit_price_paise * item.quantity)}
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-1 border-t border-surface-200/60">
                      {/* Quantity Buttons */}
                      <div className="qty-control bg-white">
                        <button
                          onClick={() =>
                            updateQuantity(item.product_id, item.quantity - 1)
                          }
                          className="qty-btn"
                          title="Decrease quantity (-)"
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                        <input
                          type="number"
                          min="1"
                          value={item.quantity}
                          onChange={(e) =>
                            updateQuantity(
                              item.product_id,
                              parseInt(e.target.value) || 1
                            )
                          }
                          className="qty-input font-mono font-semibold"
                        />
                        <button
                          onClick={() =>
                            updateQuantity(item.product_id, item.quantity + 1)
                          }
                          className="qty-btn"
                          title="Increase quantity (+)"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {/* Remove Button */}
                      <button
                        onClick={() => removeFromCart(item.product_id)}
                        className="text-surface-400 hover:text-red-600 p-1 transition-colors"
                        title="Remove product"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Cart Summary & Checkout Footer */}
          <div className="p-3 border-t border-surface-200 bg-surface-50/50 space-y-2">
            {/* Subtotal */}
            <div className="flex items-center justify-between text-sm text-surface-600">
              <span>Subtotal</span>
              <span className="font-mono font-medium">
                {formatCurrency(calculations.subtotalPaise)}
              </span>
            </div>

            {/* Discount Control Row */}
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-1">
                <span className="text-surface-600">Discount:</span>
                <select
                  value={discountType}
                  onChange={(e) => {
                    setDiscountType(e.target.value as any);
                    if (e.target.value === 'none') setDiscountValue(0);
                  }}
                  className="text-xs border border-surface-300 rounded px-2 py-1 bg-white"
                >
                  <option value="none">None</option>
                  <option value="percentage">% Pct</option>
                  <option value="fixed">₹ Fixed</option>
                </select>
              </div>

              {discountType !== 'none' ? (
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min="0"
                    max={discountType === 'percentage' ? 100 : undefined}
                    value={discountValue || ''}
                    onChange={(e) =>
                      setDiscountValue(parseFloat(e.target.value) || 0)
                    }
                    placeholder={discountType === 'percentage' ? '10%' : '50'}
                    className="w-16 text-right text-sm px-2 py-1 border border-surface-300 rounded bg-white font-mono"
                  />
                  <span className="font-mono text-sm text-red-600 font-medium">
                    -{formatCurrency(calculations.discountAmountPaise)}
                  </span>
                </div>
              ) : (
                <span className="text-xs text-surface-400 font-mono">₹0.00</span>
              )}
            </div>

            {/* Optional GST Row */}
            {gstEnabled && (
              <div className="flex items-center justify-between text-sm text-surface-600">
                <span>GST (Taxes)</span>
                <span className="font-mono font-medium">
                  {formatCurrency(calculations.gstTotalPaise)}
                </span>
              </div>
            )}

            {/* Grand Total Bar */}
            <div className="pt-2 border-t border-surface-200 flex items-center justify-between">
              <span className="text-base font-bold text-surface-900">
                Grand Total
              </span>
              <span className="text-xl font-bold text-primary-700 font-mono">
                {formatCurrency(calculations.grandTotalPaise)}
              </span>
            </div>

            {/* Checkout Button */}
            <button
              onClick={handleOpenPayment}
              disabled={cart.length === 0}
              className="btn-success w-full py-3 flex items-center justify-center gap-2 text-base font-bold shadow-sm cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed mt-1"
            >
              <span>Collect Payment [F4]</span>
              <span className="font-mono text-sm bg-accent-700 px-2 py-0.5 rounded">
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
            Add a custom product directly to the bill without creating it in the product catalog.
          </p>

          <div className="form-group">
            <label className="form-label">Item Name *</label>
            <input
              type="text"
              value={customItemName}
              onChange={(e) => setCustomItemName(e.target.value)}
              placeholder="e.g. Special Order Item"
              className="form-input"
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="form-group">
              <label className="form-label">Price (₹) *</label>
              <input
                type="number"
                step="0.5"
                min="0"
                value={customItemPrice}
                onChange={(e) => setCustomItemPrice(e.target.value)}
                placeholder="e.g. 100.00"
                className="form-input font-mono font-bold"
              />
            </div>

            <div className="form-group">
              <label className="form-label">Quantity</label>
              <input
                type="number"
                min="1"
                value={customItemQty}
                onChange={(e) => setCustomItemQty(e.target.value)}
                placeholder="1"
                className="form-input font-mono font-bold"
              />
            </div>
          </div>

          <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800">
            <strong>Note:</strong> Custom items are not saved to your product catalog. They appear only on this bill.
          </div>
        </div>
      </Modal>

      {/* Payment Modal */}
      <Modal
        isOpen={isPaymentOpen}
        onClose={() => setIsPaymentOpen(false)}
        title="Complete Payment & Generate Bill"
        maxWidth="md"
        footer={
          <div className="flex items-center justify-between w-full">
            <button
              onClick={() => setIsPaymentOpen(false)}
              className="btn-secondary text-sm"
            >
              Back to Cart
            </button>
            <button
              onClick={handleCompleteBill}
              disabled={isCompleting}
              className="btn-success px-5 py-2.5 text-sm font-bold flex items-center gap-2"
            >
              {isCompleting ? (
                <div className="spinner w-4 h-4 border-white" />
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Confirm Payment ({formatCurrency(calculations.grandTotalPaise)})</span>
                </>
              )}
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          {/* Bill Summary Strip */}
          <div className="p-3 rounded-lg bg-surface-50 border border-surface-200 flex items-center justify-between">
            <div>
              <div className="text-xs text-surface-500 uppercase font-semibold">Total Payable</div>
              <div className="text-2xl font-bold text-primary-700 font-mono">
                {formatCurrency(calculations.grandTotalPaise)}
              </div>
            </div>
            <div className="text-right text-sm text-surface-500">
              <div>{calculations.itemCount} items</div>
              <div>Subtotal: {formatCurrency(calculations.subtotalPaise)}</div>
            </div>
          </div>

          {/* Payment Method Selector Grid */}
          <div>
            <label className="form-label mb-1.5 block">Select Payment Method</label>
            <div className="grid grid-cols-4 gap-2">
              <button
                type="button"
                onClick={() => setPaymentMethod('cash')}
                className={`p-3 rounded border text-center flex flex-col items-center gap-1.5 transition-all ${
                  paymentMethod === 'cash'
                    ? 'border-primary-600 bg-primary-50 text-primary-700 font-bold'
                    : 'border-surface-200 hover:bg-surface-50 text-surface-700'
                }`}
              >
                <Banknote className="w-5 h-5" />
                <span className="text-sm">Cash</span>
              </button>

              <button
                type="button"
                onClick={() => setPaymentMethod('upi')}
                className={`p-3 rounded border text-center flex flex-col items-center gap-1.5 transition-all ${
                  paymentMethod === 'upi'
                    ? 'border-primary-600 bg-primary-50 text-primary-700 font-bold'
                    : 'border-surface-200 hover:bg-surface-50 text-surface-700'
                }`}
              >
                <QrCode className="w-5 h-5" />
                <span className="text-sm">UPI</span>
              </button>

              <button
                type="button"
                onClick={() => setPaymentMethod('card')}
                className={`p-3 rounded border text-center flex flex-col items-center gap-1.5 transition-all ${
                  paymentMethod === 'card'
                    ? 'border-primary-600 bg-primary-50 text-primary-700 font-bold'
                    : 'border-surface-200 hover:bg-surface-50 text-surface-700'
                }`}
              >
                <CreditCard className="w-5 h-5" />
                <span className="text-sm">Card</span>
              </button>

              <button
                type="button"
                onClick={() => setPaymentMethod('upi_cash')}
                className={`p-3 rounded border text-center flex flex-col items-center gap-1.5 transition-all ${
                  paymentMethod === 'upi_cash'
                    ? 'border-primary-600 bg-primary-50 text-primary-700 font-bold'
                    : 'border-surface-200 hover:bg-surface-50 text-surface-700'
                }`}
              >
                <span className="font-bold text-sm leading-none">₹+QR</span>
                <span className="text-sm">UPI + Cash</span>
              </button>
            </div>
          </div>

          {/* Cash Tendered & Change Calculation */}
          {paymentMethod === 'cash' && (
            <div className="p-3 rounded bg-surface-50 border border-surface-200 space-y-3">
              <div className="form-group">
                <label className="form-label">Tendered Cash Amount (₹)</label>
                <input
                  type="number"
                  value={tenderedCash}
                  onChange={(e) => setTenderedCash(e.target.value)}
                  className="form-input font-mono text-base font-bold"
                  placeholder="e.g. 500"
                  autoFocus
                />
              </div>

              {/* Quick Cash Buttons */}
              <div className="flex gap-1.5">
                {[50, 100, 200, 500, 1000, 2000].map((amt) => (
                  <button
                    key={amt}
                    type="button"
                    onClick={() => setTenderedCash(String(amt))}
                    className="btn-secondary btn-sm font-mono"
                  >
                    ₹{amt}
                  </button>
                ))}
              </div>

              {/* Change Return Calculation */}
              <div className="flex items-center justify-between pt-2 border-t border-surface-200 text-sm">
                <span className="font-medium text-surface-600">Change to Return:</span>
                <span
                  className={`font-mono text-base font-bold ${
                    rupeesToPaise(tenderedCash) >= calculations.grandTotalPaise
                      ? 'text-accent-700'
                      : 'text-red-600'
                  }`}
                >
                  {rupeesToPaise(tenderedCash) >= calculations.grandTotalPaise
                    ? formatCurrency(
                        rupeesToPaise(tenderedCash) - calculations.grandTotalPaise
                      )
                    : 'Insufficient Cash'}
                </span>
              </div>
            </div>
          )}

          {/* Split Payment Form (UPI + Cash) */}
          {paymentMethod === 'upi_cash' && (
            <div className="p-3 rounded bg-surface-50 border border-surface-200 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="form-group">
                  <label className="form-label">UPI Amount (₹)</label>
                  <input
                    type="number"
                    value={splitUpi}
                    onChange={(e) => {
                      setSplitUpi(e.target.value);
                      const remaining = Math.max(
                        0,
                        calculations.grandTotalPaise - rupeesToPaise(e.target.value)
                      );
                      setSplitCash(paiseToRupeesStr(remaining));
                    }}
                    className="form-input font-mono text-sm font-bold"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Cash Amount (₹)</label>
                  <input
                    type="number"
                    value={splitCash}
                    onChange={(e) => setSplitCash(e.target.value)}
                    className="form-input font-mono text-sm font-bold"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-surface-200 text-sm">
                <span className="text-surface-600">Total Paid:</span>
                <span className="font-mono font-bold text-surface-900">
                  {formatCurrency(
                    rupeesToPaise(splitUpi) + rupeesToPaise(splitCash)
                  )}
                </span>
              </div>
            </div>
          )}
        </div>
      </Modal>

      {/* Bill Success / Receipt Modal */}
      <Modal
        isOpen={isReceiptOpen}
        onClose={() => setIsReceiptOpen(false)}
        title="Bill Completed Successfully"
        maxWidth="sm"
        footer={
          <div className="flex items-center justify-end gap-2 w-full">
            <button
              onClick={() => setIsReceiptOpen(false)}
              className="btn-primary text-sm"
            >
              Start Next Bill (New)
            </button>
          </div>
        }
      >
        <div className="text-center py-3 space-y-3">
          <div className="w-14 h-14 rounded-full bg-accent-50 text-accent-600 flex items-center justify-center mx-auto border border-accent-200">
            <FileCheck className="w-7 h-7" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-surface-900">
              Bill #{completedBill?.bill_number}
            </h3>
            <p className="text-sm text-surface-500">
              Business Date: {completedBill?.business_date}
            </p>
          </div>

          <div className="p-3 rounded bg-surface-50 border border-surface-200 font-mono text-lg font-bold text-primary-700">
            {formatCurrency(completedBill?.grand_total_paise || 0)}
          </div>

          <p className="text-xs text-surface-500">
            Transaction recorded and stored permanently in local SQLite.
          </p>
        </div>
      </Modal>

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
            <b>{recoveredDraft?.cart_items.length} items</b> was recovered after an
            unexpected shutdown or application exit.
          </p>
          <p>Would you like to resume this order or start a new one?</p>
        </div>
      </Modal>
    </div>
  );
};
