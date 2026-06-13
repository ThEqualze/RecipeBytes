import { useEffect, useState } from 'react';
import { Clock, Users, Lock, ChefHat, UserPlus } from 'lucide-react';
import { api } from '../lib/api';
import type { Recipe, Ingredient, Tag } from '../lib/database.types';
import { formatTime } from '../lib/format';

interface PublicRecipeViewProps {
  token: string;
  onSignUp: () => void;
}

export function PublicRecipeView({ token, onSignUp }: PublicRecipeViewProps) {
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [shareMessage, setShareMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const data = await api.get<{
          recipe: Recipe | null;
          ingredients: Ingredient[];
          tags: Tag[];
          message: string;
        }>(`/public/recipes/${token}`);
        if (!data || !data.recipe) {
          setNotFound(true);
          setLoading(false);
          return;
        }
        setShareMessage(data.message || '');
        setRecipe(data.recipe);
        setIngredients(data.ingredients ?? []);
        setTags(data.tags ?? []);
      } catch {
        setNotFound(true);
      }
      setLoading(false);
    }
    load();
  }, [token]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-50">
        <div className="animate-spin w-8 h-8 border-2 border-stone-300 border-t-stone-800 rounded-full" />
      </div>
    );
  }

  if (notFound || !recipe) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-stone-50 px-6">
        <ChefHat className="w-12 h-12 text-stone-300 mb-4" />
        <h1 className="font-display text-2xl font-bold text-stone-800 mb-2">Recipe not found</h1>
        <p className="text-stone-500 text-center max-w-sm">
          This recipe may have been removed or the link is invalid.
        </p>
      </div>
    );
  }

  const grouped = ingredients.reduce<Record<string, Ingredient[]>>((acc, ing) => {
    const key = ing.group_name || 'Ingredients';
    if (!acc[key]) acc[key] = [];
    acc[key].push(ing);
    return acc;
  }, {});

  const heroImage = recipe.cook_image_url || recipe.cover_image_url;

  return (
    <div className="min-h-screen bg-stone-50">
      {/* Hero */}
      <div className="relative">
        {heroImage ? (
          <div className="h-[320px] sm:h-[400px] w-full overflow-hidden">
            <img
              src={heroImage}
              alt={recipe.title}
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
          </div>
        ) : (
          <div className="h-[200px] bg-gradient-to-br from-stone-200 to-stone-300" />
        )}

        <div className={`absolute bottom-0 left-0 right-0 px-6 sm:px-10 pb-8 ${heroImage ? 'text-white' : 'text-stone-900'}`}>
          {shareMessage && (
            <p className={`text-[13px] mb-2 ${heroImage ? 'text-white/80' : 'text-stone-500'}`}>
              "{shareMessage}"
            </p>
          )}
          <h1 className="font-display text-3xl sm:text-4xl font-bold leading-tight">
            {recipe.title}
          </h1>
          {recipe.source_author && (
            <p className={`mt-1 text-[14px] ${heroImage ? 'text-white/70' : 'text-stone-500'}`}>
              by {recipe.source_author}
            </p>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-6 sm:px-10 py-8 sm:py-10">
        {/* Meta */}
        <div className="flex flex-wrap items-center gap-4 text-[14px] text-stone-600 mb-6">
          {recipe.total_time_minutes > 0 && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white rounded-lg border border-stone-200">
              <Clock className="w-4 h-4 text-stone-500" />
              {formatTime(recipe.total_time_minutes)}
            </span>
          )}
          {recipe.yield_amount > 0 && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white rounded-lg border border-stone-200">
              <Users className="w-4 h-4 text-stone-500" />
              {recipe.yield_amount} {recipe.yield_unit}
            </span>
          )}
        </div>

        {/* Tags */}
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-6">
            {tags.map((t) => (
              <span
                key={t.id}
                className="inline-flex items-center gap-1.5 text-[12px] px-2.5 py-1 rounded-full bg-white border border-stone-200 text-stone-600"
              >
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: t.color }} />
                {t.name}
              </span>
            ))}
          </div>
        )}

        {/* Description */}
        {recipe.description && (
          <p className="text-[15px] text-stone-700 leading-relaxed mb-8">{recipe.description}</p>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-8 lg:gap-10">
          {/* Ingredients - visible */}
          <div>
            <h2 className="font-display text-[18px] font-semibold text-stone-900 mb-4">
              Ingredients
            </h2>
            {Object.entries(grouped).map(([group, items]) => (
              <div key={group} className="mb-5">
                {group !== 'Ingredients' && (
                  <h3 className="text-[12px] font-semibold uppercase tracking-wider text-stone-400 mb-2">
                    {group}
                  </h3>
                )}
                <ul className="space-y-2">
                  {items.map((ing) => (
                    <li key={ing.id} className="flex items-start gap-2 text-[14px] text-stone-700">
                      <span className="w-1.5 h-1.5 rounded-full bg-stone-300 mt-2 shrink-0" />
                      <span>{ing.raw_text || [ing.quantity, ing.unit, ing.name, ing.prep_note].filter(Boolean).join(' ')}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          {/* Instructions - GATED */}
          <div className="relative">
            <h2 className="font-display text-[18px] font-semibold text-stone-900 mb-4">
              Instructions
            </h2>

            {/* Fake blurred instructions */}
            <div className="relative overflow-hidden rounded-xl">
              <div className="space-y-4 blur-[6px] select-none pointer-events-none" aria-hidden="true">
                {[1, 2, 3, 4, 5].map((n) => (
                  <div key={n} className="flex gap-3">
                    <span className="w-7 h-7 rounded-full bg-stone-100 flex items-center justify-center text-[13px] font-semibold text-stone-400 shrink-0">
                      {n}
                    </span>
                    <div className="flex-1 space-y-1.5 pt-1">
                      <div className="h-3 bg-stone-200 rounded w-full" />
                      <div className="h-3 bg-stone-200 rounded w-4/5" />
                      {n % 2 === 0 && <div className="h-3 bg-stone-200 rounded w-3/5" />}
                    </div>
                  </div>
                ))}
              </div>

              {/* Overlay CTA */}
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/80 backdrop-blur-sm rounded-xl">
                <div className="w-14 h-14 rounded-full bg-stone-900 flex items-center justify-center mb-4">
                  <Lock className="w-6 h-6 text-white" />
                </div>
                <h3 className="font-display text-[20px] font-bold text-stone-900 mb-2 text-center">
                  Sign up to see the full recipe
                </h3>
                <p className="text-[14px] text-stone-500 max-w-xs text-center mb-5 leading-relaxed">
                  Join free to unlock step-by-step instructions, save recipes to your library, and start cooking.
                </p>
                <button
                  onClick={onSignUp}
                  className="inline-flex items-center gap-2 px-6 py-3 bg-stone-900 hover:bg-stone-800 text-white font-medium text-[14px] rounded-xl transition-colors shadow-lg shadow-stone-900/20"
                >
                  <UserPlus className="w-4 h-4" />
                  Create free account
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom CTA */}
        <div className="mt-12 text-center border-t border-stone-200 pt-10">
          <p className="text-[14px] text-stone-500 mb-4">
            Want to cook this and hundreds more? Join our community.
          </p>
          <button
            onClick={onSignUp}
            className="inline-flex items-center gap-2 px-6 py-3 bg-stone-900 hover:bg-stone-800 text-white font-medium text-[14px] rounded-xl transition-colors"
          >
            <ChefHat className="w-4 h-4" />
            Get started for free
          </button>
        </div>
      </div>
    </div>
  );
}
