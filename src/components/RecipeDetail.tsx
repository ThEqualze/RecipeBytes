import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Heart,
  Clock,
  Users,
  ExternalLink,
  Minus,
  Plus,
  Timer,
  Ruler,
  Pencil,
  ChefHat,
  Camera,
  ShoppingBasket,
  Check,
  Printer,
  Copy,
  Trash2,
  CalendarCheck,
  CopyPlus,
  Share2,
  Link2,
  MessageCircle,
} from 'lucide-react';
import type { Recipe, Ingredient, Instruction, Tag } from '../lib/database.types';
import { ShareCookDialog } from './ShareCookDialog';
import { sourceIcon, sourceLabel, sourceColor, formatTime, formatQuantity } from '../lib/format';

interface RecipeDetailProps {
  recipe: Recipe;
  ingredients: Ingredient[];
  instructions: Instruction[];
  tags: Tag[];
  onBack: () => void;
  onToggleFavorite: () => void;
  onEnterKitchen: () => void;
  onEdit: () => void;
  onMarkCooked: () => void;
  onDuplicate: () => Promise<void>;
  onShare: () => Promise<string | null>;
  onDelete: () => Promise<void>;
  onAddToGrocery: () => Promise<void>;
  onUpdated: () => void;
}

export function RecipeDetail({
  recipe,
  ingredients,
  instructions,
  tags,
  onBack,
  onToggleFavorite,
  onEnterKitchen,
  onEdit,
  onMarkCooked,
  onDuplicate,
  onShare,
  onDelete,
  onAddToGrocery,
  onUpdated,
}: RecipeDetailProps) {
  const [scale, setScale] = useState(1);
  const [unitSystem, setUnitSystem] = useState<'imperial' | 'metric'>('imperial');
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [groceryAdded, setGroceryAdded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [cookedJust, setCookedJust] = useState(false);
  const [shared, setShared] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [cookShareOpen, setCookShareOpen] = useState(false);
  const shareRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!shareOpen) return;
    const handler = (e: MouseEvent) => {
      if (shareRef.current && !shareRef.current.contains(e.target as Node)) {
        setShareOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [shareOpen]);
  const SourceIcon = sourceIcon[recipe.source_type];

  const handleCopyRecipe = async () => {
    const lines: string[] = [recipe.title, ''];
    if (recipe.description) lines.push(recipe.description, '');
    if (recipe.total_time_minutes) lines.push(`Total time: ${formatTime(recipe.total_time_minutes)}`);
    if (recipe.yield_amount) lines.push(`Servings: ${recipe.yield_amount}`);
    lines.push('', 'INGREDIENTS', '');
    ingredients.forEach((ing) => {
      const qty = ing.quantity ? formatQuantity(ing.quantity * scale) : '';
      const unit = ing.unit || '';
      const prep = ing.prep_note ? `, ${ing.prep_note}` : '';
      lines.push(`- ${qty} ${unit} ${ing.name}${prep}`.trim());
    });
    lines.push('', 'INSTRUCTIONS', '');
    instructions.forEach((step, i) => {
      lines.push(`${i + 1}. ${step.content}`);
    });
    if (recipe.source_url) lines.push('', `Source: ${recipe.source_url}`);
    await navigator.clipboard.writeText(lines.join('\n'));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const heroImage = recipe.cook_image_url || recipe.cover_image_url;

  const scaledYield = useMemo(
    () => +(recipe.yield_amount * scale).toFixed(2),
    [recipe.yield_amount, scale]
  );

  const toggleChecked = (id: string) =>
    setChecked((p) => ({ ...p, [id]: !p[id] }));

  return (
    <div className="flex flex-col h-full overflow-y-auto scrollbar-thin animate-fade-in">
      <div className="relative">
        <div className="h-48 sm:h-72 lg:h-80 overflow-hidden bg-stone-100">
          {heroImage ? (
            <img src={heroImage} alt={recipe.title} className="w-full h-full object-cover" />
          ) : null}
          <div className="absolute inset-0 bg-gradient-to-b from-black/0 via-black/0 to-black/30" />
        </div>

        <div className="absolute top-4 left-4 right-4 flex items-center justify-between">
          <button
            onClick={onBack}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-white/90 backdrop-blur text-[13px] font-medium text-stone-700 hover:bg-white transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={onToggleFavorite}
              className="w-9 h-9 rounded-md bg-white/90 backdrop-blur flex items-center justify-center hover:bg-white transition-colors"
            >
              <Heart
                className={`w-4 h-4 ${
                  recipe.is_favorite ? 'fill-accent-600 text-accent-600' : 'text-stone-600'
                }`}
              />
            </button>
            <button
              onClick={handleCopyRecipe}
              title="Copy recipe to clipboard"
              className="w-9 h-9 rounded-md bg-white/90 backdrop-blur flex items-center justify-center hover:bg-white transition-colors"
            >
              {copied ? (
                <Check className="w-4 h-4 text-emerald-600" />
              ) : (
                <Copy className="w-4 h-4 text-stone-600" />
              )}
            </button>
            <button
              onClick={() => window.print()}
              title="Print recipe"
              className="w-9 h-9 rounded-md bg-white/90 backdrop-blur flex items-center justify-center hover:bg-white transition-colors"
            >
              <Printer className="w-4 h-4 text-stone-600" />
            </button>
            <div className="relative" ref={shareRef}>
              <button
                onClick={() => setShareOpen(!shareOpen)}
                title="Share recipe"
                className="w-9 h-9 rounded-md bg-white/90 backdrop-blur flex items-center justify-center hover:bg-white transition-colors"
              >
                {shared ? (
                  <Check className="w-4 h-4 text-emerald-600" />
                ) : (
                  <Share2 className="w-4 h-4 text-stone-600" />
                )}
              </button>
              {shareOpen && (
                <div className="absolute right-0 top-11 z-50 w-52 bg-white rounded-xl shadow-xl border border-stone-200 py-1.5 animate-in fade-in slide-in-from-top-2 duration-150">
                  {typeof navigator !== 'undefined' && typeof navigator.share === 'function' && (
                    <button
                      onClick={async () => {
                        setShareOpen(false);
                        const url = await onShare();
                        if (!url) return;
                        try {
                          await navigator.share({
                            title: recipe.title,
                            text: `Check out this recipe: ${recipe.title}`,
                            url,
                          });
                          setShared(true);
                          setTimeout(() => setShared(false), 2500);
                        } catch {
                          /* share sheet dismissed/cancelled — ignore */
                        }
                      }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-left text-[14px] text-stone-700 hover:bg-stone-50 transition-colors"
                    >
                      <Share2 className="w-4 h-4 text-stone-500" />
                      Share…
                    </button>
                  )}
                  <button
                    onClick={async () => {
                      const url = await onShare();
                      if (url) {
                        await navigator.clipboard.writeText(url);
                      }
                      setShareOpen(false);
                      setShared(true);
                      setTimeout(() => setShared(false), 2500);
                    }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-left text-[14px] text-stone-700 hover:bg-stone-50 transition-colors"
                  >
                    <Link2 className="w-4 h-4 text-stone-500" />
                    Copy link
                  </button>
                  <button
                    onClick={async () => {
                      const url = await onShare();
                      if (url) {
                        const text = `Check out this recipe: ${recipe.title} ${url}`;
                        window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
                      }
                      setShareOpen(false);
                      setShared(true);
                      setTimeout(() => setShared(false), 2500);
                    }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-left text-[14px] text-stone-700 hover:bg-stone-50 transition-colors"
                  >
                    <MessageCircle className="w-4 h-4 text-green-600" />
                    Share via WhatsApp
                  </button>
                </div>
              )}
            </div>
            <button
              onClick={() => setCookShareOpen(true)}
              title="Share your cook"
              className="w-9 h-9 rounded-md bg-white/90 backdrop-blur flex items-center justify-center hover:bg-white transition-colors"
            >
              <Camera className="w-4 h-4 text-stone-600" />
            </button>
            <button
              onClick={onEdit}
              className="w-9 h-9 rounded-md bg-white/90 backdrop-blur flex items-center justify-center hover:bg-white transition-colors"
            >
              <Pencil className="w-4 h-4 text-stone-600" />
            </button>
            <button
              onClick={onDuplicate}
              title="Duplicate recipe"
              className="w-9 h-9 rounded-md bg-white/90 backdrop-blur flex items-center justify-center hover:bg-white transition-colors"
            >
              <CopyPlus className="w-4 h-4 text-stone-600" />
            </button>
            <button
              onClick={() => setConfirmDelete(true)}
              title="Delete recipe"
              className="w-9 h-9 rounded-md bg-white/90 backdrop-blur flex items-center justify-center hover:bg-red-50 transition-colors"
            >
              <Trash2 className="w-4 h-4 text-stone-600 hover:text-red-600" />
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-4xl w-full mx-auto px-4 sm:px-8 lg:px-12 -mt-10 sm:-mt-14 relative z-10">
        <div className="bg-white rounded-2xl border border-stone-200 shadow-[0_8px_40px_-20px_rgba(28,25,23,0.18)] p-5 sm:p-8 lg:p-10">
          <div className="flex items-center gap-2 mb-3">
            <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-medium ${sourceColor[recipe.source_type]}`}>
              <SourceIcon className="w-3 h-3" strokeWidth={2.25} />
              {sourceLabel[recipe.source_type]}
            </span>
            {recipe.source_author && (
              <span className="text-[12px] text-stone-500">by {recipe.source_author}</span>
            )}
            {recipe.source_url && (
              <a
                href={recipe.source_url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-0.5 text-[12px] text-stone-500 hover:text-stone-800"
              >
                Source <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>

          <h1 className="font-display text-[28px] sm:text-[40px] lg:text-[44px] font-semibold text-stone-900 leading-[1.1] tracking-tight mb-4">
            {recipe.title}
          </h1>

          {recipe.description && (
            <p className="text-[15px] text-stone-600 leading-relaxed max-w-2xl mb-6">
              {recipe.description}
            </p>
          )}

          {tags.length > 0 && (
            <div className="flex items-center flex-wrap gap-1.5 mb-6">
              {tags.map((t) => (
                <span
                  key={t.id}
                  className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-stone-100 text-[12px] text-stone-700"
                >
                  <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: t.color }} />
                  {t.name}
                </span>
              ))}
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-stone-200 rounded-xl overflow-hidden border border-stone-200">
            <Stat label="Prep" value={formatTime(recipe.prep_time_minutes)} />
            <Stat label="Cook" value={formatTime(recipe.cook_time_minutes)} />
            <Stat label="Total" value={formatTime(recipe.total_time_minutes)} icon={<Clock className="w-3.5 h-3.5" />} />
            <Stat
              label="Yield"
              value={`${scaledYield} ${recipe.yield_unit}`}
              icon={<Users className="w-3.5 h-3.5" />}
            />
          </div>

          <button
            onClick={onEnterKitchen}
            className="mt-6 w-full inline-flex items-center justify-center gap-2 px-4 py-3 bg-stone-900 hover:bg-stone-800 text-white font-medium text-[14px] rounded-xl transition-colors"
          >
            <ChefHat className="w-4 h-4" />
            Start cooking mode
          </button>

          <button
            onClick={async () => {
              await onAddToGrocery();
              setGroceryAdded(true);
              setTimeout(() => setGroceryAdded(false), 2500);
            }}
            disabled={groceryAdded || ingredients.length === 0}
            className={`mt-2 w-full inline-flex items-center justify-center gap-2 px-4 py-3 font-medium text-[14px] rounded-xl transition-colors ${
              groceryAdded
                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                : 'bg-stone-100 hover:bg-stone-200 text-stone-700 border border-stone-200'
            }`}
          >
            {groceryAdded ? (
              <>
                <Check className="w-4 h-4" />
                Added to grocery list
              </>
            ) : (
              <>
                <ShoppingBasket className="w-4 h-4" />
                Add ingredients to grocery list
              </>
            )}
          </button>

          <button
            onClick={() => {
              onMarkCooked();
              setCookedJust(true);
              setTimeout(() => setCookedJust(false), 2500);
            }}
            disabled={cookedJust}
            className={`mt-2 w-full inline-flex items-center justify-center gap-2 px-4 py-3 font-medium text-[14px] rounded-xl transition-colors ${
              cookedJust
                ? 'bg-amber-50 text-amber-700 border border-amber-200'
                : 'bg-stone-100 hover:bg-stone-200 text-stone-700 border border-stone-200'
            }`}
          >
            {cookedJust ? (
              <>
                <Check className="w-4 h-4" />
                Marked as cooked today
              </>
            ) : (
              <>
                <CalendarCheck className="w-4 h-4" />
                I made this
              </>
            )}
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-8 lg:gap-10 mt-8 sm:mt-10 pb-16">
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-display text-[20px] font-semibold text-stone-900">
                Ingredients
              </h2>
              <span className="text-[12px] text-stone-500">{ingredients.length} items</span>
            </div>

            <div className="bg-stone-50 border border-stone-200 rounded-xl p-3 mb-4 space-y-3">
              <div>
                <div className="text-[11px] uppercase tracking-wider font-semibold text-stone-500 mb-1.5">
                  Scale
                </div>
                <div className="flex items-center justify-between bg-white rounded-md border border-stone-200">
                  <button
                    onClick={() => setScale((s) => Math.max(0.25, +(s - 0.25).toFixed(2)))}
                    className="w-9 h-9 flex items-center justify-center text-stone-500 hover:text-stone-900"
                  >
                    <Minus className="w-3.5 h-3.5" />
                  </button>
                  <span className="font-display text-[15px] font-semibold text-stone-900 tabular-nums">
                    {scale}×
                  </span>
                  <button
                    onClick={() => setScale((s) => +(s + 0.25).toFixed(2))}
                    className="w-9 h-9 flex items-center justify-center text-stone-500 hover:text-stone-900"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              <div>
                <div className="text-[11px] uppercase tracking-wider font-semibold text-stone-500 mb-1.5 inline-flex items-center gap-1">
                  <Ruler className="w-3 h-3" /> Units
                </div>
                <div className="grid grid-cols-2 bg-white rounded-md border border-stone-200 p-0.5">
                  <button
                    onClick={() => setUnitSystem('imperial')}
                    className={`text-[12px] py-1.5 rounded-[5px] transition-colors ${
                      unitSystem === 'imperial'
                        ? 'bg-stone-900 text-white'
                        : 'text-stone-600 hover:text-stone-900'
                    }`}
                  >
                    Imperial
                  </button>
                  <button
                    onClick={() => setUnitSystem('metric')}
                    className={`text-[12px] py-1.5 rounded-[5px] transition-colors ${
                      unitSystem === 'metric'
                        ? 'bg-stone-900 text-white'
                        : 'text-stone-600 hover:text-stone-900'
                    }`}
                  >
                    Metric
                  </button>
                </div>
              </div>
            </div>

            <ul className="space-y-1">
              {ingredients.map((ing) => (
                <li
                  key={ing.id}
                  onClick={() => toggleChecked(ing.id)}
                  className={`flex items-start gap-3 px-2 py-2 rounded-md cursor-pointer hover:bg-stone-50 transition-colors ${
                    checked[ing.id] ? 'opacity-50' : ''
                  }`}
                >
                  <span
                    className={`mt-1 w-4 h-4 rounded border-[1.5px] flex items-center justify-center transition-colors shrink-0 ${
                      checked[ing.id]
                        ? 'bg-stone-900 border-stone-900'
                        : 'border-stone-300'
                    }`}
                  >
                    {checked[ing.id] && (
                      <svg viewBox="0 0 12 12" className="w-2.5 h-2.5 text-white">
                        <path d="M2 6l3 3 5-6" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </span>
                  <div className="text-[14px] leading-relaxed text-stone-800">
                    {ing.quantity != null && (
                      <span className="font-medium tabular-nums">
                        {formatQuantity(+(ing.quantity * scale).toFixed(3))}
                        {ing.unit && ` ${ing.unit}`}
                      </span>
                    )}
                    {ing.quantity != null && ing.name && ' '}
                    <span className={checked[ing.id] ? 'line-through' : ''}>{ing.name}</span>
                    {ing.prep_note && (
                      <span className="text-stone-500">, {ing.prep_note}</span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-display text-[20px] font-semibold text-stone-900">
                Instructions
              </h2>
              <span className="text-[12px] text-stone-500">{instructions.length} steps</span>
            </div>

            <ol className="space-y-5">
              {instructions.map((step) => (
                <li key={step.id} className="flex gap-4 group">
                  <div className="shrink-0">
                    <div className="font-display text-[18px] font-semibold text-stone-300 tabular-nums w-8">
                      {String(step.step_number).padStart(2, '0')}
                    </div>
                  </div>
                  <div className="flex-1 pb-5 border-b border-stone-100 last:border-b-0">
                    <p className="text-[15px] leading-[1.65] text-stone-800">{step.content}</p>
                    {step.timer_seconds && (
                      <button className="mt-2 inline-flex items-center gap-1.5 text-[12px] font-medium text-accent-700 bg-accent-50 hover:bg-accent-100 transition-colors px-2 py-1 rounded-md">
                        <Timer className="w-3 h-3" />
                        Start {Math.round(step.timer_seconds / 60)}-min timer
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ol>

            {recipe.notes && (
              <div className="mt-8 p-5 rounded-xl bg-amber-50 border border-amber-100">
                <div className="text-[11px] uppercase tracking-wider font-semibold text-amber-800 mb-1.5">
                  My notes
                </div>
                <p className="text-[14px] text-amber-900 leading-relaxed">{recipe.notes}</p>
              </div>
            )}
          </section>
        </div>
      </div>

      {cookShareOpen && (
        <ShareCookDialog
          recipe={{
            id: recipe.id,
            title: recipe.title,
            description: recipe.description,
            cover_image_url: recipe.cover_image_url,
            cook_image_url: recipe.cook_image_url,
          }}
          onClose={() => setCookShareOpen(false)}
          onUpdated={onUpdated}
        />
      )}

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full mx-4 p-6">
            <h3 className="font-display text-[18px] font-semibold text-stone-900 mb-2">
              Delete recipe?
            </h3>
            <p className="text-[14px] text-stone-500 leading-relaxed mb-6">
              "{recipe.title}" will be permanently deleted. This cannot be undone.
            </p>
            <div className="flex items-center gap-3 justify-end">
              <button
                onClick={() => setConfirmDelete(false)}
                className="px-4 py-2 text-[13px] font-medium text-stone-700 hover:bg-stone-100 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  setConfirmDelete(false);
                  await onDelete();
                }}
                className="px-4 py-2 text-[13px] font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="bg-white px-4 py-3">
      <div className="text-[11px] uppercase tracking-wider font-semibold text-stone-400 mb-0.5 inline-flex items-center gap-1">
        {icon} {label}
      </div>
      <div className="font-display text-[18px] font-semibold text-stone-900 tabular-nums">
        {value}
      </div>
    </div>
  );
}
