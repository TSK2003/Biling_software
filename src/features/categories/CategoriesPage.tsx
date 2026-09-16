import React, { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, Layers, Power } from 'lucide-react';
import { api } from '../../lib/ipc';
import { Modal } from '../../components/Modal';
import { ConfirmModal } from '../../components/ConfirmModal';
import { Header } from '../../components/Header';
import type { Category } from '../../types';
import toast from 'react-hot-toast';

export const CategoriesPage: React.FC = () => {
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);

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
      const list = await api.getCategories(false);
      setCategories(list);
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
        await api.createCategory(formName.trim(), parseInt(formSortOrder) || 0);
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
    try {
      await api.updateCategory(c.id, undefined, undefined, !c.is_active);
      toast.success(c.is_active ? 'Category deactivated' : 'Category activated');
      loadCategories();
    } catch (err: any) {
      toast.error(typeof err === 'string' ? err : 'Failed to toggle category');
    }
  };

  const handleConfirmDelete = async () => {
    if (!deletingCategory) return;
    setIsDeleting(true);
    try {
      await api.deleteCategory(deletingCategory.id);
      toast.success(`Category "${deletingCategory.name}" deleted successfully`);
      setDeletingCategory(null);
      loadCategories();
    } catch (err: any) {
      toast.error(typeof err === 'string' ? err : 'Failed to delete category');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden bg-surface-50">
      <Header
        title="Category Management"
        subtitle="Organize your shop products into intuitive catalog groups"
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
        <div className="card overflow-hidden w-full">
          <div className="table-container">
            <table className="table w-full">
              <thead>
                <tr>
                  <th className="w-24 text-center">Sort Order</th>
                  <th>Category Name</th>
                  <th className="w-32 text-center">Status</th>
                  <th className="w-48">Created Date</th>
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
                ) : categories.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center py-8 text-surface-400">
                      No categories found. Click "Add Category" above to create one.
                    </td>
                  </tr>
                ) : (
                  categories.map((c) => (
                    <tr key={c.id} className={!c.is_active ? 'opacity-60 bg-surface-50' : ''}>
                      <td className="font-mono text-xs text-surface-500 font-bold">
                        #{c.sort_order}
                      </td>
                      <td className="font-semibold text-surface-900 flex items-center gap-2">
                        <Layers className="w-4 h-4 text-primary-600" />
                        <span>{c.name}</span>
                      </td>
                      <td>
                        {c.is_active ? (
                          <span className="badge badge-success">Active</span>
                        ) : (
                          <span className="badge badge-danger">Inactive</span>
                        )}
                      </td>
                      <td className="text-2xs text-surface-500 font-mono">
                        {c.created_at.split(' ')[0]}
                      </td>
                      <td className="text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* 1. Edit Button */}
                          <button
                            onClick={() => handleOpenEdit(c)}
                            className="btn-secondary btn-sm flex items-center gap-1 text-2xs py-1 px-2 text-primary-700 hover:bg-primary-50"
                            title="Edit category"
                          >
                            <Edit2 className="w-3 h-3 text-primary-600" />
                            <span>Edit</span>
                          </button>

                          {/* 2. Activate / Deactivate Toggle Button */}
                          <button
                            onClick={() => handleToggleActive(c)}
                            className={`btn-sm flex items-center gap-1 text-2xs py-1 px-2 rounded border transition-colors ${
                              c.is_active
                                ? 'bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100'
                                : 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100'
                            }`}
                            title={c.is_active ? 'Deactivate this category' : 'Activate this category'}
                          >
                            <Power className="w-3 h-3" />
                            <span>{c.is_active ? 'Deactivate' : 'Activate'}</span>
                          </button>

                          {/* 3. Delete Button */}
                          <button
                            onClick={() => setDeletingCategory(c)}
                            className="btn-sm flex items-center gap-1 text-2xs py-1 px-2 rounded border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 transition-colors"
                            title="Delete category"
                          >
                            <Trash2 className="w-3 h-3 text-red-600" />
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
              placeholder="e.g. Category Name"
              className="form-input"
              required
              autoFocus
            />
          </div>

          <div className="form-group">
            <label className="form-label">Display Sort Order</label>
            <input
              type="number"
              min="0"
              value={formSortOrder}
              onChange={(e) => setFormSortOrder(e.target.value)}
              className="form-input font-mono"
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
