import { useState, useRef, useMemo } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  Plus,
  X,
  ShoppingBasket,
  GripVertical,
  Search,
  Coffee,
  Sun,
  Moon,
  Cookie,
} from 'lucide-react';
import type { Recipe, MealPlan, MealType } from '../lib/database.types';

const MEAL_TYPES: { key: MealType; label: string; icon: typeof Coffee; color: string }[] = [
  { key: 'breakfast', label: 'Breakfast', icon: Coffee, color: 'text-amber-600 bg-amber-50' },
  { key: 'lunch', label: 'Lunch', icon: Sun, color: 'text-sky-600 bg-sky-50' },
  { key: 'dinner', label: 'Dinner', icon: Moon, color: 'text-indigo-600 bg-indigo-50' },
  { key: 'snack', label: 'Snack', icon: Cookie, color: 'text-rose-600 bg-rose-50' },
];

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

interface MealPlannerViewProps {
  plans: MealPlan[];
  recipes: Recipe[];
  weekStart: Date;
  weekEnd: Date;
  onAddMeal: (recipeId: string, date: string, mealType: MealType) => Promise<void>;
  onRemoveMeal: (id: string) => Promise<void>;
  onMoveMeal: (id: string, date: string, mealType: MealType) => Promise<void>;
  onPrevWeek: () => void;
  onNextWeek: () => void;
  onThisWeek: () => void;
  onGenerateGrocery: (recipeIds: string[]) => Promise<void>;
  onSelectRecipe: (id: string) => void;
}

function getDaysOfWeek(weekStart: Date): Date[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    return d;
  });
}

function formatDateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function isToday(d: Date): boolean {
  const now = new Date();
  return d.toDateString() === now.toDateString();
}

