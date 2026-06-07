import { useMemo, useState } from 'react';
import {
  ShoppingBasket,
  Carrot,
  Beef,
  Milk,
  Wheat,
  Snowflake,
  Cookie,
  Coffee,
  Package,
  Sparkles,
  Plus,
  Trash2,
} from 'lucide-react';
import type { GroceryListItem, Aisle } from '../lib/database.types';

interface GroceryViewProps {
  items: GroceryListItem[];
  onToggle: (id: string) => void;
  onRemove: (id: string) => void;
  onClearChecked: () => void;
  onAddItem: (name: string) => void;
}

const AISLE_META: Record<Aisle, { label: string; icon: typeof Carrot; tint: string }> = {
  produce: { label: 'Produce', icon: Carrot, tint: 'text-emerald-700 bg-emerald-50' },
  dairy: { label: 'Dairy', icon: Milk, tint: 'text-sky-700 bg-sky-50' },
  meat: { label: 'Meat & Seafood', icon: Beef, tint: 'text-rose-700 bg-rose-50' },
  pantry: { label: 'Pantry', icon: Package, tint: 'text-amber-700 bg-amber-50' },
  frozen: { label: 'Frozen', icon: Snowflake, tint: 'text-cyan-700 bg-cyan-50' },
  bakery: { label: 'Bakery', icon: Cookie, tint: 'text-orange-700 bg-orange-50' },
  spices: { label: 'Spices', icon: Sparkles, tint: 'text-yellow-700 bg-yellow-50' },
  beverages: { label: 'Beverages', icon: Coffee, tint: 'text-blue-700 bg-blue-50' },
  other: { label: 'Other', icon: Wheat, tint: 'text-stone-600 bg-stone-100' },
};

const AISLE_ORDER: Aisle[] = [
  'produce',
  'meat',
  'dairy',
  'bakery',
  'pantry',
  'spices',
  'frozen',
  'beverages',
  'other',
];

