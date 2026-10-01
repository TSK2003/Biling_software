import React, { useState, useEffect } from 'react';
import {
  Plus,
  Edit2,
  Trash2,
  Power,
  Search,
  Info,
  GripVertical,
  ChevronUp,
  ChevronDown,
  ArrowUpDown,
} from 'lucide-react';
import { api } from '../../lib/ipc';
import { Modal } from '../../components/Modal';
import { ConfirmModal } from '../../components/ConfirmModal';
import { Header } from '../../components/Header';
import type { Category } from '../../types';
import toast from 'react-hot-toast';

export const CategoriesPage: React.FC = () => {
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Drag & drop and Click-to-Move reordering state
  const [draggedCatId, setDraggedCatId] = useState<number | null>(null);
  const [dragOverCatId, setDragOverCatId] = useState<number | null>(null);
  const [pickedCategory, setPickedCategory] = useState<Category | null>(null);
  const [productCounts, setProductCounts] = useState<Record<number, number>>({});

  // Filter & Search states
  const [searchQuery, setSearchQuery] = useState('');

  // Add/Edit Modal (Display Sort Order input removed - automatically managed sequentially)
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [formName, setFormName] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Delete Confirmation Modal
  const [deletingCategory, setDeletingCategory] = useState<Category | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const loadCategories = async () => {
    setIsLoading(true);
    try {
      const [list, prodsRes] = await Promise.all([
        api.getCategories(false),
        api.getProducts(undefined, false, 1, 5000).catch(() => ({ data: [] })),
      ]);
      // Sort by sort_order for correct display order, tie-break by name
      list.sort((a, b) => (a.sort_order - b.sort_order) || a.name.localeCompare(b.name));

      // Clean up any messy, duplicate, or gapped sort orders (e.g. duplicate #5, missing #2)
      const hasMessyOrders = list.some((cat, i) => cat.sort_order !== i + 1);
      const normalized = list.map((cat, i) => ({
        ...cat,
        sort_order: i + 1,
      }));
      setCategories(normalized);

      // Auto-heal database in background so categories are strictly 1..N
      if (hasMessyOrders && normalized.length > 0) {
        api.reorderCategories(normalized.map((c) => c.id)).catch(console.error);
      }

      const counts: Record<number, number> = {};
      if (prodsRes?.data) {
        prodsRes.data.forEach((p) => {
          counts[p.category_id] = (counts[p.category_id] || 0) + 1;
        });
      }
      setProductCounts(counts);
    } catch {
      toast.error('Failed to load categories');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadCategories();
  }, []);

  const handleOpenAdd = () => {
    setEditingCategory(null);
    setFormName('');
    setIsModalOpen(true);
  };

  const handleOpenEdit = (c: Category) => {
    setEditingCategory(c);
    setFormName(c.name);
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) return;

    setIsSaving(true);
    try {
      if (editingCategory) {
        // Keep category's current sort order when editing name
        await api.updateCategory(
          editingCategory.id,
          formName.trim(),
          editingCategory.sort_order
        );
        toast.success('Category updated');
      } else {
        // Append new category to the end
        await api.createCategory(formName.trim(), categories.length + 1);
        toast.success('Category created');
      }
      setIsModalOpen(false);
      loadCategories();
    } catch (err: any) {
      toast.error(typeof err === 'string' ? err : 'Operation failed');
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleActive = async (c: Category) => {
    // Optimistic update
    setCategories((prev) =>
      prev.map((cat) => (cat.id === c.id ? { ...cat, is_active: !cat.is_active } : cat))
    );
    try {
      await api.updateCategory(c.id, undefined, undefined, !c.is_active);
      toast.success(c.is_active ? 'Category deactivated' : 'Category activated');
    } catch (err: any) {
      setCategories((prev) =>
        prev.map((cat) => (cat.id === c.id ? { ...cat, is_active: c.is_active } : cat))
      );
      toast.error(typeof err === 'string' ? err : 'Failed to toggle category');
    }
  };

  // Drag and Drop reordering handler
  const handleDrop = async (sourceCatId: number, targetCatId: number) => {
    setDraggedCatId(null);
    setDragOverCatId(null);

    if (sourceCatId === targetCatId) return;

    const sourceIndex = categories.findIndex((c) => c.id === sourceCatId);
    const targetIndex = categories.findIndex((c) => c.id === targetCatId);
    if (sourceIndex === -1 || targetIndex === -1) return;

    const reordered = [...categories];
    const [moved] = reordered.splice(sourceIndex, 1);
    reordered.splice(targetIndex, 0, moved);

    // Assign clean sequential numbers 1, 2, 3, 4...
    const updated = reordered.map((cat, i) => ({
      ...cat,
      sort_order: i + 1,
    }));

    setCategories(updated);
    toast.success(`Category "${moved.name}" moved to position #${targetIndex + 1}`);

    try {
      await api.reorderCategories(updated.map((cat) => cat.id));
    } catch {
      loadCategories();
      toast.error('Failed to save category order');
    }
  };

  // Move single step up or down
  const handleMoveOne = async (currentIndex: number, targetIndex: number) => {
    if (targetIndex < 0 || targetIndex >= categories.length) return;

    const reordered = [...categories];
    const [moved] = reordered.splice(currentIndex, 1);
    reordered.splice(targetIndex, 0, moved);

    const updated = reordered.map((cat, i) => ({
      ...cat,
      sort_order: i + 1,
    }));

    setCategories(updated);
    toast.success(`Category "${moved.name}" moved to position #${targetIndex + 1}`);

    try {
      await api.reorderCategories(updated.map((cat) => cat.id));
    } catch {
      loadCategories();
      toast.error('Failed to save category order');
    }
  };

  // Sort categories alphabetically A to Z
  const handleSortAlphabetical = async () => {
    const sorted = [...categories].sort((a, b) => a.name.localeCompare(b.name));
    const updated = sorted.map((cat, i) => ({
      ...cat,
      sort_order: i + 1,
    }));
    setCategories(updated);
    toast.success('Categories sorted alphabetically (A to Z)');
    try {
      await api.reorderCategories(updated.map((cat) => cat.id));
    } catch {
      toast.error('Failed to save category order');
      loadCategories();
    }
  };

  const handleConfirmDelete = async () => {
    if (!deletingCategory) return;
    setIsDeleting(true);
    try {
      await api.deleteCategory(deletingCategory.id);
      const remaining = categories.filter((cat) => cat.id !== deletingCategory.id);
      const reindexed = remaining.map((cat, i) => ({ ...cat, sort_order: i + 1 }));
      setCategories(reindexed);
      api.reorderCategories(reindexed.map((c) => c.id)).catch(console.error);
      toast.success(`Category "${deletingCategory.name}" deleted successfully`);
      setDeletingCategory(null);
    } catch (err: any) {
      toast.error(typeof err === 'string' ? err : 'Failed to delete category');
    } finally {
      setIsDeleting(false);
    }
  };

  // Filtered categories
  const filteredCategories = categories.filter((c) => {
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      if (!c.name.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const isFiltering = Boolean(searchQuery.trim());

  return (
    <div className="flex flex-col h-full overflow-hidden bg-surface-50">
      <Header
        title="Category Management"
        subtitle="Organize your shop products into intuitive catalog groups & custom display order"
        actions={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSortAlphabetical}
              className="h-8 px-3 text-xs font-semibold bg-white hover:bg-surface-50 text-surface-700 border border-surface-200 rounded-lg transition-all inline-flex items-center gap-1.5 shadow-sm cursor-pointer"
              title="Sort categories alphabetically (A to Z)"
            >
              <ArrowUpDown className="w-3.5 h-3.5 text-surface-500" />
              <span>Sort A-Z</span>
            </button>
            <button
              onClick={handleOpenAdd}
              className="btn-primary flex items-center gap-1.5 text-xs font-semibold"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Category</span>
            </button>
          </div>
        }
      />

      <div className="p-6 overflow-y-auto flex-1 w-full space-y-4">
        {/* Search Filter Bar */}
        <div className="card p-3 bg-white flex items-center justify-between gap-3 flex-wrap">
          {/* Search Input */}
          <div className="relative flex-1 min-w-[240px] max-w-md">
            <Search className="w-4 h-4 text-surface-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search category name..."
              className="form-input pl-9 text-xs h-9"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-2.5 text-2xs text-surface-400 hover:text-surface-600 font-semibold cursor-pointer"
              >
                Clear
              </button>
            )}
          </div>

          <div className="text-xs text-surface-500 font-medium">
            Showing <span className="font-bold text-surface-800">{filteredCategories.length}</span> of {categories.length} categories
          </div>
        </div>

        {/* Active Moving Banner (Click-to-Move Mode) */}
        {pickedCategory && (
          <div className="p-3 bg-primary-50 border-2 border-primary-500 rounded-xl flex items-center justify-between shadow-xs animate-in fade-in slide-in-from-top-2 duration-150">
            <div className="flex items-center gap-2.5">
              <span className="w-2.5 h-2.5 rounded-full bg-primary-600 animate-ping" />
              <div className="text-xs text-primary-950 font-medium">
                Moving <strong className="font-bold text-primary-900">"{pickedCategory.name}"</strong> (Position #{pickedCategory.sort_order}) — Click any row below to place it there.
              </div>
            </div>
            <button
              type="button"
              onClick={() => setPickedCategory(null)}
              className="text-xs font-bold text-primary-700 hover:text-primary-900 bg-white border border-primary-200 px-3 py-1 rounded-lg shadow-xs hover:bg-primary-50 cursor-pointer transition-colors"
            >
              Cancel Move
            </button>
          </div>
        )}

        {/* Category Order Hint */}
        <div className="flex items-center justify-between text-xs text-surface-600 px-1 py-1">
          <div className="flex items-center gap-2">
            <Info className="w-4 h-4 text-primary-600 flex-shrink-0" />
            <span>
              <strong>Tip:</strong> Drag the dots handle (<GripVertical className="w-3.5 h-3.5 inline text-surface-500" />) to move, click dots to select, or use ▲ / ▼ to place categories in exact order (#1, #2...).
            </span>
          </div>
          <span className="font-mono text-xs font-semibold text-surface-500">
            Showing {filteredCategories.length} of {categories.length} categories
          </span>
        </div>

        {/* Categories Table */}
        <div className="card overflow-hidden w-full bg-white shadow-xs border border-surface-200">
          <div className="table-container">
            <table className="table w-full">
              <thead>
                <tr>
                  <th className="w-36 text-center">Order / Pos</th>
                  <th>Category Name</th>
                  <th className="w-32 text-center">Products</th>
                  <th className="w-28 text-center">Status</th>
                  <th className="w-36 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={5} className="text-center py-8 text-surface-400">
                      <div className="spinner mx-auto mb-2" />
                      Loading categories...
                    </td>
                  </tr>
                ) : filteredCategories.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center py-8 text-surface-400">
                      {isFiltering
                        ? 'No categories match the search query.'
                        : 'No categories found. Click "Add Category" above to create one.'}
                    </td>
                  </tr>
                ) : (
                  filteredCategories.map((c, catIndex) => {
                    const isDragging = draggedCatId === c.id;
                    const isDragOver = dragOverCatId === c.id && draggedCatId !== c.id;
                    const isPicked = pickedCategory?.id === c.id;
                    const prodCount = productCounts[c.id] || 0;
                    return (
                      <tr
                        key={c.id}
                        data-category-id={c.id}
                        draggable={!isFiltering}
                        onDragStart={(e) => {
                          setDraggedCatId(c.id);
                          e.dataTransfer.setData('text/plain', String(c.id));
                          e.dataTransfer.effectAllowed = 'move';
                        }}
                        onDragOver={(e) => {
                          e.preventDefault();
                          e.dataTransfer.dropEffect = 'move';
                          if (dragOverCatId !== c.id) {
                            setDragOverCatId(c.id);
                          }
                        }}
                        onDragEnd={() => {
                          setDraggedCatId(null);
                          setDragOverCatId(null);
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          const raw = e.dataTransfer.getData('text/plain');
                          const srcId = draggedCatId ?? (raw ? parseInt(raw, 10) : null);
                          if (srcId !== null) {
                            handleDrop(srcId, c.id);
                          }
                        }}
                        onClick={() => {
                          if (pickedCategory && pickedCategory.id !== c.id) {
                            handleDrop(pickedCategory.id, c.id);
                            setPickedCategory(null);
                          }
                        }}
                        className={`transition-all select-none ${
                          isPicked
                            ? 'bg-primary-100/90 border-2 border-primary-500 shadow-sm ring-2 ring-primary-300'
                            : pickedCategory
                            ? 'cursor-pointer hover:bg-primary-50/70 hover:border-primary-400'
                            : ''
                        } ${
                          !c.is_active ? 'opacity-60 bg-surface-50' : ''
                        } ${
                          isDragging
                            ? 'opacity-30 bg-primary-100 scale-[0.99] border-dashed border-2 border-primary-500 shadow-inner'
                            : ''
                        } ${
                          isDragOver
                            ? 'border-t-4 border-primary-600 bg-primary-50/90 shadow-md ring-2 ring-primary-300'
                            : ''
                        }`}
                      >
                        {/* Order / Position Drag Handle + Badge + Up/Down Arrows */}
                        <td className="font-mono text-xs">
                          <div className="flex items-center justify-center gap-1.5">
                            {/* Drag Grip Handle with Click-to-Move */}
                            <div
                              onClick={(e) => {
                                e.stopPropagation();
                                if (isFiltering) return;
                                if (pickedCategory?.id === c.id) {
                                  setPickedCategory(null);
                                } else {
                                  setPickedCategory(c);
                                  toast.success(`Selected "${c.name}". Click any row to place it there.`);
                                }
                              }}
                              className={`p-1.5 rounded-lg transition-all flex items-center justify-center select-none ${
                                isPicked
                                  ? 'bg-primary-600 text-white shadow-sm ring-2 ring-primary-400'
                                  : isFiltering
                                  ? 'opacity-20 cursor-not-allowed'
                                  : 'cursor-grab active:cursor-grabbing text-surface-400 hover:text-primary-700 hover:bg-surface-200'
                              }`}
                              title={
                                isFiltering
                                  ? 'Reset search filter to drag & drop'
                                  : isPicked
                                  ? 'Selected for moving — click any row to place here, or click to cancel'
                                  : 'Drag row to move, or click dots to pick up and place on another row'
                              }
                            >
                              <GripVertical className="w-4 h-4 pointer-events-none" />
                            </div>

                            {/* Sequential Order Number Badge */}
                            <span
                              className={`inline-flex items-center justify-center font-mono font-bold text-xs px-2 py-1 rounded-md border min-w-[38px] transition-colors ${
                                isPicked
                                  ? 'bg-primary-600 text-white border-primary-700 shadow-sm'
                                  : 'bg-surface-100 text-surface-900 border-surface-300 shadow-2xs'
                              }`}
                              title={`Display position #${c.sort_order}`}
                            >
                              #{c.sort_order}
                            </span>

                            {/* Up / Down Arrow Step Buttons */}
                            {!isFiltering && (
                              <div className="flex flex-col -space-y-1">
                                <button
                                  type="button"
                                  disabled={catIndex === 0}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleMoveOne(catIndex, catIndex - 1);
                                  }}
                                  className="p-0.5 text-surface-400 hover:text-primary-700 hover:bg-surface-200 rounded disabled:opacity-15 disabled:cursor-not-allowed cursor-pointer transition-colors"
                                  title="Move up"
                                >
                                  <ChevronUp className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  disabled={catIndex === categories.length - 1}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleMoveOne(catIndex, catIndex + 1);
                                  }}
                                  className="p-0.5 text-surface-400 hover:text-primary-700 hover:bg-surface-200 rounded disabled:opacity-15 disabled:cursor-not-allowed cursor-pointer transition-colors"
                                  title="Move down"
                                >
                                  <ChevronDown className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            )}
                          </div>
                        </td>

                        {/* Category Name - Clean text without redundant AI icon */}
                        <td className="font-semibold text-surface-900 text-sm">
                          {c.name}
                        </td>

                        {/* Product Count (increases by 1 when products are added) */}
                        <td className="text-center">
                          <span
                            className={`badge text-2xs font-bold px-2.5 py-0.5 ${
                              prodCount > 0
                                ? 'bg-primary-50 text-primary-700 border border-primary-200'
                                : 'bg-surface-100 text-surface-500 border border-surface-200'
                            }`}
                          >
                            {prodCount} {prodCount === 1 ? 'Product' : 'Products'}
                          </span>
                        </td>

                        {/* Status */}
                        <td className="text-center">
                          {c.is_active ? (
                            <span className="badge badge-success">Active</span>
                          ) : (
                            <span className="badge badge-danger">Inactive</span>
                          )}
                        </td>

                        {/* Actions */}
                        <td className="text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1.5">
                            {/* Edit */}
                            <button
                              type="button"
                              onClick={() => handleOpenEdit(c)}
                              className="btn-secondary btn-sm flex items-center gap-1 text-2xs py-1 px-2 text-primary-700 hover:bg-primary-50 cursor-pointer"
                              title="Edit category"
                            >
                              <Edit2 className="w-3 h-3 text-primary-600" />
                              <span>Edit</span>
                            </button>

                            {/* Toggle Active */}
                            <button
                              type="button"
                              onClick={() => handleToggleActive(c)}
                              className={`btn-sm flex items-center gap-1 text-2xs py-1 px-2 rounded border transition-colors cursor-pointer ${
                                c.is_active
                                  ? 'bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100'
                                  : 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100'
                              }`}
                              title={c.is_active ? 'Deactivate this category' : 'Activate this category'}
                            >
                              <Power className="w-3 h-3" />
                              <span>{c.is_active ? 'Deactivate' : 'Activate'}</span>
                            </button>

                            {/* Delete */}
                            <button
                              type="button"
                              onClick={() => setDeletingCategory(c)}
                              className="btn-sm flex items-center gap-1 text-2xs py-1 px-2 rounded border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 transition-colors cursor-pointer"
                              title="Delete category"
                            >
                              <Trash2 className="w-3 h-3 text-red-600" />
                              <span>Delete</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Add / Edit Category Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingCategory ? `Edit ${editingCategory.name}` : 'Add New Category'}
        maxWidth="sm"
      >
        <form onSubmit={handleSave} className="space-y-4">
          <div className="form-group">
            <label className="form-label">Category Name *</label>
            <input
              type="text"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              placeholder="e.g. Beverages, Snacks, Groceries"
              className="form-input"
              required
              autoFocus
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-surface-100">
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              className="btn-secondary text-xs"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="btn-primary text-xs"
            >
              {isSaving ? 'Saving...' : editingCategory ? 'Save Changes' : 'Create Category'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={!!deletingCategory}
        onClose={() => setDeletingCategory(null)}
        onConfirm={handleConfirmDelete}
        title="Delete Category"
        message={`Are you sure you want to delete category "${deletingCategory?.name}"? If products are linked to this category, please reassign or delete them first.`}
        confirmText="Yes, Delete Category"
        isLoading={isDeleting}
      />
    </div>
  );
};
