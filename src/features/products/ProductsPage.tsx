import React, { useState, useEffect, useRef } from 'react';
import {
  Plus,
  Search,
  Edit2,
  Trash2,
  Check,
  Filter,
  Upload,
  Image as ImageIcon,
  X,
  Power,
  Package,
  AlertCircle,
  AlertTriangle,
  Info,
  CheckCircle2,
  TrendingUp,
} from 'lucide-react';
import { api } from '../../lib/ipc';
import { useAuth } from '../../contexts/AuthContext';
import { useSettings } from '../../contexts/SettingsContext';
import { formatCurrency, rupeesToPaise, paiseToRupeesStr } from '../../lib/format';
import { Modal } from '../../components/Modal';
import { ConfirmModal } from '../../components/ConfirmModal';
import { Header } from '../../components/Header';
import { CustomSelect } from '../../components/CustomSelect';
import type { Product, Category } from '../../types';
import toast from 'react-hot-toast';

export const ProductsPage: React.FC = () => {
  const { isAdmin } = useAuth();
  const { gstEnabled, currencySymbol } = useSettings();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  // Add/Edit Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [formName, setFormName] = useState('');
  const [formCategory, setFormCategory] = useState<number>(0);
  const [formPrice, setFormPrice] = useState('');
  const [formGstEnabled, setFormGstEnabled] = useState(false);
  const [formGstPct, setFormGstPct] = useState('5');
  const [formImagePath, setFormImagePath] = useState<string>('');
  const [formIsRestockable, setFormIsRestockable] = useState(false);
  const [formBuyingPrice, setFormBuyingPrice] = useState('');
  const [formInitialStock, setFormInitialStock] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Restock Modal
  const [isRestockModalOpen, setIsRestockModalOpen] = useState(false);
  const [restockingProduct, setRestockingProduct] = useState<Product | null>(null);
  const [restockQuantity, setRestockQuantity] = useState('10');
  const [restockBuyingPrice, setRestockBuyingPrice] = useState('');
  const [restockSellingPrice, setRestockSellingPrice] = useState('');
  const [restockPaymentMethod, setRestockPaymentMethod] = useState('cash');
  const [restockNotes, setRestockNotes] = useState('');
  const [isSubmittingRestock, setIsSubmittingRestock] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const hasLoadedOnce = useRef(false);

  const loadData = async (showFullSpinner = true) => {
    if (showFullSpinner) setIsLoading(true);
    try {
      const [catList, prodRes] = await Promise.all([
        api.getCategories(true),
        api.getProducts(selectedCategory || undefined, !isAdmin, 1, 5000),
      ]);
      setCategories(catList);
      setProducts(prodRes.data);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load products');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    // Show full spinner only on first load; subsequent category switches are instant
    loadData(!hasLoadedOnce.current);
    hasLoadedOnce.current = true;
  }, [selectedCategory]);

function compressImageFile(file: File, maxDim = 400, quality = 0.8): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(reader.result as string);
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        const compressed = canvas.toDataURL('image/jpeg', quality);
        resolve(compressed);
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

  const handleOpenAdd = () => {
    if (categories.length === 0) {
      toast.error('Please create at least one category before adding products');
    }
    setEditingProduct(null);
    setFormName('');
    setFormCategory(categories[0]?.id || 1);
    setFormPrice('');
    setFormGstEnabled(false);
    setFormGstPct('5');
    setFormImagePath('');
    setFormIsRestockable(true);
    setFormBuyingPrice('');
    setFormInitialStock('');
    setIsModalOpen(true);
  };

  const handleOpenEdit = (p: Product) => {
    setEditingProduct(p);
    setFormName(p.name);
    setFormCategory(p.category_id);
    setFormPrice(paiseToRupeesStr(p.selling_price_paise));
    setFormGstEnabled(p.gst_enabled);
    setFormGstPct(String(p.gst_percentage_x100 / 100));
    setFormImagePath(p.image_path || '');
    setFormIsRestockable(p.is_restockable ?? false);
    setFormBuyingPrice(p.buying_price_paise ? paiseToRupeesStr(p.buying_price_paise) : '');
    setFormInitialStock(p.current_stock ? String(p.current_stock) : '0');
    setIsModalOpen(true);
  };

  const handleImageFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file (PNG, JPG, WebP, etc.)');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast.error('Image size should be under 10MB');
      return;
    }

    try {
      const optimizedDataUrl = await compressImageFile(file, 400, 0.8);
      setFormImagePath(optimizedDataUrl);
      toast.success('Image optimized & selected successfully!');
    } catch {
      toast.error('Failed to process image');
    }
  };

  const handleRemoveImage = () => {
    setFormImagePath('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = formName.trim();
    if (!trimmedName) {
      toast.error('Product name is required');
      return;
    }
    if (!formPrice || parseFloat(formPrice) <= 0) {
      toast.error('Please enter a valid Selling Price');
      return;
    }
    if (formIsRestockable && (!formBuyingPrice || parseFloat(formBuyingPrice) <= 0)) {
      toast.error('Please enter a valid Buying Price');
      return;
    }

    const chosenCat = formCategory || categories[0]?.id || 1;
    const pricePaise = rupeesToPaise(formPrice);
    const isGstActive = gstEnabled && formGstEnabled;
    const gstPctX100 = isGstActive ? Math.round(parseFloat(formGstPct || '0') * 100) : 0;
    const buyingPricePaise = formIsRestockable && formBuyingPrice ? rupeesToPaise(formBuyingPrice) : 0;
    const initialStock = formIsRestockable && formInitialStock ? parseInt(formInitialStock) || 0 : 0;

    setIsSaving(true);
    try {
      if (editingProduct) {
        await api.updateProduct(
          editingProduct.id,
          trimmedName,
          chosenCat,
          pricePaise,
          formGstEnabled,
          gstPctX100,
          undefined,
          formImagePath.trim() || '',
          formIsRestockable,
          buyingPricePaise
        );
        toast.success('Product updated successfully!');
      } else {
        await api.createProduct(
          trimmedName,
          chosenCat,
          pricePaise,
          formGstEnabled,
          gstPctX100,
          formImagePath.trim() || undefined,
          formIsRestockable,
          buyingPricePaise,
          initialStock
        );
        if (formIsRestockable && initialStock > 0 && buyingPricePaise > 0) {
          const totalExpense = initialStock * buyingPricePaise;
          toast.success(`Product created! Added ${formatCurrency(totalExpense)} to Expenses.`);
        } else {
          toast.success('Product created successfully!');
        }
      }
      setIsModalOpen(false);
      loadData(false);
    } catch (err: any) {
      toast.error(typeof err === 'string' ? err : 'Save failed');
    } finally {
      setIsSaving(false);
    }
  };

  const handleOpenRestock = (p: Product) => {
    setRestockingProduct(p);
    setRestockQuantity('10');
    setRestockBuyingPrice(p.buying_price_paise ? paiseToRupeesStr(p.buying_price_paise) : '');
    setRestockSellingPrice(paiseToRupeesStr(p.selling_price_paise));
    setRestockPaymentMethod('cash');
    setRestockNotes('');
    setIsRestockModalOpen(true);
  };

  const handleConfirmRestock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!restockingProduct) return;
    const qty = parseInt(restockQuantity);
    if (!qty || qty <= 0) {
      toast.error('Please enter a valid count to restock');
      return;
    }
    const ratePaise = rupeesToPaise(restockBuyingPrice || '0');
    if (ratePaise <= 0) {
      toast.error('Please enter a valid Buying Price');
      return;
    }
    const sellPricePaise = restockSellingPrice.trim() ? rupeesToPaise(restockSellingPrice) : undefined;
    if (!sellPricePaise || sellPricePaise <= 0) {
      toast.error('Please enter a valid Selling Price');
      return;
    }

    setIsSubmittingRestock(true);
    try {
      await api.restockProduct(
        restockingProduct.id,
        qty,
        ratePaise,
        sellPricePaise,
        restockPaymentMethod,
        restockNotes.trim() || undefined
      );
      const totalAmount = qty * ratePaise;
      if (totalAmount > 0) {
        toast.success(`Restocked ${qty} units of "${restockingProduct.name}"! Added ${formatCurrency(totalAmount)} to Expenses.`);
      } else {
        toast.success(`Restocked ${qty} units of "${restockingProduct.name}"!`);
      }
      setIsRestockModalOpen(false);
      setRestockingProduct(null);
      loadData(false);
    } catch (err: any) {
      toast.error(typeof err === 'string' ? err : 'Failed to restock product');
    } finally {
      setIsSubmittingRestock(false);
    }
  };

  const handleToggleActive = async (p: Product) => {
    // Optimistic update — toggle instantly in UI without reload
    setProducts(prev => prev.map(item =>
      item.id === p.id ? { ...item, is_active: !p.is_active } : item
    ));
    try {
      await api.updateProduct(
        p.id,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        !p.is_active
      );
      toast.success(p.is_active ? 'Product deactivated' : 'Product activated');
    } catch (err: any) {
      // Revert on error
      setProducts(prev => prev.map(item =>
        item.id === p.id ? { ...item, is_active: p.is_active } : item
      ));
      toast.error(typeof err === 'string' ? err : 'Toggle failed');
    }
  };

  // Delete Confirmation Modal
  const [deletingProduct, setDeletingProduct] = useState<Product | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleConfirmDelete = async () => {
    if (!deletingProduct) return;
    setIsDeleting(true);
    try {
      await api.deleteProduct(deletingProduct.id);
      // Remove from local state instantly (no full reload)
      setProducts(prev => prev.filter(item => item.id !== deletingProduct.id));
      toast.success(`Product "${deletingProduct.name}" deleted successfully`);
      setDeletingProduct(null);
    } catch (err: any) {
      toast.error(typeof err === 'string' ? err : 'Failed to delete');
    } finally {
      setIsDeleting(false);
    }
  };

  const filteredProducts = products.filter((p) => {
    // If staff (non-admin), hide deactivated products
    if (!isAdmin && !p.is_active) return false;

    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      p.name.toLowerCase().includes(q) ||
      p.product_code.toLowerCase().includes(q) ||
      (p.category_name && p.category_name.toLowerCase().includes(q))
    );
  });

  return (
    <div className="flex flex-col h-full overflow-hidden bg-surface-50">
      <Header
        title="Product Catalog"
        subtitle="Manage shop items, product images, auto codes, and selling prices"
        actions={
          <button
            type="button"
            onClick={handleOpenAdd}
            className="btn-primary flex items-center gap-1.5 text-xs font-semibold px-3.5 py-1.5 h-9 shadow-xs cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Product</span>
          </button>
        }
      />

      <div className="p-6 overflow-y-auto flex-1 space-y-4">
        {/* Filter / Search Bar */}
        <div className="card p-3 flex items-center justify-between gap-3 bg-white">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-surface-400 absolute left-3 top-3" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search products by code or name..."
              className="form-input pl-9 text-sm"
            />
          </div>

          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-surface-400" />
            <CustomSelect
              value={selectedCategory ? String(selectedCategory) : ''}
              onChange={(val) =>
                setSelectedCategory(val ? parseInt(val) : null)
              }
              options={[
                { value: '', label: 'All Categories' },
                ...categories.map((c) => ({ value: String(c.id), label: c.name })),
              ]}
              size="sm"
              buttonClassName="w-44 h-8 text-xs font-medium rounded-lg"
            />
          </div>
        </div>

        {/* Product Table */}
        <div className="card overflow-hidden">
          <div className="table-container">
            <table className="table w-full">
              <thead>
                <tr>
                  <th className="w-12 text-center">#</th>
                  <th className="w-16 text-center">Image</th>
                  <th className="w-28">Product Code</th>
                  <th>Product Name</th>
                  <th className="w-32">Category</th>
                  <th className="w-28 text-center">Stock</th>
                  <th className="w-28 text-right">Buying Rate ({currencySymbol})</th>
                  <th className="w-32 text-right">Selling Price ({currencySymbol})</th>
                  {gstEnabled && <th className="w-24 text-center">GST Rate</th>}
                  <th className="w-24 text-center">Status</th>
                  <th className="w-48 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={gstEnabled ? 11 : 10} className="text-center py-8 text-surface-400">
                      <div className="spinner mx-auto mb-2" />
                      Loading catalog...
                    </td>
                  </tr>
                ) : filteredProducts.length === 0 ? (
                  <tr>
                    <td colSpan={gstEnabled ? 11 : 10} className="text-center py-8 text-surface-400">
                      No products found. Click "Add New Product" to create one.
                    </td>
                  </tr>
                ) : (
                  filteredProducts.map((p, idx) => (
                    <tr key={p.id} className={!p.is_active ? 'opacity-60 bg-surface-50' : ''}>
                      {/* Product Sequential Index */}
                      <td className="text-center font-mono text-xs font-bold text-surface-500">
                        #{idx + 1}
                      </td>

                      {/* Product Image Thumbnail */}
                      <td>
                        <div className="w-10 h-10 rounded border border-surface-200 bg-surface-100 flex items-center justify-center overflow-hidden flex-shrink-0">
                          {p.image_path ? (
                            <img
                              src={p.image_path}
                              alt={p.name}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="text-sm font-bold text-surface-400">
                              {p.name.charAt(0).toUpperCase()}
                            </div>
                          )}
                        </div>
                      </td>

                      <td className="font-mono font-bold text-primary-700">
                        {p.product_code}
                      </td>
                      <td className="font-medium text-surface-900">
                        {p.name}
                      </td>
                      <td>
                        <span className="badge badge-neutral">
                          {p.category_name || 'General'}
                        </span>
                      </td>

                      {/* Stock Column with low-stock alerts */}
                      <td className="text-center whitespace-nowrap">
                        {p.is_restockable ? (
                          <div className="inline-flex items-center gap-1.5">
                            <span
                              className={`badge font-mono font-bold inline-flex items-center gap-1 ${
                                (p.current_stock ?? 0) <= 2
                                  ? 'bg-red-100 text-red-700 border border-red-300'
                                  : (p.current_stock ?? 0) <= 5
                                  ? 'bg-amber-100 text-amber-800 border border-amber-300'
                                  : 'bg-surface-100 text-surface-700 border border-surface-200'
                              }`}
                            >
                              {(p.current_stock ?? 0) <= 2 && <AlertCircle className="w-3 h-3 text-red-600 flex-shrink-0" />}
                              {(p.current_stock ?? 0) >= 3 && (p.current_stock ?? 0) <= 5 && <AlertTriangle className="w-3 h-3 text-amber-600 flex-shrink-0" />}
                              <span>{p.current_stock ?? 0} units</span>
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs text-surface-400 italic">Non-stock</span>
                        )}
                      </td>

                      {/* Buying Rate Column */}
                      <td className="font-mono text-sm text-right text-surface-600">
                        {p.is_restockable && p.buying_price_paise
                          ? formatCurrency(p.buying_price_paise)
                          : <span className="text-surface-300">—</span>}
                      </td>

                      <td className="font-mono font-semibold text-surface-900 text-right">
                        {formatCurrency(p.selling_price_paise)}
                      </td>
                      {gstEnabled && (
                        <td className="text-center">
                          {p.gst_enabled && p.gst_percentage_x100 > 0 ? (
                            <span className="badge badge-info font-mono">
                              {p.gst_percentage_x100 / 100}%
                            </span>
                          ) : (
                            <span className="text-xs text-surface-400">Exempt</span>
                          )}
                        </td>
                      )}
                      <td>
                        {p.is_active ? (
                          <span className="badge badge-success">Active</span>
                        ) : (
                          <span className="badge badge-danger">Inactive</span>
                        )}
                      </td>
                      <td className="text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* 0. Restock Action (Only for Restockable items) */}
                          {p.is_restockable && (
                            <button
                              onClick={() => handleOpenRestock(p)}
                              className="btn-sm flex items-center gap-1 text-xs py-1 px-2 rounded border border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 transition-colors font-medium"
                              title="Restock units and record expense"
                            >
                              <Package className="w-3.5 h-3.5 text-emerald-600" />
                              <span>Restock</span>
                            </button>
                          )}

                          {/* 1. Edit Button */}
                          <button
                            onClick={() => handleOpenEdit(p)}
                            className="btn-secondary btn-sm flex items-center gap-1 text-xs py-1 px-2 text-primary-700 hover:bg-primary-50"
                            title="Edit product details & image"
                          >
                            <Edit2 className="w-3.5 h-3.5 text-primary-600" />
                            <span>Edit</span>
                          </button>

                          {/* 2. Activate / Deactivate Toggle Button */}
                          <button
                            onClick={() => handleToggleActive(p)}
                            className={`btn-sm flex items-center gap-1 text-xs py-1 px-2 rounded border transition-colors ${
                              p.is_active
                                ? 'bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100'
                                : 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100'
                            }`}
                            title={p.is_active ? 'Deactivate this product' : 'Activate this product'}
                          >
                            <Power className="w-3.5 h-3.5" />
                            <span>{p.is_active ? 'Deactivate' : 'Activate'}</span>
                          </button>

                          {/* 3. Delete Button */}
                          <button
                            onClick={() => setDeletingProduct(p)}
                            className="btn-sm flex items-center gap-1 text-xs py-1 px-2 rounded border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 transition-colors"
                            title="Delete product"
                          >
                            <Trash2 className="w-3.5 h-3.5 text-red-600" />
                            <span>Delete</span>
                          </button>
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

      {/* Add / Edit Product Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingProduct ? `Edit ${editingProduct.name}` : 'Add New Product'}
        maxWidth="2xl"
        closeOnBackdropClick={false}
      >
        <form onSubmit={handleSave} className="space-y-4">
          {/* Image Upload Area */}
          <div className="p-3.5 rounded-xl border border-surface-200 bg-surface-50/70 flex items-center gap-4">
            {/* Thumbnail / Upload Box */}
            <div className="relative w-20 h-20 rounded-xl border-2 border-dashed border-surface-300 bg-white flex items-center justify-center overflow-hidden flex-shrink-0 group hover:border-primary-500 transition-colors shadow-2xs">
              {formImagePath ? (
                <img
                  src={formImagePath}
                  alt="Preview"
                  className="w-full h-full object-cover"
                />
              ) : (
                <ImageIcon className="w-8 h-8 text-surface-300" />
              )}
            </div>

            {/* Upload Buttons & Guidance */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png, image/jpeg, image/webp, image/gif"
                  onChange={handleImageFileChange}
                  className="hidden"
                  id="product-image-input"
                />
                <label
                  htmlFor="product-image-input"
                  className="btn-secondary text-xs inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Upload className="w-4 h-4 text-primary-600" />
                  <span>{formImagePath ? 'Change Image' : 'Select Product Image'}</span>
                </label>
                {formImagePath && (
                  <button
                    type="button"
                    onClick={handleRemoveImage}
                    className="btn-ghost text-xs text-red-600 hover:bg-red-50 hover:text-red-700 px-2.5 py-1.5 rounded-lg flex items-center gap-1 cursor-pointer transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                    <span>Remove</span>
                  </button>
                )}
              </div>
              <div className="text-xs text-surface-500 mt-1.5 leading-relaxed">
                Supports PNG, JPG, JPEG, WebP. High-resolution thumbnail displayed on the POS billing screen and receipts.
              </div>
            </div>
          </div>

          {/* Product Name & Category in 2-Column Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="form-group">
              <label className="form-label">Product Name *</label>
              <input
                type="text"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="e.g. Arun Ice Cream"
                className="form-input"
                required
                autoFocus
              />
            </div>

            <div className="form-group">
              <label className="form-label">Category *</label>
              <CustomSelect
                value={formCategory ? String(formCategory) : ''}
                onChange={(val) => setFormCategory(val ? parseInt(val) : 0)}
                options={categories.map((c) => ({ value: String(c.id), label: c.name }))}
                placeholder="Select Category"
                size="lg"
                buttonClassName="w-full h-10 text-sm font-medium rounded-lg"
              />
            </div>
          </div>

          {/* Pricing & Stock Configuration Box */}
          <div className="p-4 rounded-xl border border-surface-200 bg-surface-50/80 space-y-3.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-primary-100 text-primary-700 flex items-center justify-center font-bold">
                  <Package className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-surface-900">Restockable Item (Track Stock & Buying Cost)</div>
                  <div className="text-xs text-surface-500">Track stock count, record buying cost, and auto-record purchase expenses</div>
                </div>
              </div>
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={formIsRestockable}
                  onChange={(e) => setFormIsRestockable(e.target.checked)}
                  className="form-checkbox"
                />
                <span className="text-sm font-semibold text-primary-700">Restockable</span>
              </label>
            </div>

            {formIsRestockable ? (
              <div className="pt-3 border-t border-surface-200 space-y-3.5">
                {/* Rates in 2 Columns */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="form-group">
                    <label className="form-label font-semibold">
                      Buying Price / Cost Price ({currencySymbol}) *
                    </label>
                    <input
                      type="number"
                      step="any"
                      min="0"
                      value={formBuyingPrice}
                      onChange={(e) => setFormBuyingPrice(e.target.value)}
                      placeholder="0.00"
                      className="form-input font-mono font-bold text-amber-900 bg-amber-50/30"
                      required={formIsRestockable}
                    />
                    <span className="text-[11px] text-surface-500 mt-0.5">Rate at which store purchases</span>
                  </div>

                  <div className="form-group">
                    <label className="form-label font-semibold">
                      Selling Price / Retail Price ({currencySymbol}) *
                    </label>
                    <input
                      type="number"
                      step="any"
                      min="0"
                      value={formPrice}
                      onChange={(e) => setFormPrice(e.target.value)}
                      placeholder="0.00"
                      className="form-input font-mono font-bold text-emerald-900 bg-emerald-50/30"
                      required
                    />
                    <span className="text-[11px] text-surface-500 mt-0.5">Rate charged to customer</span>
                  </div>
                </div>

                {/* Stock Row in 2 Columns */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {!editingProduct ? (
                    <div className="form-group">
                      <label className="form-label font-semibold">
                        Initial Stock Count (Units) *
                      </label>
                      <input
                        type="number"
                        step="1"
                        min="0"
                        value={formInitialStock}
                        onChange={(e) => setFormInitialStock(e.target.value)}
                        placeholder="0"
                        className="form-input font-mono font-bold"
                        required={formIsRestockable}
                      />
                      <span className="text-[11px] text-surface-500 mt-0.5">Units currently in store</span>
                    </div>
                  ) : (
                    <div className="form-group">
                      <label className="form-label font-semibold">Current Stock Count</label>
                      <div className="form-input font-mono font-bold bg-surface-100 flex items-center justify-between text-surface-700">
                        <span>{formInitialStock} units</span>
                        <span className="text-xs font-normal text-surface-500">(Use Restock button to add stock)</span>
                      </div>
                    </div>
                  )}

                  <div className="flex flex-col justify-end">
                    <div className="text-xs text-surface-500 bg-white/70 p-2.5 rounded-lg border border-surface-200">
                      <span className="font-semibold text-surface-700 block mb-0.5">Inventory Tracking</span>
                      Stock auto-decrements on billing and alerts cashier when stock drops below 5 units.
                    </div>
                  </div>
                </div>

                {/* Unified Profit Margin & Financial Preview */}
                {(parseFloat(formBuyingPrice) > 0 || parseFloat(formPrice) > 0) && (
                  <div className="p-3.5 rounded-xl bg-gradient-to-br from-emerald-50/90 to-teal-50/70 border border-emerald-200/90 text-xs space-y-2.5">
                    <div className="grid grid-cols-3 gap-3 font-mono">
                      <div className="bg-white/90 p-2.5 rounded-lg border border-emerald-100 shadow-2xs">
                        <span className="text-[11px] text-surface-500 block">Unit Cost:</span>
                        <span className="font-bold text-amber-800 text-sm">
                          {currencySymbol}{parseFloat(formBuyingPrice || '0').toFixed(2)}
                        </span>
                      </div>
                      <div className="bg-white/90 p-2.5 rounded-lg border border-emerald-100 shadow-2xs">
                        <span className="text-[11px] text-surface-500 block">Unit Retail:</span>
                        <span className="font-bold text-surface-900 text-sm">
                          {currencySymbol}{parseFloat(formPrice || '0').toFixed(2)}
                        </span>
                      </div>
                      <div className="bg-white/90 p-2.5 rounded-lg border border-emerald-100 shadow-2xs">
                        <span className="text-[11px] text-surface-500 block">Gross Profit:</span>
                        <span className={`font-bold text-sm ${parseFloat(formPrice || '0') >= parseFloat(formBuyingPrice || '0') ? 'text-emerald-700' : 'text-red-600'}`}>
                          {currencySymbol}{(parseFloat(formPrice || '0') - parseFloat(formBuyingPrice || '0')).toFixed(2)}
                          {parseFloat(formPrice || '0') > 0 && (
                            <span className="text-2xs font-semibold ml-1">
                              ({(((parseFloat(formPrice || '0') - parseFloat(formBuyingPrice || '0')) / parseFloat(formPrice || '0')) * 100).toFixed(1)}%)
                            </span>
                          )}
                        </span>
                      </div>
                    </div>

                    {!editingProduct && parseInt(formInitialStock || '0') > 0 && parseFloat(formBuyingPrice || '0') > 0 && (
                      <div className="pt-2.5 border-t border-emerald-200/70 flex items-center justify-between font-mono">
                        <div className="flex items-center gap-1.5 text-[11px] text-surface-600">
                          <Info className="w-3.5 h-3.5 text-primary-600 flex-shrink-0" />
                          <span>Auto-recorded in Expenses (Inventory & Supplies):</span>
                        </div>
                        <span className="text-xs font-bold text-primary-800 bg-white px-2.5 py-0.5 rounded border border-primary-200 shadow-2xs">
                          {currencySymbol}{(parseInt(formInitialStock) * parseFloat(formBuyingPrice)).toFixed(2)}
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="pt-3 border-t border-surface-200">
                <div className="form-group">
                  <label className="form-label font-semibold">
                    Selling Price / Retail Price ({currencySymbol}) *
                  </label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    value={formPrice}
                    onChange={(e) => setFormPrice(e.target.value)}
                    placeholder="0.00"
                    className="form-input font-mono font-bold text-emerald-900 bg-emerald-50/30"
                    required
                  />
                  <span className="text-[11px] text-surface-500 mt-0.5">Rate charged to customer (Stock tracking disabled)</span>
                </div>
              </div>
            )}
          </div>

          {/* GST Toggle Option & Live Preview - Only shown when GST is enabled in settings */}
          {gstEnabled && (
            <div className="p-3 rounded-lg bg-surface-50 border border-surface-200 space-y-2.5">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold text-surface-800">GST / Tax Configuration</div>
                  <div className="text-xs text-surface-500">Calculate and add GST to this product during billing</div>
                </div>
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={formGstEnabled}
                    onChange={(e) => setFormGstEnabled(e.target.checked)}
                    className="form-checkbox"
                  />
                  <span className="text-sm font-semibold text-primary-700">Enable GST</span>
                </label>
              </div>

              {formGstEnabled && (
                <div className="pt-2 border-t border-surface-200 space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-medium text-surface-600">Applicable GST Slab:</label>
                    <CustomSelect
                      value={formGstPct}
                      onChange={setFormGstPct}
                      options={[
                        { value: '0', label: '0% (Exempt)' },
                        { value: '5', label: '5% (CGST 2.5% + SGST 2.5%)' },
                        { value: '12', label: '12% (CGST 6% + SGST 6%)' },
                        { value: '18', label: '18% (CGST 9% + SGST 9%)' },
                        { value: '28', label: '28% (CGST 14% + SGST 14%)' },
                      ]}
                      size="sm"
                      buttonClassName="w-56 h-8 text-xs font-mono font-medium rounded-lg"
                    />
                  </div>

                  {/* Live Calculation Preview */}
                  {parseFloat(formPrice) > 0 && (
                    <div className="bg-primary-50/70 border border-primary-100 rounded-md p-2.5 text-xs text-surface-700 space-y-1">
                      <div className="flex justify-between font-mono">
                        <span className="text-surface-600">Base Unit Price:</span>
                        <span className="font-semibold">{currencySymbol}{parseFloat(formPrice).toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between font-mono text-primary-800">
                        <span>GST Amount ({formGstPct}%):</span>
                        <span className="font-semibold">+ {currencySymbol}{((parseFloat(formPrice) * parseFloat(formGstPct || '0')) / 100).toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between font-mono text-surface-500 text-[11px] pl-2">
                        <span>CGST ({(parseFloat(formGstPct || '0') / 2).toFixed(1)}%):</span>
                        <span>{currencySymbol}{((parseFloat(formPrice) * parseFloat(formGstPct || '0')) / 200).toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between font-mono text-surface-500 text-[11px] pl-2">
                        <span>SGST ({(parseFloat(formGstPct || '0') / 2).toFixed(1)}%):</span>
                        <span>{currencySymbol}{((parseFloat(formPrice) * parseFloat(formGstPct || '0')) / 200).toFixed(2)}</span>
                      </div>
                      <div className="border-t border-primary-200 pt-1 flex justify-between font-mono font-bold text-primary-900 text-xs">
                        <span>Total Price (Incl. GST):</span>
                        <span>{currencySymbol}{(parseFloat(formPrice) * (1 + parseFloat(formGstPct || '0') / 100)).toFixed(2)}</span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-surface-100">
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              className="btn-secondary text-sm"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="btn-primary text-sm flex items-center gap-1.5"
            >
              {isSaving ? <div className="spinner w-4 h-4 border-white" /> : <Check className="w-4 h-4" />}
              <span>{editingProduct ? 'Save Changes' : 'Create Product'}</span>
            </button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={!!deletingProduct}
        onClose={() => setDeletingProduct(null)}
        onConfirm={handleConfirmDelete}
        title="Delete Product"
        message={`Are you sure you want to delete "${deletingProduct?.name}" (${deletingProduct?.product_code})? This will remove the item from your catalog.`}
        confirmText="Yes, Delete Product"
        isLoading={isDeleting}
      />

      {/* Quick Restock Modal */}
      <Modal
        isOpen={isRestockModalOpen}
        onClose={() => setIsRestockModalOpen(false)}
        title={restockingProduct ? `Restock Item: ${restockingProduct.name}` : 'Restock Product'}
        maxWidth="md"
        closeOnBackdropClick={false}
      >
        <form onSubmit={handleConfirmRestock} className="space-y-4">
          <div className="p-3.5 rounded-xl bg-surface-50 border border-surface-200 flex items-center justify-between">
            <div>
              <div className="text-xs font-mono font-semibold text-primary-700">{restockingProduct?.product_code}</div>
              <div className="text-base font-bold text-surface-900">{restockingProduct?.name}</div>
            </div>
            <div className="text-right">
              <div className="text-xs text-surface-500">Current Stock</div>
              <div className={`font-mono text-lg font-bold ${(restockingProduct?.current_stock ?? 0) <= 2 ? 'text-red-600' : (restockingProduct?.current_stock ?? 0) <= 5 ? 'text-amber-600' : 'text-emerald-700'}`}>
                {restockingProduct?.current_stock ?? 0} units
              </div>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label font-semibold">Units to Add (Count) *</label>
            <input
              type="number"
              step="1"
              min="1"
              value={restockQuantity}
              onChange={(e) => setRestockQuantity(e.target.value)}
              placeholder="Count"
              className="form-input font-mono font-bold text-lg"
              required
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="form-group">
              <label className="form-label font-semibold">Buying Rate ({currencySymbol}) *</label>
              <input
                type="number"
                step="any"
                min="0"
                value={restockBuyingPrice}
                onChange={(e) => setRestockBuyingPrice(e.target.value)}
                placeholder="0.00"
                className="form-input font-mono font-bold text-base text-amber-900 bg-amber-50/30"
                required
              />
              <span className="text-3xs text-surface-400 mt-0.5 block">Purchase cost / unit</span>
            </div>

            <div className="form-group">
              <label className="form-label font-semibold">Selling Price ({currencySymbol}) *</label>
              <input
                type="number"
                step="any"
                min="0"
                value={restockSellingPrice}
                onChange={(e) => setRestockSellingPrice(e.target.value)}
                placeholder="0.00"
                className="form-input font-mono font-bold text-base text-emerald-900 bg-emerald-50/30"
                required
              />
              <span className="text-3xs text-surface-400 mt-0.5 block">Retail billing price / unit</span>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label font-semibold">Payment Method for Expense *</label>
            <CustomSelect
              value={restockPaymentMethod}
              onChange={setRestockPaymentMethod}
              options={[
                { value: 'cash', label: 'Cash' },
                { value: 'upi', label: 'UPI / Online' },
                { value: 'card', label: 'Card' },
                { value: 'bank_transfer', label: 'Bank Transfer' },
              ]}
              size="lg"
              buttonClassName="w-full h-10 text-sm font-medium rounded-lg"
            />
          </div>

          <div className="form-group">
            <label className="form-label font-semibold">Supplier / Restock Notes (Optional)</label>
            <input
              type="text"
              value={restockNotes}
              onChange={(e) => setRestockNotes(e.target.value)}
              placeholder="e.g. Vendor name, batch no, invoice ref"
              className="form-input text-sm"
            />
          </div>

          {/* Live Financial Calculation Box */}
          {parseInt(restockQuantity) > 0 && parseFloat(restockBuyingPrice) >= 0 && (
            <div className="p-3.5 rounded-xl bg-primary-50/70 border border-primary-100 text-xs space-y-2 font-mono">
              <div className="flex justify-between text-surface-700">
                <span>New Updated Total Stock:</span>
                <span className="font-bold text-surface-900">
                  {(restockingProduct?.current_stock ?? 0) + (parseInt(restockQuantity) || 0)} units
                </span>
              </div>
              <div className="flex justify-between text-surface-700">
                <span>Total Amount to be Spent:</span>
                <span className="font-bold text-primary-900 text-sm">
                  {currencySymbol}{((parseInt(restockQuantity) || 0) * (parseFloat(restockBuyingPrice) || 0)).toFixed(2)}
                </span>
              </div>
              {parseFloat(restockSellingPrice) > 0 && (
                <div className="flex justify-between items-center text-surface-700 pt-1.5 border-t border-primary-200/60 font-sans">
                  <span className="font-medium text-xs">Estimated Unit Profit:</span>
                  <span className="font-bold text-emerald-700 flex items-center gap-1">
                    <TrendingUp className="w-3.5 h-3.5 flex-shrink-0" />
                    +{currencySymbol}{(parseFloat(restockSellingPrice) - (parseFloat(restockBuyingPrice) || 0)).toFixed(2)} / unit
                    {parseFloat(restockBuyingPrice) > 0 && (
                      <span className="text-3xs text-emerald-700 font-semibold bg-emerald-100 px-1.5 py-0.5 rounded ml-1">
                        +{(((parseFloat(restockSellingPrice) - parseFloat(restockBuyingPrice)) / parseFloat(restockBuyingPrice)) * 100).toFixed(1)}%
                      </span>
                    )}
                  </span>
                </div>
              )}
              <div className="border-t border-primary-200 pt-1.5 text-[11px] text-surface-600 font-sans flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
                <span>This expense will automatically be added to your <strong>Expenses</strong> log under <em>"Inventory & Supplies"</em>.</span>
              </div>
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-surface-100">
            <button
              type="button"
              onClick={() => setIsRestockModalOpen(false)}
              className="btn-secondary text-sm"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmittingRestock}
              className="btn-primary text-sm flex items-center gap-1.5 font-semibold bg-emerald-600 hover:bg-emerald-700 border-emerald-600"
            >
              {isSubmittingRestock ? <div className="spinner w-4 h-4 border-white" /> : <Package className="w-4 h-4" />}
              <span>Confirm Restock & Record Expense</span>
            </button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={!!deletingProduct}
        onClose={() => setDeletingProduct(null)}
        onConfirm={handleConfirmDelete}
        title="Delete Product"
        message={`Are you sure you want to delete "${deletingProduct?.name}"?`}
        confirmText="Yes, Delete Product"
        isLoading={isDeleting}
      />
    </div>
  );
};
