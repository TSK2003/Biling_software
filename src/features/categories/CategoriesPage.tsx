import React, { useState, useEffect, useRef } from 'react';
import {
  Plus,
  Edit2,
  Trash2,
  Power,
  Search,
  Calendar,
  RotateCcw,
  Info,
  GripVertical,
} from 'lucide-react';
import { api } from '../../lib/ipc';
import { getTodayDateString } from '../../lib/format';
import { Modal } from '../../components/Modal';
import { ConfirmModal } from '../../components/ConfirmModal';
import { Header } from '../../components/Header';
import type { Category } from '../../types';
import toast from 'react-hot-toast';

export const CategoriesPage: React.FC = () => {
  const todayStr = getTodayDateString();
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Drag & drop and Click-to-Move reordering state
  const [draggedCatId, setDraggedCatId] = useState<number | null>(null);
  const [dragOverCatId, setDragOverCatId] = useState<number | null>(null);
  const [pickedCategory, setPickedCategory] = useState<Category | null>(null);
  const isPointerDraggingRef = useRef(false);
  const pointerStartPosRef = useRef({ x: 0, y: 0 });
  const draggedCatIdRef = useRef<number | null>(null);
  const [productCounts, setProductCounts] = useState<Record<number, number>>({});

  // Filter & Search states
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // Add/Edit Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [formName, setFormName] = useState('');
  const [formSortOrder, setFormSortOrder] = useState('0');
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
      // Sort by sort_order for correct display order
      list.sort((a, b) => a.sort_order - b.sort_order);
      setCategories(list);

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
    // Automatically set next sequential position (categories.length + 1)
    setFormSortOrder(String(categories.length + 1));
    setIsModalOpen(true);
  };

  const handleOpenEdit = (c: Category) => {
    setEditingCategory(c);
    setFormName(c.name);
    setFormSortOrder(String(c.sort_order));
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) return;

    setIsSaving(true);
    try {
      if (editingCategory) {
        await api.updateCategory(
          editingCategory.id,
          formName.trim(),
          parseInt(formSortOrder) || 0
        );
        toast.success('Category updated');
      } else {
        await api.createCategory(formName.trim(), parseInt(formSortOrder) || (categories.length + 1));
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
      await Promise.all(
        updated.map((cat) => api.updateCategory(cat.id, undefined, cat.sort_order))
      );
    } catch {
      loadCategories();
      toast.error('Failed to save category order');
    }
  };

  const handleConfirmDelete = async () => {
    if (!deletingCategory) return;
    setIsDeleting(true);
    try {
      await api.deleteCategory(deletingCategory.id);
      setCategories((prev) => prev.filter((cat) => cat.id !== deletingCategory.id));
      toast.success(`Category "${deletingCategory.name}" deleted successfully`);
      setDeletingCategory(null);
    } catch (err: any) {
      toast.error(typeof err === 'string' ? err : 'Failed to delete category');
    } finally {
      setIsDeleting(false);
    }
  };

  // Quick date presets
  const handleSetDatePreset = (preset: 'all' | 'today' | 'month') => {
    if (preset === 'all') {
      setDateFrom('');
      setDateTo('');
    } else if (preset === 'today') {
      setDateFrom(todayStr);
      setDateTo(todayStr);
    } else if (preset === 'month') {
      const now = new Date();
      const y = now.getFullYear();
      const m = String(now.getMonth() + 1).padStart(2, '0');
      setDateFrom(`${y}-${m}-01`);
      setDateTo(todayStr);
    }
  };

  // Filtered categories
  const filteredCategories = categories.filter((c) => {
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      if (!c.name.toLowerCase().includes(q)) return false;
    }
    const catDate = c.created_at ? c.created_at.split(' ')[0] : '';
    if (dateFrom && catDate < dateFrom) return false;
    if (dateTo && catDate > dateTo) return false;
    return true;
  });

  const isFiltering = Boolean(searchQuery.trim() || dateFrom || dateTo);

  return (
    <div className="flex flex-col h-full overflow-hidden bg-surface-50">
      <Header
        title="Category Management"
        subtitle="Organize your shop products into intuitive catalog groups & custom display order"
        actions={
          <button
            onClick={handleOpenAdd}
            className="btn-primary flex items-center gap-1.5 text-xs font-semibold"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Category</span>
          </button>
        }
      />

      <div className="p-6 overflow-y-auto flex-1 w-full space-y-4">
        {/* Date Range & Search Filter Bar */}
        <div className="card p-3 bg-white flex items-center justify-between gap-3 flex-wrap">
          {/* Search Input */}
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-4 h-4 text-surface-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search category name..."
              className="form-input pl-9 text-xs h-9"
            />
          </div>

          {/* From - To Date Range Filter (Future Dates Blocked via max={todayStr}) */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1.5 bg-surface-50 px-3 py-1 rounded-lg border border-surface-200 h-9">
              <Calendar className="w-3.5 h-3.5 text-primary-600 flex-shrink-0" />
              <div className="flex items-center gap-1 text-xs">
                <span className="text-surface-500 font-medium">From:</span>
                <input
                  type="date"
                  value={dateFrom}
                  max={todayStr}
                  onChange={(e) => {
                    const newFrom = e.target.value;
                    setDateFrom(newFrom);
                    if (newFrom && dateTo && newFrom > dateTo) setDateTo(newFrom);
                  }}
                  className="bg-transparent border-0 text-xs font-mono font-semibold text-surface-800 p-0 focus:ring-0 cursor-pointer"
                  title="Filter categories created from this date (up to today)"
                />
              </div>

              <span className="text-surface-300 font-bold">→</span>

              <div className="flex items-center gap-1 text-xs">
                <span className="text-surface-500 font-medium">To:</span>
                <input
                  type="date"
                  value={dateTo}
                  min={dateFrom || undefined}
                  max={todayStr}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="bg-transparent border-0 text-xs font-mono font-semibold text-surface-800 p-0 focus:ring-0 cursor-pointer"
                  title="Filter categories created up to this date (up to today)"
                />
              </div>
            </div>

            {/* Quick Date Presets */}
            <div className="flex items-center gap-1 bg-surface-100 p-1 rounded-lg border border-surface-200 h-9">
              <button
                type="button"
                onClick={() => handleSetDatePreset('all')}
                className={`h-7 px-2.5 text-xs font-semibold rounded-md transition-all cursor-pointer ${
                  !dateFrom && !dateTo
                    ? 'bg-white text-primary-700 shadow-xs font-bold'
                    : 'text-surface-600 hover:text-surface-900'
                }`}
              >
                All
              </button>
              <button
                type="button"
                onClick={() => handleSetDatePreset('today')}
                className={`h-7 px-2.5 text-xs font-semibold rounded-md transition-all cursor-pointer ${
                  dateFrom === todayStr && dateTo === todayStr
                    ? 'bg-white text-primary-700 shadow-xs font-bold'
                    : 'text-surface-600 hover:text-surface-900'
                }`}
              >
                Today
              </button>
              <button
                type="button"
                onClick={() => handleSetDatePreset('month')}
                className={`h-7 px-2.5 text-xs font-semibold rounded-md transition-all cursor-pointer ${
                  dateFrom.endsWith('-01') && dateTo === todayStr
                    ? 'bg-white text-primary-700 shadow-xs font-bold'
                    : 'text-surface-600 hover:text-surface-900'
                }`}
              >
                This Month
              </button>
            </div>

            {/* Reset Button */}
            {isFiltering && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setDateFrom('');
                  setDateTo('');
                }}
                className="btn-secondary h-9 px-2.5 text-xs flex items-center gap-1 text-surface-600 hover:text-surface-900"
                title="Reset all filters"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Reset</span>
              </button>
            )}
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
              <strong>Tip:</strong> Drag the dots handle (<GripVertical className="w-3.5 h-3.5 inline text-surface-500" />) to move, or click the dots to select and click any row to place it. Position numbers update automatically (#1, #2...).
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
                  <th className="w-36">Created Date</th>
                  <th className="w-36 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={6} className="text-center py-8 text-surface-400">
                      <div className="spinner mx-auto mb-2" />
                      Loading categories...
                    </td>
                  </tr>
                ) : filteredCategories.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-8 text-surface-400">
                      {isFiltering
                        ? 'No categories match the selected date range or search filter.'
                        : 'No categories found. Click "Add Category" above to create one.'}
                    </td>
                  </tr>
                ) : (
                  filteredCategories.map((c) => {
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
                        {/* Order / Position Drag Handle + Badge */}
                        <td className="font-mono text-xs">
                          <div className="flex items-center justify-center gap-2.5">
                            {/* Drag Grip Handle with Pointer + Click-to-Move */}
                            <div
                              className={`p-1.5 rounded-lg transition-all flex items-center justify-center select-none ${
                                isPicked
                                  ? 'bg-primary-600 text-white shadow-sm ring-2 ring-primary-400'
                                  : isFiltering
                                  ? 'opacity-20 cursor-not-allowed'
                                  : 'cursor-grab active:cursor-grabbing text-surface-400 hover:text-primary-700 hover:bg-surface-200'
                              }`}
                              title={
                                isFiltering
                                  ? 'Reset search/date filter to drag & drop'
                                  : isPicked
                                  ? 'Selected for moving — click any row to place here, or click to cancel'
                                  : 'Drag dots to reorder OR click to pick up and place on another row'
                              }
                              onPointerDown={(e) => {
                                if (isFiltering || e.button !== 0) return;
                                e.preventDefault();
                                e.stopPropagation();

                                isPointerDraggingRef.current = false;
                                pointerStartPosRef.current = { x: e.clientX, y: e.clientY };
                                draggedCatIdRef.current = c.id;
                                setDraggedCatId(c.id);

                                const handlePointerMove = (moveEvt: PointerEvent) => {
                                  const dist = Math.hypot(
                                    moveEvt.clientX - pointerStartPosRef.current.x,
                                    moveEvt.clientY - pointerStartPosRef.current.y
                                  );
                                  if (dist > 4) {
                                    isPointerDraggingRef.current = true;
                                  }

                                  if (isPointerDraggingRef.current) {
                                    const elem = document.elementFromPoint(moveEvt.clientX, moveEvt.clientY);
                                    const row = elem?.closest('[data-category-id]');
                                    if (row) {
                                      const targetId = Number(row.getAttribute('data-category-id'));
                                      if (targetId && targetId !== draggedCatIdRef.current) {
                                        setDragOverCatId(targetId);
                                      }
                                    }
                                  }
                                };

                                const handlePointerUp = (upEvt: PointerEvent) => {
                                  window.removeEventListener('pointermove', handlePointerMove);
                                  window.removeEventListener('pointerup', handlePointerUp);

                                  const srcId = draggedCatIdRef.current;
                                  const wasDragging = isPointerDraggingRef.current;
                                  setDraggedCatId(null);
                                  setDragOverCatId(null);

                                  if (wasDragging && srcId !== null) {
                                    const elem = document.elementFromPoint(upEvt.clientX, upEvt.clientY);
                                    const row = elem?.closest('[data-category-id]');
                                    const targetId = row ? Number(row.getAttribute('data-category-id')) : null;
                                    if (targetId && targetId !== srcId) {
                                      handleDrop(srcId, targetId);
                                      return;
                                    }
                                  }

                                  // If user simply clicked without dragging, toggle Click-to-Move
                                  if (!wasDragging) {
                                    if (pickedCategory?.id === c.id) {
                                      setPickedCategory(null);
                                    } else {
                                      setPickedCategory(c);
                                      toast.success(`Selected "${c.name}". Click any row to place it there.`);
                                    }
                                  }
                                };

                                window.addEventListener('pointermove', handlePointerMove);
                                window.addEventListener('pointerup', handlePointerUp);
                              }}
                            >
                              <GripVertical className="w-4 h-4 pointer-events-none" />
                            </div>

                            {/* Sequential Order Number Badge */}
                            <span
                              className={`inline-flex items-center justify-center font-mono font-bold text-xs px-2.5 py-1 rounded-md border min-w-[42px] transition-colors ${
                                isPicked
                                  ? 'bg-primary-600 text-white border-primary-700 shadow-sm'
                                  : 'bg-surface-100 text-surface-900 border-surface-300 shadow-2xs'
                              }`}
                              title={`Display sequence order #${c.sort_order}`}
                            >
                              #{c.sort_order}
                            </span>
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

                        {/* Created Date */}
                        <td className="text-xs text-surface-600 font-mono font-medium">
                          {c.created_at ? c.created_at.split(' ')[0] : '—'}
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

          <div className="form-group">
            <label className="form-label">Display Sort Order</label>
            <input
              type="number"
              min="1"
              value={formSortOrder}
              onChange={(e) => setFormSortOrder(e.target.value)}
              className="form-input font-mono"
            />
            <p className="text-2xs text-surface-500 mt-1">
              Position number in the category list.
            </p>
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
