import { useState } from 'react';
import {
  Plus,
  BookOpen,
  Globe,
  Lock,
  MoreHorizontal,
  Trash2,
  Pencil,
  Link,
  X,
} from 'lucide-react';
import type { Collection } from '../lib/database.types';

interface CollectionsViewProps {
  collections: Collection[];
  onCreateCollection: (title: string, description?: string) => Promise<string | null>;
  onSelectCollection: (id: string) => void;
  onDeleteCollection: (id: string) => Promise<void>;
  onUpdateCollection: (id: string, updates: { title?: string; description?: string; is_public?: boolean }) => Promise<void>;
}

export function CollectionsView({
  collections,
  onCreateCollection,
  onSelectCollection,
  onDeleteCollection,
  onUpdateCollection,
}: CollectionsViewProps) {
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [menuOpen, setMenuOpen] = useState<string | null>(null);

  const handleCreate = async () => {
    if (!newTitle.trim()) return;
    const id = await onCreateCollection(newTitle.trim(), newDescription.trim());
    setNewTitle('');
    setNewDescription('');
    setCreating(false);
    if (id) onSelectCollection(id);
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="shrink-0 border-b border-stone-200 bg-white px-6 py-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-display text-[22px] font-semibold text-stone-900">
              Collections
            </h1>
            <p className="text-[13px] text-stone-500 mt-0.5">
              Organize recipes into themed cookbooks you can share.
            </p>
          </div>
          <button
            onClick={() => setCreating(true)}
            className="flex items-center gap-2 px-4 py-2 text-[13px] font-medium bg-stone-900 text-white rounded-lg hover:bg-stone-800 transition-colors"
          >
            <Plus className="w-4 h-4" />
            New collection
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {collections.length === 0 && !creating ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-16 h-16 rounded-2xl bg-stone-100 flex items-center justify-center mb-4">
              <BookOpen className="w-7 h-7 text-stone-400" />
            </div>
            <h3 className="text-[15px] font-medium text-stone-700 mb-1">
              No collections yet
            </h3>
            <p className="text-[13px] text-stone-500 max-w-xs mb-5">
              Create a collection to organize recipes by theme, occasion, or whatever inspires you.
            </p>
            <button
              onClick={() => setCreating(true)}
              className="flex items-center gap-2 px-4 py-2 text-[13px] font-medium bg-stone-900 text-white rounded-lg hover:bg-stone-800 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Create your first collection
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {collections.map((collection) => (
              <CollectionCard
                key={collection.id}
                collection={collection}
                onSelect={() => onSelectCollection(collection.id)}
                onDelete={() => onDeleteCollection(collection.id)}
                onTogglePublic={() =>
                  onUpdateCollection(collection.id, { is_public: !collection.is_public })
                }
                menuOpen={menuOpen === collection.id}
                onMenuToggle={() => setMenuOpen(menuOpen === collection.id ? null : collection.id)}
                onMenuClose={() => setMenuOpen(null)}
              />
            ))}
          </div>
        )}
      </div>

      {creating && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 animate-fade-in">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 animate-scale-in">
            <div className="flex items-center justify-between px-5 py-4 border-b border-stone-200">
              <h3 className="text-[15px] font-semibold text-stone-900">New collection</h3>
              <button
                onClick={() => { setCreating(false); setNewTitle(''); setNewDescription(''); }}
                className="w-8 h-8 rounded-md flex items-center justify-center hover:bg-stone-100 transition-colors"
              >
                <X className="w-4 h-4 text-stone-500" />
              </button>
            </div>
            <div className="px-5 py-4 space-y-4">
              <div>
                <label className="block text-[12px] font-medium text-stone-600 mb-1.5">Title</label>
                <input
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="e.g. Weeknight Dinners"
                  autoFocus
                  onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); }}
                  className="w-full px-3 py-2 text-[13px] border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-stone-900/5 focus:border-stone-300"
                />
              </div>
              <div>
                <label className="block text-[12px] font-medium text-stone-600 mb-1.5">Description (optional)</label>
                <textarea
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  placeholder="A short description of this collection..."
                  rows={2}
                  className="w-full px-3 py-2 text-[13px] border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-stone-900/5 focus:border-stone-300 resize-none"
                />
              </div>
            </div>
            <div className="px-5 py-3 border-t border-stone-100 flex justify-end gap-2">
              <button
                onClick={() => { setCreating(false); setNewTitle(''); setNewDescription(''); }}
                className="px-4 py-2 text-[13px] font-medium text-stone-600 hover:bg-stone-100 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={!newTitle.trim()}
                className="px-4 py-2 text-[13px] font-medium bg-stone-900 text-white rounded-lg hover:bg-stone-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CollectionCard({
  collection,
  onSelect,
  onDelete,
  onTogglePublic,
  menuOpen,
  onMenuToggle,
  onMenuClose,
}: {
  collection: Collection;
  onSelect: () => void;
  onDelete: () => void;
  onTogglePublic: () => void;
  menuOpen: boolean;
  onMenuToggle: () => void;
  onMenuClose: () => void;
}) {
  return (
    <div
      className="group relative bg-white border border-stone-200 rounded-xl overflow-hidden hover:shadow-md hover:border-stone-300 transition-all cursor-pointer"
      onClick={onSelect}
    >
      {collection.cover_image_url ? (
        <div className="h-32 overflow-hidden">
          <img
            src={collection.cover_image_url}
            alt=""
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        </div>
      ) : (
        <div className="h-32 bg-gradient-to-br from-stone-100 to-stone-200 flex items-center justify-center">
          <BookOpen className="w-8 h-8 text-stone-400" />
        </div>
      )}

      <div className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <h3 className="text-[14px] font-semibold text-stone-800 truncate">
              {collection.title}
            </h3>
            {collection.description && (
              <p className="text-[12px] text-stone-500 mt-0.5 line-clamp-2">
                {collection.description}
              </p>
            )}
          </div>
          <div className="relative">
            <button
              onClick={(e) => { e.stopPropagation(); onMenuToggle(); }}
              className="w-7 h-7 rounded-md flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-stone-100 transition-all"
            >
              <MoreHorizontal className="w-4 h-4 text-stone-500" />
            </button>

            {menuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={(e) => { e.stopPropagation(); onMenuClose(); }} />
                <div className="absolute right-0 top-8 z-20 w-44 bg-white rounded-lg shadow-xl border border-stone-200 py-1 animate-scale-in">
                  <button
                    onClick={(e) => { e.stopPropagation(); onTogglePublic(); onMenuClose(); }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-[13px] text-stone-700 hover:bg-stone-50 transition-colors"
                  >
                    {collection.is_public ? <Lock className="w-3.5 h-3.5" /> : <Globe className="w-3.5 h-3.5" />}
                    {collection.is_public ? 'Make private' : 'Make public'}
                  </button>
                  {collection.is_public && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        navigator.clipboard.writeText(`${window.location.origin}/c/${collection.share_token}`);
                        onMenuClose();
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-[13px] text-stone-700 hover:bg-stone-50 transition-colors"
                    >
                      <Link className="w-3.5 h-3.5" />
                      Copy share link
                    </button>
                  )}
                  <button
                    onClick={(e) => { e.stopPropagation(); onDelete(); onMenuClose(); }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-[13px] text-red-600 hover:bg-red-50 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Delete
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 mt-3">
          {collection.is_public ? (
            <span className="flex items-center gap-1 text-[11px] font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
              <Globe className="w-3 h-3" />
              Public
            </span>
          ) : (
            <span className="flex items-center gap-1 text-[11px] font-medium text-stone-500 bg-stone-100 px-2 py-0.5 rounded-full">
              <Lock className="w-3 h-3" />
              Private
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
