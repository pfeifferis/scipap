import React, { useState } from 'react';
import { 
  X, 
  Layers, 
  Plus, 
  Trash2, 
  Edit2, 
  Check, 
  AlertCircle,
  ToggleLeft,
  ToggleRight
} from 'lucide-react';
import { SchemaField } from '../types';
import { api } from '../api';

interface SchemaModalProps {
  isOpen: boolean;
  onClose: () => void;
  fields: SchemaField[];
  onSchemaUpdated: () => void;
}

export const SchemaModal: React.FC<SchemaModalProps> = ({
  isOpen,
  onClose,
  fields,
  onSchemaUpdated,
}) => {
  const [newLabel, setNewLabel] = useState('');
  const [newKey, setNewKey] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editLabel, setEditLabel] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleLabelChange = (val: string) => {
    setNewLabel(val);
    // Auto-generate key if empty or pristine
    const slug = val
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/(^_|_$)/g, '');
    setNewKey(slug);
  };

  const handleAddField = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLabel || !newKey) {
      setError('Label and Key are required.');
      return;
    }
    setError(null);
    setIsAdding(true);

    try {
      await api.createSchemaField({
        label: newLabel.trim(),
        key: newKey.trim(),
        description: newDesc.trim(),
        is_active: true,
      });
      setNewLabel('');
      setNewKey('');
      setNewDesc('');
      onSchemaUpdated();
    } catch (err: any) {
      setError(err.message || 'Failed to create field.');
    } finally {
      setIsAdding(false);
    }
  };

  const handleDeleteField = async (id: number) => {
    if (confirm('Are you sure you want to delete this field?')) {
      try {
        await api.deleteSchemaField(id);
        onSchemaUpdated();
      } catch (err: any) {
        setError(err.message || 'Failed to delete field.');
      }
    }
  };

  const handleToggleActive = async (field: SchemaField) => {
    try {
      await api.updateSchemaField(field.id, { is_active: !field.is_active });
      onSchemaUpdated();
    } catch (err: any) {
      setError(err.message || 'Failed to update field.');
    }
  };

  const startEdit = (f: SchemaField) => {
    setEditingId(f.id);
    setEditLabel(f.label);
    setEditDesc(f.description || '');
  };

  const saveEdit = async (id: number) => {
    try {
      await api.updateSchemaField(id, { label: editLabel, description: editDesc });
      setEditingId(null);
      onSchemaUpdated();
    } catch (err: any) {
      setError(err.message || 'Failed to update field.');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center">
              <Layers className="w-4 h-4 text-indigo-400" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-100">Configure Extraction Schema</h3>
              <p className="text-[11px] text-slate-400">Define the exact data points the LLM will extract</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Area */}
        <div className="p-6 space-y-6 overflow-y-auto flex-1">
          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Add New Field Form */}
          <form onSubmit={handleAddField} className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 space-y-3">
            <h4 className="text-xs font-semibold text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
              <Plus className="w-3.5 h-3.5 text-blue-400" />
              <span>Add Custom Field</span>
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] text-slate-400 block mb-1">Field Label *</label>
                <input
                  type="text"
                  placeholder="e.g. Funding Source"
                  value={newLabel}
                  onChange={(e) => handleLabelChange(e.target.value)}
                  className="w-full px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="text-[11px] text-slate-400 block mb-1">Field Key (JSON identifier) *</label>
                <input
                  type="text"
                  placeholder="funding_source"
                  value={newKey}
                  onChange={(e) => setNewKey(e.target.value)}
                  className="w-full px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-blue-500 font-mono"
                />
              </div>
            </div>

            <div>
              <label className="text-[11px] text-slate-400 block mb-1">Description / LLM Guidance</label>
              <input
                type="text"
                placeholder="e.g. Grant numbers, sponsoring institutions, or pharmaceutical sponsors"
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                className="w-full px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-blue-500"
              />
            </div>

            <div className="flex justify-end pt-1">
              <button
                type="submit"
                disabled={isAdding || !newLabel || !newKey}
                className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold disabled:opacity-40 flex items-center gap-1.5 shadow-sm"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add to Schema</span>
              </button>
            </div>
          </form>

          {/* Existing Fields List */}
          <div className="space-y-2">
            <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Active Fields ({fields.length})
            </h4>

            <div className="space-y-2">
              {fields.map((field) => {
                const isEditing = editingId === field.id;

                return (
                  <div
                    key={field.id}
                    className="p-3 bg-slate-950/40 border border-slate-800/80 rounded-xl flex items-center justify-between gap-3"
                  >
                    <div className="flex-1 min-w-0">
                      {isEditing ? (
                        <div className="space-y-2">
                          <input
                            type="text"
                            value={editLabel}
                            onChange={(e) => setEditLabel(e.target.value)}
                            className="w-full px-2 py-1 bg-slate-900 border border-blue-500 rounded text-xs text-white"
                          />
                          <input
                            type="text"
                            value={editDesc}
                            onChange={(e) => setEditDesc(e.target.value)}
                            className="w-full px-2 py-1 bg-slate-900 border border-slate-700 rounded text-xs text-slate-300"
                            placeholder="Description..."
                          />
                        </div>
                      ) : (
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`text-xs font-semibold ${field.is_active ? 'text-slate-200' : 'text-slate-500 line-through'}`}>
                              {field.label}
                            </span>
                            <span className="text-[10px] text-indigo-300 bg-indigo-500/10 border border-indigo-500/20 px-1.5 py-0.5 rounded">
                              {field.category || 'General'}
                            </span>
                            <code className="text-[10px] text-slate-500 bg-slate-800 px-1 py-0.2 rounded font-mono">
                              {field.key}
                            </code>
                          </div>
                          {field.description && (
                            <p className="text-[11px] text-slate-400 mt-1">
                              {field.description}
                            </p>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      {isEditing ? (
                        <>
                          <button
                            onClick={() => saveEdit(field.id)}
                            className="p-1 rounded text-emerald-400 hover:bg-slate-800"
                            title="Save"
                          >
                            <Check className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setEditingId(null)}
                            className="p-1 rounded text-slate-400 hover:bg-slate-800"
                            title="Cancel"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => handleToggleActive(field)}
                            className="p-1 rounded text-slate-400 hover:text-slate-200"
                            title={field.is_active ? 'Deactivate field' : 'Activate field'}
                          >
                            {field.is_active ? (
                              <ToggleRight className="w-5 h-5 text-emerald-400" />
                            ) : (
                              <ToggleLeft className="w-5 h-5 text-slate-600" />
                            )}
                          </button>
                          <button
                            onClick={() => startEdit(field)}
                            className="p-1 rounded text-slate-400 hover:text-blue-400"
                            title="Edit"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteField(field.id)}
                            className="p-1 rounded text-slate-400 hover:text-red-400"
                            title="Delete"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-800 bg-slate-900/50 flex justify-end shrink-0">
          <button
            onClick={onClose}
            className="px-5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-semibold"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
