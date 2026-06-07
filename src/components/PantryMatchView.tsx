import { useState, useCallback } from 'react';
import {
  Search,
  Plus,
  X,
  Clock,
  ChefHat,
  Sparkles,
  ArrowRight,
  Percent,
  Refrigerator,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { Recipe } from '../lib/database.types';

interface PantryMatchViewProps {
  recipes: Recipe[];
  onSelectRecipe: (id: string) => void;
}

interface MatchResult {
  recipe: Recipe;
  matched: string[];
  missing: string[];
  coverage: number;
}

export function PantryMatchView({ recipes, onSelectRecipe }: PantryMatchViewProps) {
  const [pantryItems, setPantryItems] = useState<string[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [results, setResults] = useState<MatchResult[] | null>(null);
  const [loading, setLoading] = useState(false);

  const addItem = () => {
    const val = inputValue.trim().toLowerCase();
    if (!val || pantryItems.includes(val)) return;
    setPantryItems((prev) => [...prev, val]);
    setInputValue('');
  };

  const removeItem = (item: string) => {
    setPantryItems((prev) => prev.filter((i) => i !== item));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addItem();
    }
  };

  const findMatches = useCallback(async () => {
    if (pantryItems.length === 0) return;
    setLoading(true);

    const activeRecipes = recipes.filter((r) => r.status === 'active');
    const recipeIds = activeRecipes.map((r) => r.id);

    const { data: allIngredients } = await supabase
      .from('ingredients')
      .select('recipe_id, name')
      .in('recipe_id', recipeIds);

    if (!allIngredients || allIngredients.length === 0) {
      setResults([]);
      setLoading(false);
      return;
    }

    const recipeIngMap = new Map<string, string[]>();
    allIngredients.forEach((ing) => {
      const list = recipeIngMap.get(ing.recipe_id) ?? [];
      list.push(ing.name.toLowerCase());
      recipeIngMap.set(ing.recipe_id, list);
    });

    const scored: MatchResult[] = [];

    recipeIngMap.forEach((ingredientNames, recipeId) => {
      const recipe = activeRecipes.find((r) => r.id === recipeId);
      if (!recipe || ingredientNames.length === 0) return;

      const matched: string[] = [];
      const missing: string[] = [];

      ingredientNames.forEach((ingName) => {
        const isMatched = pantryItems.some(
          (pantryItem) =>
            ingName.includes(pantryItem) || pantryItem.includes(ingName)
        );
        if (isMatched) {
          matched.push(ingName);
        } else {
          missing.push(ingName);
        }
      });

      const coverage = matched.length / ingredientNames.length;

      if (matched.length > 0) {
        scored.push({ recipe, matched, missing, coverage });
      }
    });

    scored.sort((a, b) => b.coverage - a.coverage);
    setResults(scored.slice(0, 3));
    setLoading(false);
  }, [pantryItems, recipes]);

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="shrink-0 border-b border-stone-200 bg-white px-6 py-5">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-9 h-9 rounded-lg bg-emerald-50 flex items-center justify-center">
            <Refrigerator className="w-5 h-5 text-emerald-600" />
          </div>
          <div>
            <h1 className="font-display text-[22px] font-semibold text-stone-900">
              What can I make?
            </h1>
            <p className="text-[13px] text-stone-500 mt-0.5">
              Enter ingredients you have and discover recipes you can cook right now.
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-6 py-8">
          {/* Ingredient input area */}
          <div className="mb-8">
            <label className="block text-[13px] font-medium text-stone-700 mb-2">
              What's in your kitchen?
            </label>
            <div className="flex gap-2">
              <div className="flex-1 relative">
                <input
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Type an ingredient (e.g. chicken, garlic, rice...)"
                  className="w-full px-4 py-2.5 text-[14px] border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400 transition-colors"
                />
              </div>
              <button
                onClick={addItem}
                disabled={!inputValue.trim()}
                className="px-4 py-2.5 bg-stone-900 text-white text-[13px] font-medium rounded-lg hover:bg-stone-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>

            {/* Ingredient chips */}
            {pantryItems.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-3">
                {pantryItems.map((item) => (
                  <span
                    key={item}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 text-emerald-800 text-[13px] font-medium rounded-full border border-emerald-200"
                  >
                    {item}
                    <button
                      onClick={() => removeItem(item)}
                      className="w-4 h-4 rounded-full flex items-center justify-center hover:bg-emerald-200 transition-colors"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}

            {/* Find recipes button */}
            <button
              onClick={findMatches}
              disabled={pantryItems.length === 0 || loading}
              className="mt-4 flex items-center gap-2 px-5 py-2.5 bg-emerald-600 text-white text-[14px] font-medium rounded-lg hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-sm"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Searching...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  Find recipes I can make
                </>
              )}
            </button>
          </div>

          {/* Results */}
          {results !== null && (
            <div>
              <div className="flex items-center gap-2 mb-4">
                <h2 className="text-[16px] font-semibold text-stone-800">
                  {results.length > 0 ? 'Top matches from your recipes' : 'No matches found'}
                </h2>
              </div>

              {results.length === 0 ? (
                <div className="text-center py-12 bg-stone-50 rounded-xl border border-stone-200">
                  <ChefHat className="w-10 h-10 text-stone-300 mx-auto mb-3" />
                  <p className="text-[14px] text-stone-600 font-medium">
                    No recipes match your ingredients
                  </p>
                  <p className="text-[13px] text-stone-500 mt-1">
                    Try adding more ingredients or check your recipe library.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {results.map((result, idx) => (
                    <MatchCard
                      key={result.recipe.id}
                      result={result}
                      rank={idx + 1}
                      onSelect={() => onSelectRecipe(result.recipe.id)}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Initial state */}
          {results === null && pantryItems.length === 0 && (
            <div className="text-center py-12">
              <div className="w-16 h-16 rounded-2xl bg-stone-100 flex items-center justify-center mx-auto mb-4">
                <Search className="w-7 h-7 text-stone-400" />
              </div>
              <p className="text-[14px] text-stone-600 font-medium">
                Add ingredients to get started
              </p>
              <p className="text-[13px] text-stone-500 mt-1 max-w-sm mx-auto">
                We'll search your recipe library and find the best matches based on what you have available.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function MatchCard({
  result,
  rank,
  onSelect,
}: {
  result: MatchResult;
  rank: number;
  onSelect: () => void;
}) {
  const coveragePercent = Math.round(result.coverage * 100);

  return (
    <div
      onClick={onSelect}
      className="group flex gap-4 p-4 bg-white border border-stone-200 rounded-xl hover:shadow-lg hover:border-stone-300 transition-all cursor-pointer"
    >
      {/* Rank badge */}
      <div className="shrink-0 flex flex-col items-center gap-2">
        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[13px] font-bold ${
          rank === 1
            ? 'bg-amber-100 text-amber-700'
            : rank === 2
            ? 'bg-stone-100 text-stone-600'
            : 'bg-stone-50 text-stone-500'
        }`}>
          {rank}
        </div>
      </div>

      {/* Cover image */}
      {result.recipe.cover_image_url ? (
        <div className="shrink-0 w-20 h-20 rounded-lg overflow-hidden">
          <img
            src={result.recipe.cover_image_url}
            alt=""
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        </div>
      ) : (
        <div className="shrink-0 w-20 h-20 rounded-lg bg-stone-100 flex items-center justify-center">
          <ChefHat className="w-6 h-6 text-stone-300" />
        </div>
      )}

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-[15px] font-semibold text-stone-800 truncate group-hover:text-stone-900">
              {result.recipe.title}
            </h3>
            {result.recipe.total_time_minutes > 0 && (
              <div className="flex items-center gap-1 mt-0.5 text-[12px] text-stone-500">
                <Clock className="w-3 h-3" />
                {result.recipe.total_time_minutes} min
              </div>
            )}
          </div>

          {/* Coverage badge */}
          <div className={`shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-full text-[12px] font-semibold ${
            coveragePercent >= 80
              ? 'bg-emerald-50 text-emerald-700'
              : coveragePercent >= 50
              ? 'bg-amber-50 text-amber-700'
              : 'bg-stone-100 text-stone-600'
          }`}>
            <Percent className="w-3 h-3" />
            {coveragePercent}
          </div>
        </div>

        {/* Matched ingredients */}
        <div className="mt-2">
          <div className="flex flex-wrap gap-1">
            {result.matched.slice(0, 5).map((ing) => (
              <span
                key={ing}
                className="inline-block px-2 py-0.5 text-[11px] font-medium bg-emerald-50 text-emerald-700 rounded"
              >
                {ing}
              </span>
            ))}
            {result.matched.length > 5 && (
              <span className="inline-block px-2 py-0.5 text-[11px] text-stone-500">
                +{result.matched.length - 5} more
              </span>
            )}
          </div>
        </div>

        {/* Missing ingredients */}
        {result.missing.length > 0 && (
          <div className="mt-1.5">
            <span className="text-[11px] text-stone-500">
              Missing: {result.missing.slice(0, 3).join(', ')}
              {result.missing.length > 3 && ` +${result.missing.length - 3} more`}
            </span>
          </div>
        )}
      </div>

      <ArrowRight className="w-4 h-4 text-stone-300 shrink-0 self-center opacity-0 group-hover:opacity-100 transition-opacity" />
    </div>
  );
}
