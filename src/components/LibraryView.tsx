import { useMemo, useRef, useState, useEffect } from 'react';
import { LayoutGrid, List, Plus, ArrowDownUp, Check } from 'lucide-react';
import type { Recipe, Tag } from '../lib/database.types';
import { RecipeCard, RecipeListRow } from './RecipeCard';

export type SortKey = 'recent' | 'a-z' | 'z-a' | 'cook-time' | 'created';

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'recent', label: 'Recently updated' },
  { key: 'created', label: 'Newest first' },
  { key: 'a-z', label: 'A to Z' },
  { key: 'z-a', label: 'Z to A' },
  { key: 'cook-time', label: 'Cook time' },
];

interface LibraryViewProps {
  title: string;
  subtitle?: string;
  recipes: Recipe[];
  recipeTagIds: Record<string, string[]>;
  tags: Tag[];
  view: 'grid' | 'list';
  onViewChange: (v: 'grid' | 'list') => void;
  onSelectRecipe: (id: string) => void;
  onToggleFavorite: (id: string) => void;
  onNewRecipe: () => void;
  onTagClick?: (tagId: string) => void;
}

export function LibraryView({
  title,
  subtitle,
  recipes,
  recipeTagIds,
  tags,
  view,
  onViewChange,
  onSelectRecipe,
  onToggleFavorite,
  onNewRecipe,
  onTagClick,
}: LibraryViewProps) {
  const [sortKey, setSortKey] = useState<SortKey>('recent');
  const [sortOpen, setSortOpen] = useState(false);
  const sortRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (sortRef.current && !sortRef.current.contains(e.target as Node)) {
        setSortOpen(false);
      }
    }
    if (sortOpen) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [sortOpen]);

  const tagMap = useMemo(() => {
    const m = new Map<string, Tag>();
    tags.forEach((t) => m.set(t.id, t));
    return m;
  }, [tags]);

  const tagsForRecipe = (id: string): Tag[] =>
    (recipeTagIds[id] ?? []).map((tid) => tagMap.get(tid)).filter((t): t is Tag => !!t);

  const sorted = useMemo(() => {
    const copy = [...recipes];
    switch (sortKey) {
      case 'recent':
        return copy.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
      case 'created':
        return copy.sort((a, b) => b.created_at.localeCompare(a.created_at));
      case 'a-z':
        return copy.sort((a, b) => a.title.localeCompare(b.title));
      case 'z-a':
        return copy.sort((a, b) => b.title.localeCompare(a.title));
      case 'cook-time':
        return copy.sort(
          (a, b) => (a.total_time_min ?? 9999) - (b.total_time_min ?? 9999)
        );
      default:
        return copy;
    }
  }, [recipes, sortKey]);

  return (
    <div className="flex flex-col h-full animate-fade-in">
      <div className="px-4 sm:px-6 md:px-10 pt-6 md:pt-10 pb-4 md:pb-6 border-b border-stone-100">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-[26px] sm:text-[34px] font-semibold text-stone-900 leading-none">
              {title}
            </h1>
            {subtitle && (
              <p className="text-[13px] sm:text-[14px] text-stone-500 mt-2 max-w-xl leading-relaxed">
                {subtitle}
              </p>
            )}
            <div className="text-[13px] text-stone-500 mt-2 sm:mt-3">
              <span className="tabular-nums font-medium text-stone-700">{sorted.length}</span>{' '}
              {sorted.length === 1 ? 'recipe' : 'recipes'}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative" ref={sortRef}>
              <button
                onClick={() => setSortOpen(!sortOpen)}
                className={`inline-flex items-center gap-1.5 text-[13px] px-2.5 py-1.5 rounded-md transition-colors ${
                  sortOpen
                    ? 'bg-stone-200 text-stone-900'
                    : 'text-stone-600 hover:text-stone-900 hover:bg-stone-100'
                }`}
              >
                <ArrowDownUp className="w-3.5 h-3.5" />
                Sort
              </button>

              {sortOpen && (
                <div className="absolute right-0 top-full mt-1 w-48 bg-white border border-stone-200 rounded-lg shadow-lg py-1 z-30 animate-fade-in">
                  {SORT_OPTIONS.map((opt) => (
                    <button
                      key={opt.key}
                      onClick={() => {
                        setSortKey(opt.key);
                        setSortOpen(false);
                      }}
                      className={`w-full flex items-center justify-between px-3 py-2 text-[13px] transition-colors ${
                        sortKey === opt.key
                          ? 'text-stone-900 bg-stone-50 font-medium'
                          : 'text-stone-600 hover:bg-stone-50'
                      }`}
                    >
                      {opt.label}
                      {sortKey === opt.key && <Check className="w-3.5 h-3.5 text-stone-900" />}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="hidden sm:inline-flex items-center bg-stone-100 rounded-lg p-0.5">
              <button
                onClick={() => onViewChange('grid')}
                className={`p-1.5 rounded-md transition-colors ${
                  view === 'grid' ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-500'
                }`}
                aria-label="Grid view"
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
              <button
                onClick={() => onViewChange('list')}
                className={`p-1.5 rounded-md transition-colors ${
                  view === 'list' ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-500'
                }`}
                aria-label="List view"
              >
                <List className="w-4 h-4" />
              </button>
            </div>

            <button
              onClick={onNewRecipe}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-stone-900 hover:bg-stone-800 text-white text-[13px] font-medium rounded-lg transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">New recipe</span>
              <span className="sm:hidden">New</span>
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {sorted.length === 0 ? (
          <EmptyState />
        ) : view === 'grid' ? (
          <div className="px-4 sm:px-6 md:px-10 py-6 md:py-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-4 sm:gap-5">
            {sorted.map((r) => (
              <RecipeCard
                key={r.id}
                recipe={r}
                tags={tagsForRecipe(r.id)}
                onClick={() => onSelectRecipe(r.id)}
                onToggleFavorite={() => onToggleFavorite(r.id)}
                onTagClick={onTagClick}
              />
            ))}
          </div>
        ) : (
          <div className="px-4 sm:px-7 py-4 max-w-6xl mx-auto">
            <div className="hidden sm:grid grid-cols-[64px_1fr_140px_120px_120px_40px] gap-4 px-3 py-2 text-[11px] uppercase tracking-wider font-semibold text-stone-400 border-b border-stone-100">
              <div></div>
              <div>Recipe</div>
              <div>Source</div>
              <div>Time</div>
              <div>Yield</div>
              <div></div>
            </div>
            <div className="py-1">
              {sorted.map((r) => (
                <RecipeListRow
                  key={r.id}
                  recipe={r}
                  tags={tagsForRecipe(r.id)}
                  onClick={() => onSelectRecipe(r.id)}
                  onToggleFavorite={() => onToggleFavorite(r.id)}
                  onTagClick={onTagClick}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center px-6 py-24">
      <div className="w-14 h-14 rounded-full bg-stone-100 flex items-center justify-center mb-4">
        <Plus className="w-6 h-6 text-stone-400" />
      </div>
      <h3 className="font-display text-[20px] font-semibold text-stone-800 mb-1">
        Nothing here yet
      </h3>
      <p className="text-[14px] text-stone-500 max-w-sm leading-relaxed">
        Add a recipe manually, paste a link from the web, or share a TikTok or
        Instagram reel to get started.
      </p>
    </div>
  );
}
