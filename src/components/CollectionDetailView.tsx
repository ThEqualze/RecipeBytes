import { useState, useMemo } from 'react';
import {
  ArrowLeft,
  Plus,
  Globe,
  Lock,
  Link,
  Pencil,
  Search,
  X,
  Clock,
  Trash2,
  Check,
} from 'lucide-react';
import type { Collection, CollectionRecipe, Recipe } from '../lib/database.types';

interface CollectionDetailViewProps {
  collection: Collection;
  collectionRecipes: CollectionRecipe[];
  recipes: Recipe[];
  onBack: () => void;
  onAddRecipe: (recipeId: string) => Promise<void>;
  onRemoveRecipe: (recipeId: string) => Promise<void>;
  onUpdate: (updates: { title?: string; description?: string; is_public?: boolean; cover_image_url?: string }) => Promise<void>;
  onSelectRecipe: (id: string) => void;
}

export function CollectionDetailView({
  collection,
  collectionRecipes,
  recipes,
  onBack,
  onAddRecipe,
  onRemoveRecipe,
  onUpdate,
  onSelectRecipe,
}: CollectionDetailViewProps) {
  const [adding, setAdding] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(collection.title);
  const [editDescription, setEditDescription] = useState(collection.description);
  const [copied, setCopied] = useState(false);

  const recipeIdsInCollection = useMemo(
    () => new Set(collectionRecipes.map((cr) => cr.recipe_id)),
    [collectionRecipes]
  );

  const collectionRecipesList = useMemo(() => {
    return collectionRecipes
      .map((cr) => recipes.find((r) => r.id === cr.recipe_id))
      .filter(Boolean) as Recipe[];
  }, [collectionRecipes, recipes]);

  const availableRecipes = useMemo(() => {
    let list = recipes.filter((r) => !recipeIdsInCollection.has(r.id) && r.status === 'active');
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (r) =>
          r.title.toLowerCase().includes(q) ||
          r.source_author.toLowerCase().includes(q)
      );
    }
    return list.slice(0, 20);
  }, [recipes, recipeIdsInCollection, searchQuery]);

  const handleSaveEdit = async () => {
    await onUpdate({ title: editTitle.trim(), description: editDescription.trim() });
    setEditing(false);
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(`${window.location.origin}/c/${collection.share_token}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="shrink-0 border-b border-stone-200 bg-white px-6 py-5">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-[13px] text-stone-500 hover:text-stone-700 transition-colors mb-3"
        >
          <ArrowLeft className="w-4 h-4" />
          Collections
        </button>

        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            {editing ? (
              <div className="space-y-3">
                <input
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  autoFocus
                  className="w-full text-[20px] font-semibold px-2 py-1 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-stone-900/5"
                />
                <textarea
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  placeholder="Description..."
                  rows={2}
                  className="w-full text-[13px] px-2 py-1 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-stone-900/5 resize-none"
                />
                <div className="flex gap-2">
                  <button
                    onClick={handleSaveEdit}
                    className="px-3 py-1.5 text-[12px] font-medium bg-stone-900 text-white rounded-md hover:bg-stone-800 transition-colors"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => { setEditing(false); setEditTitle(collection.title); setEditDescription(collection.description); }}
                    className="px-3 py-1.5 text-[12px] font-medium text-stone-600 hover:bg-stone-100 rounded-md transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <>
                <h1 className="font-display text-[22px] font-semibold text-stone-900">
                  {collection.title}
                </h1>
                {collection.description && (
                  <p className="text-[13px] text-stone-500 mt-0.5">{collection.description}</p>
                )}
              </>
            )}
          </div>

          {!editing && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setEditing(true)}
                className="w-8 h-8 rounded-md flex items-center justify-center border border-stone-200 hover:bg-stone-50 transition-colors"
              >
                <Pencil className="w-3.5 h-3.5 text-stone-600" />
              </button>

              <button
                onClick={() => onUpdate({ is_public: !collection.is_public })}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium rounded-md border transition-colors ${
                  collection.is_public
                    ? 'text-emerald-700 bg-emerald-50 border-emerald-200 hover:bg-emerald-100'
                    : 'text-stone-600 bg-white border-stone-200 hover:bg-stone-50'
                }`}
              >
                {collection.is_public ? <Globe className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
                {collection.is_public ? 'Public' : 'Private'}
              </button>

              {collection.is_public && (
                <button
                  onClick={handleCopyLink}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium text-stone-600 bg-white border border-stone-200 rounded-md hover:bg-stone-50 transition-colors"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Link className="w-3.5 h-3.5" />}
                  {copied ? 'Copied!' : 'Share'}
                </button>
              )}

              <button
                onClick={() => setAdding(true)}
                className="flex items-center gap-2 px-4 py-2 text-[13px] font-medium bg-stone-900 text-white rounded-lg hover:bg-stone-800 transition-colors"
              >
                <Plus className="w-4 h-4" />
                Add recipes
              </button>
            </div>
          )}
        </div>

        <div className="mt-3 text-[12px] text-stone-500">
          {collectionRecipes.length} {collectionRecipes.length === 1 ? 'recipe' : 'recipes'}
        </div>
      </div>

      {/* Recipe grid */}
      <div className="flex-1 overflow-y-auto p-6">
        {collectionRecipesList.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-14 h-14 rounded-xl bg-stone-100 flex items-center justify-center mb-4">
              <Plus className="w-6 h-6 text-stone-400" />
            </div>
            <h3 className="text-[14px] font-medium text-stone-700 mb-1">
              Start adding recipes
            </h3>
            <p className="text-[13px] text-stone-500 max-w-xs mb-4">
              Build your collection by adding recipes from your library.
            </p>
            <button
              onClick={() => setAdding(true)}
              className="flex items-center gap-2 px-4 py-2 text-[13px] font-medium bg-stone-900 text-white rounded-lg hover:bg-stone-800 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add recipes
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {collectionRecipesList.map((recipe) => (
              <CollectionRecipeCard
                key={recipe.id}
                recipe={recipe}
                onSelect={() => onSelectRecipe(recipe.id)}
                onRemove={() => onRemoveRecipe(recipe.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Add recipes modal */}
      {adding && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 animate-fade-in">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 max-h-[70vh] flex flex-col animate-scale-in">
            <div className="flex items-center justify-between px-5 py-4 border-b border-stone-200">
              <h3 className="text-[15px] font-semibold text-stone-900">
                Add recipes to "{collection.title}"
              </h3>
              <button
                onClick={() => { setAdding(false); setSearchQuery(''); }}
                className="w-8 h-8 rounded-md flex items-center justify-center hover:bg-stone-100 transition-colors"
              >
                <X className="w-4 h-4 text-stone-500" />
              </button>
            </div>

            <div className="px-4 py-3 border-b border-stone-100">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
                <input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search your recipes..."
                  autoFocus
                  className="w-full pl-9 pr-3 py-2 text-[13px] border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-stone-900/5 focus:border-stone-300"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-2 py-2">
              {availableRecipes.length === 0 ? (
                <div className="text-center py-8 text-[13px] text-stone-500">
                  {searchQuery ? 'No matching recipes.' : 'All recipes are already in this collection.'}
                </div>
              ) : (
                <div className="space-y-0.5">
                  {availableRecipes.map((recipe) => (
                    <button
                      key={recipe.id}
                      onClick={async () => { await onAddRecipe(recipe.id); }}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-stone-50 transition-colors text-left"
                    >
                      {recipe.cover_image_url ? (
                        <img
                          src={recipe.cover_image_url}
                          alt=""
                          className="w-10 h-10 rounded-lg object-cover shrink-0"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-lg bg-stone-100 flex items-center justify-center shrink-0">
                          <Clock className="w-4 h-4 text-stone-400" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="text-[13px] font-medium text-stone-800 truncate">
                          {recipe.title}
                        </div>
                        {recipe.total_time_minutes > 0 && (
                          <div className="text-[11px] text-stone-500 mt-0.5">
                            {recipe.total_time_minutes} min
                          </div>
                        )}
                      </div>
                      <Plus className="w-4 h-4 text-stone-400 shrink-0" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CollectionRecipeCard({
  recipe,
  onSelect,
  onRemove,
}: {
  recipe: Recipe;
  onSelect: () => void;
  onRemove: () => void;
}) {
  return (
    <div
      className="group relative bg-white border border-stone-200 rounded-xl overflow-hidden hover:shadow-md hover:border-stone-300 transition-all cursor-pointer"
      onClick={onSelect}
    >
      {recipe.cover_image_url ? (
        <div className="h-36 overflow-hidden">
          <img
            src={recipe.cover_image_url}
            alt=""
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        </div>
      ) : (
        <div className="h-36 bg-gradient-to-br from-stone-100 to-stone-50 flex items-center justify-center">
          <Clock className="w-6 h-6 text-stone-300" />
        </div>
      )}

      <div className="p-3">
        <h4 className="text-[13px] font-medium text-stone-800 line-clamp-2 leading-snug">
          {recipe.title}
        </h4>
        {recipe.total_time_minutes > 0 && (
          <div className="flex items-center gap-1 mt-1.5 text-[11px] text-stone-500">
            <Clock className="w-3 h-3" />
            {recipe.total_time_minutes} min
          </div>
        )}
      </div>

      <button
        onClick={(e) => { e.stopPropagation(); onRemove(); }}
        className="absolute top-2 right-2 w-7 h-7 rounded-md bg-white/90 backdrop-blur border border-stone-200 flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-red-50 hover:border-red-200 transition-all"
      >
        <Trash2 className="w-3.5 h-3.5 text-stone-500 group-hover:text-red-500" />
      </button>
    </div>
  );
}