export function MealPlannerView({
  plans,
  recipes,
  weekStart,
  weekEnd,
  onAddMeal,
  onRemoveMeal,
  onMoveMeal,
  onPrevWeek,
  onNextWeek,
  onThisWeek,
  onGenerateGrocery,
  onSelectRecipe,
}: MealPlannerViewProps) {
  const [addingSlot, setAddingSlot] = useState<{ date: string; mealType: MealType } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [generating, setGenerating] = useState(false);
  const [draggedPlan, setDraggedPlan] = useState<string | null>(null);

  const days = useMemo(() => getDaysOfWeek(weekStart), [weekStart]);
  const recipeMap = useMemo(() => {
    const m = new Map<string, Recipe>();
    recipes.forEach((r) => m.set(r.id, r));
    return m;
  }, [recipes]);

  const weekLabel = useMemo(() => {
    const startMonth = MONTH_NAMES[weekStart.getMonth()];
    const endMonth = MONTH_NAMES[weekEnd.getMonth()];
    if (startMonth === endMonth) {
      return `${startMonth} ${weekStart.getDate()} - ${weekEnd.getDate()}, ${weekStart.getFullYear()}`;
    }
    return `${startMonth} ${weekStart.getDate()} - ${endMonth} ${weekEnd.getDate()}, ${weekEnd.getFullYear()}`;
  }, [weekStart, weekEnd]);

  const uniqueRecipeIds = useMemo(
    () => [...new Set(plans.map((p) => p.recipe_id))],
    [plans]
  );

  const filteredRecipes = useMemo(() => {
    if (!searchQuery.trim()) return recipes.slice(0, 20);
    const q = searchQuery.toLowerCase();
    return recipes.filter(
      (r) =>
        r.title.toLowerCase().includes(q) ||
        r.source_author.toLowerCase().includes(q)
    ).slice(0, 20);
  }, [recipes, searchQuery]);

  const handleGenerateGrocery = async () => {
    if (uniqueRecipeIds.length === 0) return;
    setGenerating(true);
    await onGenerateGrocery(uniqueRecipeIds);
    setGenerating(false);
  };

  const handleDragStart = (planId: string) => {
    setDraggedPlan(planId);
  };

  const handleDrop = (date: string, mealType: MealType) => {
    if (draggedPlan) {
      onMoveMeal(draggedPlan, date, mealType);
      setDraggedPlan(null);
    }
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="shrink-0 border-b border-stone-200 bg-white px-6 py-5">
        <div className="flex items-center justify-between mb-1">
          <div>
            <h1 className="font-display text-[22px] font-semibold text-stone-900">
              Meal Planner
            </h1>
            <p className="text-[13px] text-stone-500 mt-0.5">
              Plan your week and auto-generate a grocery list.
            </p>
          </div>
          <button
            onClick={handleGenerateGrocery}
            disabled={uniqueRecipeIds.length === 0 || generating}
            className="flex items-center gap-2 px-4 py-2 text-[13px] font-medium bg-stone-900 text-white rounded-lg hover:bg-stone-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <ShoppingBasket className="w-4 h-4" />
            {generating ? 'Adding...' : 'Add to grocery list'}
          </button>
        </div>

        {/* Week navigation */}
        <div className="flex items-center gap-3 mt-4">
          <button
            onClick={onPrevWeek}
            className="w-8 h-8 rounded-md border border-stone-200 flex items-center justify-center hover:bg-stone-50 transition-colors"
          >
            <ChevronLeft className="w-4 h-4 text-stone-600" />
          </button>
          <button
            onClick={onThisWeek}
            className="px-3 py-1.5 text-[12px] font-medium text-stone-600 border border-stone-200 rounded-md hover:bg-stone-50 transition-colors"
          >
            Today
          </button>
          <button
            onClick={onNextWeek}
            className="w-8 h-8 rounded-md border border-stone-200 flex items-center justify-center hover:bg-stone-50 transition-colors"
          >
            <ChevronRight className="w-4 h-4 text-stone-600" />
          </button>
          <div className="flex items-center gap-2 ml-2">
            <CalendarDays className="w-4 h-4 text-stone-400" />
            <span className="text-[14px] font-medium text-stone-800">{weekLabel}</span>
          </div>
        </div>
      </div>

      {/* Calendar grid */}
      <div className="flex-1 overflow-auto">
        <div className="grid grid-cols-7 min-w-[900px]">
          {/* Day headers */}
          {days.map((day) => {
            const today = isToday(day);
            return (
              <div
                key={formatDateKey(day)}
                className={`sticky top-0 z-10 border-b border-r border-stone-200 px-3 py-2.5 text-center ${
                  today ? 'bg-stone-900' : 'bg-stone-50'
                }`}
              >
                <div className={`text-[11px] font-medium uppercase tracking-wide ${
                  today ? 'text-stone-300' : 'text-stone-500'
                }`}>
                  {DAY_NAMES[day.getDay()]}
                </div>
                <div className={`text-[16px] font-semibold mt-0.5 ${
                  today ? 'text-white' : 'text-stone-800'
                }`}>
                  {day.getDate()}
                </div>
              </div>
            );
          })}

          {/* Meal slots per day */}
          {days.map((day) => {
            const dateKey = formatDateKey(day);
            const today = isToday(day);
            return (
              <div
                key={`slots-${dateKey}`}
                className={`border-r border-b border-stone-200 min-h-[420px] p-1.5 space-y-1 ${
                  today ? 'bg-stone-50/80' : 'bg-white'
                }`}
              >
                {MEAL_TYPES.map((meal) => {
                  const slotPlans = plans.filter(
                    (p) => p.planned_date === dateKey && p.meal_type === meal.key
                  );
                  return (
                    <MealSlot
                      key={meal.key}
                      meal={meal}
                      plans={slotPlans}
                      recipeMap={recipeMap}
                      dateKey={dateKey}
                      onAdd={() => setAddingSlot({ date: dateKey, mealType: meal.key })}
                      onRemove={onRemoveMeal}
                      onDragStart={handleDragStart}
                      onDrop={handleDrop}
                      onSelectRecipe={onSelectRecipe}
                    />
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      {/* Add recipe modal */}
      {addingSlot && (
        <RecipePickerModal
          recipes={filteredRecipes}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onSelect={async (recipeId) => {
            await onAddMeal(recipeId, addingSlot.date, addingSlot.mealType);
            setAddingSlot(null);
            setSearchQuery('');
          }}
          onClose={() => {
            setAddingSlot(null);
            setSearchQuery('');
          }}
          slotLabel={`${MEAL_TYPES.find((m) => m.key === addingSlot.mealType)?.label} - ${new Date(addingSlot.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}`}
        />
      )}
    </div>
  );
}

function MealSlot({
  meal,
  plans,
  recipeMap,
  dateKey,
  onAdd,
  onRemove,
  onDragStart,
  onDrop,
  onSelectRecipe,
}: {
  meal: (typeof MEAL_TYPES)[number];
  plans: MealPlan[];
  recipeMap: Map<string, Recipe>;
  dateKey: string;
  onAdd: () => void;
  onRemove: (id: string) => Promise<void>;
  onDragStart: (planId: string) => void;
  onDrop: (date: string, mealType: MealType) => void;
  onSelectRecipe: (id: string) => void;
}) {
  const [dragOver, setDragOver] = useState(false);
  const Icon = meal.icon;

  return (
    <div
      className={`rounded-md border transition-colors ${
        dragOver ? 'border-stone-400 bg-stone-100' : 'border-stone-100 bg-stone-50/50'
      }`}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        onDrop(dateKey, meal.key);
      }}
    >
      <div className="flex items-center justify-between px-2 py-1">
        <div className="flex items-center gap-1">
          <Icon className={`w-3 h-3 ${meal.color.split(' ')[0]}`} />
          <span className="text-[10px] font-medium text-stone-500 uppercase tracking-wide">
            {meal.label}
          </span>
        </div>
        <button
          onClick={onAdd}
          className="w-4 h-4 rounded flex items-center justify-center hover:bg-stone-200 transition-colors"
        >
          <Plus className="w-3 h-3 text-stone-400" />
        </button>
      </div>

      {plans.length > 0 && (
        <div className="px-1.5 pb-1.5 space-y-1">
          {plans.map((plan) => {
            const recipe = recipeMap.get(plan.recipe_id);
            if (!recipe) return null;
            return (
              <div
                key={plan.id}
                draggable
                onDragStart={() => onDragStart(plan.id)}
                className="group flex items-start gap-1 bg-white rounded-md px-1.5 py-1 border border-stone-150 shadow-sm cursor-grab active:cursor-grabbing hover:shadow-md transition-shadow"
              >
                <GripVertical className="w-3 h-3 text-stone-300 mt-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                {recipe.cover_image_url ? (
                  <img
                    src={recipe.cover_image_url}
                    alt=""
                    className="w-6 h-6 rounded object-cover shrink-0"
                  />
                ) : (
                  <div className={`w-6 h-6 rounded shrink-0 flex items-center justify-center ${meal.color}`}>
                    <Icon className="w-3 h-3" />
                  </div>
                )}
                <button
                  onClick={() => onSelectRecipe(recipe.id)}
                  className="flex-1 min-w-0 text-left"
                >
                  <span className="text-[11px] font-medium text-stone-700 line-clamp-2 leading-tight">
                    {recipe.title}
                  </span>
                </button>
                <button
                  onClick={() => onRemove(plan.id)}
                  className="w-4 h-4 shrink-0 rounded flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-stone-100 transition-all"
                >
                  <X className="w-3 h-3 text-stone-400" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function RecipePickerModal({
  recipes,
  searchQuery,
  onSearchChange,
  onSelect,
  onClose,
  slotLabel,
}: {
  recipes: Recipe[];
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onSelect: (recipeId: string) => void;
  onClose: () => void;
  slotLabel: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 animate-fade-in">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 max-h-[70vh] flex flex-col animate-scale-in">
        <div className="flex items-center justify-between px-5 py-4 border-b border-stone-200">
          <div>
            <h3 className="text-[15px] font-semibold text-stone-900">Add recipe</h3>
            <p className="text-[12px] text-stone-500 mt-0.5">{slotLabel}</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-md flex items-center justify-center hover:bg-stone-100 transition-colors"
          >
            <X className="w-4 h-4 text-stone-500" />
          </button>
        </div>

        <div className="px-4 py-3 border-b border-stone-100">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
            <input
              ref={inputRef}
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search recipes..."
              autoFocus
              className="w-full pl-9 pr-3 py-2 text-[13px] border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-stone-900/5 focus:border-stone-300"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-2 py-2">
          {recipes.length === 0 ? (
            <div className="text-center py-8 text-[13px] text-stone-500">
              No recipes found.
            </div>
          ) : (
            <div className="space-y-0.5">
              {recipes.map((recipe) => (
                <button
                  key={recipe.id}
                  onClick={() => onSelect(recipe.id)}
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
                      <CalendarDays className="w-4 h-4 text-stone-400" />
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
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