export function GroceryView({ items, onToggle, onRemove, onClearChecked, onAddItem }: GroceryViewProps) {
  const [groupBy, setGroupBy] = useState<'aisle' | 'recipe'>('aisle');
  const [newItemName, setNewItemName] = useState('');

  const grouped = useMemo(() => {
    const map: Record<string, GroceryListItem[]> = {};
    items.forEach((it) => {
      const key = groupBy === 'aisle' ? it.aisle : it.recipe_id ?? 'misc';
      if (!map[key]) map[key] = [];
      map[key].push(it);
    });
    return map;
  }, [items, groupBy]);

  const orderedKeys = useMemo(() => {
    if (groupBy === 'aisle') {
      return AISLE_ORDER.filter((a) => grouped[a]?.length);
    }
    return Object.keys(grouped);
  }, [grouped, groupBy]);

  const total = items.length;
  const checkedCount = items.filter((i) => i.is_checked).length;
  const progress = total === 0 ? 0 : checkedCount / total;

  return (
    <div className="flex flex-col h-full overflow-y-auto scrollbar-thin animate-fade-in">
      <div className="px-4 sm:px-6 md:px-10 pt-6 md:pt-10 pb-4 md:pb-6 border-b border-stone-100">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <ShoppingBasket className="w-4 h-4 text-stone-500" />
              <span className="text-[12px] uppercase tracking-wider font-semibold text-stone-500">
                Grocery
              </span>
            </div>
            <h1 className="font-display text-[26px] sm:text-[34px] font-semibold text-stone-900 leading-none">
              This week's list
            </h1>
            <div className="flex items-center gap-4 mt-3">
              <div className="text-[13px] text-stone-500">
                <span className="tabular-nums font-medium text-stone-700">
                  {checkedCount}
                </span>{' '}
                of <span className="tabular-nums font-medium">{total}</span> checked off
              </div>
              <div className="h-1 w-32 sm:w-40 bg-stone-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-500 transition-all duration-300"
                  style={{ width: `${progress * 100}%` }}
                />
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="inline-flex items-center bg-stone-100 rounded-lg p-0.5 text-[12px]">
              <button
                onClick={() => setGroupBy('aisle')}
                className={`px-3 py-1.5 rounded-md font-medium transition-colors ${
                  groupBy === 'aisle' ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-500'
                }`}
              >
                By aisle
              </button>
              <button
                onClick={() => setGroupBy('recipe')}
                className={`px-3 py-1.5 rounded-md font-medium transition-colors ${
                  groupBy === 'recipe' ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-500'
                }`}
              >
                By recipe
              </button>
            </div>
            <button className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-stone-900 hover:bg-stone-800 text-white text-[13px] font-medium rounded-lg transition-colors">
              <Plus className="w-3.5 h-3.5" />
              Add item
            </button>
            {checkedCount > 0 && (
              <button
                onClick={onClearChecked}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[13px] font-medium text-stone-600 hover:text-red-700 hover:bg-red-50 border border-stone-200 rounded-lg transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Clear checked
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 px-4 sm:px-6 md:px-10 py-6 md:py-8 max-w-3xl">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const trimmed = newItemName.trim();
            if (trimmed) {
              onAddItem(trimmed);
              setNewItemName('');
            }
          }}
          className="flex items-center gap-2 mb-6"
        >
          <input
            value={newItemName}
            onChange={(e) => setNewItemName(e.target.value)}
            placeholder="Add an item..."
            className="flex-1 px-4 py-2.5 border border-stone-200 rounded-xl text-[14px] text-stone-800 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-300 transition-shadow"
          />
          <button
            type="submit"
            disabled={!newItemName.trim()}
            className="px-4 py-2.5 bg-stone-900 hover:bg-stone-800 disabled:bg-stone-300 text-white text-[13px] font-medium rounded-xl transition-colors"
          >
            <Plus className="w-4 h-4" />
          </button>
        </form>

        <div className="space-y-8">
          {orderedKeys.length === 0 && (
            <div className="flex flex-col items-center justify-center text-center py-16">
              <div className="w-14 h-14 rounded-full bg-stone-100 flex items-center justify-center mb-4">
                <ShoppingBasket className="w-6 h-6 text-stone-400" />
              </div>
              <h3 className="font-display text-[18px] font-semibold text-stone-800 mb-1">
                Your list is empty
              </h3>
              <p className="text-[14px] text-stone-500 max-w-xs leading-relaxed">
                Add items above, or tap "Add ingredients to grocery list" from any recipe.
              </p>
            </div>
          )}
          {orderedKeys.map((key) => {
            const aisleMeta = groupBy === 'aisle' ? AISLE_META[key as Aisle] : null;
            const Icon = aisleMeta?.icon;
            return (
              <section key={key}>
                <div className="flex items-center gap-2 mb-3">
                  {Icon && (
                    <div className={`w-7 h-7 rounded-md flex items-center justify-center ${aisleMeta!.tint}`}>
                      <Icon className="w-4 h-4" />
                    </div>
                  )}
                  <h2 className="font-display text-[16px] font-semibold text-stone-800">
                    {aisleMeta?.label ?? 'From recipe'}
                  </h2>
                  <span className="text-[12px] text-stone-400 tabular-nums">
                    {grouped[key].length}
                  </span>
                </div>
                <ul className="bg-white border border-stone-200 rounded-xl divide-y divide-stone-100 overflow-hidden">
                  {grouped[key].map((item) => (
                    <li
                      key={item.id}
                      onClick={() => onToggle(item.id)}
                      className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-stone-50 transition-colors group"
                    >
                      <span
                        className={`w-4 h-4 rounded border-[1.5px] flex items-center justify-center transition-colors shrink-0 ${
                          item.is_checked
                            ? 'bg-stone-900 border-stone-900'
                            : 'border-stone-300 group-hover:border-stone-400'
                        }`}
                      >
                        {item.is_checked && (
                          <svg viewBox="0 0 12 12" className="w-2.5 h-2.5 text-white">
                            <path d="M2 6l3 3 5-6" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div
                          className={`text-[14px] text-stone-800 ${
                            item.is_checked ? 'line-through text-stone-400' : ''
                          }`}
                        >
                          {item.name}
                        </div>
                      </div>
                      {item.quantity != null && (
                        <div className="text-[13px] text-stone-500 tabular-nums">
                          {item.quantity} {item.unit}
                        </div>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onRemove(item.id);
                        }}
                        className="w-7 h-7 rounded-md text-stone-300 hover:text-red-600 hover:bg-red-50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
