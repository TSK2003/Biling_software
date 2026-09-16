import React, { useState, useEffect, useRef } from 'react';
import { Plus, Search, Edit2, Trash2, Check, Filter, Upload, Image as ImageIcon, X, Power } from 'lucide-react';
import { api } from '../../lib/ipc';
import { formatCurrency, rupeesToPaise, paiseToRupeesStr } from '../../lib/format';
import { Modal } from '../../components/Modal';
import { ConfirmModal } from '../../components/ConfirmModal';
import { Header } from '../../components/Header';
import type { Product, Category } from '../../types';
import toast from 'react-hot-toast';

export const ProductsPage: React.FC = () => {
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
  const [isSaving, setIsSaving] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [catList, prodRes] = await Promise.all([
        api.getCategories(true),
        api.getProducts(selectedCategory || undefined, false, 1, 200),
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
    loadData();
  }, [selectedCategory]);

  const handleOpenAdd = () => {
    setEditingProduct(null);
    setFormName('');
    setFormCategory(categories[0]?.id || 1);
    setFormPrice('');
    setFormGstEnabled(false);
    setFormGstPct('5');
    setFormImagePath('');
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
    setIsModalOpen(true);
  };

  const handleImageFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file (PNG, JPG, WebP, etc.)');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image size should be under 5MB');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      setFormImagePath(result);
      toast.success('Image selected successfully!');
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveImage = () => {
    setFormImagePath('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim() || !formPrice) return;

    const pricePaise = rupeesToPaise(formPrice);
    const gstPctX100 = Math.round(parseFloat(formGstPct || '0') * 100);

    setIsSaving(true);
    try {
      if (editingProduct) {
        await api.updateProduct(
          editingProduct.id,
          formName.trim(),
          formCategory,
          pricePaise,
          formGstEnabled,
          gstPctX100,
          undefined,
          formImagePath.trim() || ''
        );
        toast.success('Product updated with image successfully!');
      } else {
        await api.createProduct(
          formName.trim(),
          formCategory,
          pricePaise,
          formGstEnabled,
          gstPctX100,
          formImagePath.trim() || undefined
        );
        toast.success('Product created with image!');
      }
      setIsModalOpen(false);
      loadData();
    } catch (err: any) {
      toast.error(typeof err === 'string' ? err : 'Save failed');
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleActive = async (p: Product) => {
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
      loadData();
    } catch (err: any) {
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
      toast.success(`Product "${deletingProduct.name}" deleted successfully`);
      setDeletingProduct(null);
      loadData();
    } catch (err: any) {
      toast.error(typeof err === 'string' ? err : 'Failed to delete');
    } finally {
      setIsDeleting(false);
    }
  };

  const filteredProducts = products.filter((p) => {
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
            onClick={handleOpenAdd}
            className="btn-primary flex items-center gap-1.5 text-sm font-semibold"
          >
            <Plus className="w-4 h-4" />
            <span>Add New Product</span>
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
              placeholder="Search products by code (PRD-...) or name..."
              className="form-input pl-9 text-sm"
            />
          </div>

          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-surface-400" />
            <select
              value={selectedCategory || ''}
              onChange={(e) =>
                setSelectedCategory(
                  e.target.value ? parseInt(e.target.value) : null
                )
              }
              className="form-select text-sm py-1.5"
            >
              <option value="">All Categories</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Product Table */}
        <div className="card overflow-hidden">
          <div className="table-container">
            <table className="table w-full">
              <thead>
                <tr>
                  <th className="w-16 text-center">Image</th>
                  <th className="w-32">Product Code</th>
                  <th>Product Name</th>
                  <th className="w-40">Category</th>
                  <th className="w-32 text-right">Selling Price</th>
                  <th className="w-24 text-center">GST Rate</th>
                  <th className="w-28 text-center">Status</th>
                  <th className="w-40 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={8} className="text-center py-8 text-surface-400">
                      <div className="spinner mx-auto mb-2" />
                      Loading catalog...
                    </td>
                  </tr>
                ) : filteredProducts.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center py-8 text-surface-400">
                      No products found. Click "Add New Product" to create one.
                    </td>
                  </tr>
                ) : (
                  filteredProducts.map((p) => (
                    <tr key={p.id} className={!p.is_active ? 'opacity-60 bg-surface-50' : ''}>
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
                      <td className="font-mono font-semibold text-surface-900">
                        {formatCurrency(p.selling_price_paise)}
                      </td>
                      <td>
                        {p.gst_enabled ? (
                          <span className="badge badge-info font-mono">
                            {p.gst_percentage_x100 / 100}%
                          </span>
                        ) : (
                          <span className="text-xs text-surface-400">Exempt / Off</span>
                        )}
                      </td>
                      <td>
                        {p.is_active ? (
                          <span className="badge badge-success">Active</span>
                        ) : (
                          <span className="badge badge-danger">Inactive</span>
                        )}
                      </td>
                      <td className="text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
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
        maxWidth="md"
      >
        <form onSubmit={handleSave} className="space-y-4">
          {/* Image Upload Area */}
          <div className="form-group">
            <label className="form-label">Product Image</label>
            <div className="flex items-center gap-3 p-3 rounded-lg border border-surface-200 bg-surface-50/70">
              {/* Thumbnail / Upload Box */}
              <div className="relative w-20 h-20 rounded-lg border-2 border-dashed border-surface-300 bg-white flex items-center justify-center overflow-hidden flex-shrink-0 group hover:border-primary-500 transition-colors">
                {formImagePath ? (
                  <>
                    <img
                      src={formImagePath}
                      alt="Preview"
                      className="w-full h-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={handleRemoveImage}
                      className="absolute top-1 right-1 bg-red-600 text-white rounded-full p-0.5 hover:bg-red-700 shadow-sm"
                      title="Remove image"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </>
                ) : (
                  <ImageIcon className="w-7 h-7 text-surface-300" />
                )}
              </div>

              {/* Upload Buttons & Guidance */}
              <div className="flex-1 min-w-0">
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
                  className="btn-secondary text-sm inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Upload className="w-4 h-4 text-primary-600" />
                  <span>{formImagePath ? 'Change Image' : 'Select Product Image'}</span>
                </label>
                <div className="text-xs text-surface-500 mt-1">
                  Supports PNG, JPG, JPEG, WebP. Displayed on the POS billing screen.
                </div>
              </div>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Product Name *</label>
            <input
              type="text"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              placeholder="e.g. Product Name"
              className="form-input"
              required
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="form-group">
              <label className="form-label">Category *</label>
              <select
                value={formCategory}
                onChange={(e) => setFormCategory(parseInt(e.target.value))}
                className="form-select"
                required
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Selling Price (₹) *</label>
              <input
                type="number"
                step="0.5"
                min="0"
                value={formPrice}
                onChange={(e) => setFormPrice(e.target.value)}
                placeholder="e.g. 80.00"
                className="form-input font-mono font-bold"
                required
              />
            </div>
          </div>

          {/* GST Toggle Option */}
          <div className="p-3 rounded bg-surface-50 border border-surface-200 space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold text-surface-800">Product GST Rate</div>
                <div className="text-xs text-surface-500">Apply GST percentage on this product</div>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formGstEnabled}
                  onChange={(e) => setFormGstEnabled(e.target.checked)}
                  className="form-checkbox"
                />
                <span className="text-sm font-medium text-surface-700">Enable GST</span>
              </label>
            </div>

            {formGstEnabled && (
              <div className="pt-2 border-t border-surface-200 flex items-center gap-2">
                <label className="text-sm text-surface-600">GST Percentage:</label>
                <select
                  value={formGstPct}
                  onChange={(e) => setFormGstPct(e.target.value)}
                  className="form-select w-24 text-sm font-mono"
                >
                  <option value="0">0%</option>
                  <option value="5">5%</option>
                  <option value="12">12%</option>
                  <option value="18">18%</option>
                  <option value="28">28%</option>
                </select>
              </div>
            )}
          </div>

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
    </div>
  );
};
