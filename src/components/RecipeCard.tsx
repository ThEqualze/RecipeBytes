import { Heart, Clock, Users, MoreHorizontal } from 'lucide-react';
import type { Recipe, Tag } from '../lib/database.types';
import { sourceIcon, sourceLabel, sourceColor, formatTime } from '../lib/format';

interface RecipeCardProps {
  recipe: Recipe;
  tags: Tag[];
  onClick: () => void;
  onToggleFavorite: () => void;
  onTagClick?: (tagId: string) => void;
}

export function RecipeCard({ recipe, tags, onClick, onToggleFavorite, onTagClick }: RecipeCardProps) {
  const SourceIcon = sourceIcon[recipe.source_type];
  return (
    <button
      onClick={onClick}
      className="group text-left bg-white border border-stone-200 rounded-xl overflow-hidden hover:border-stone-300 hover:shadow-[0_4px_24px_-12px_rgba(28,25,23,0.18)] transition-all duration-200"
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-stone-100">
        {recipe.cover_image_url ? (
          <img
            src={recipe.cover_image_url}
            alt={recipe.title}
            className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-500 ease-out"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-stone-300">
            <span className="font-display text-4xl">M</span>
          </div>
        )}

        <div className="absolute top-2 left-2">
          <span
            className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium backdrop-blur-sm bg-white/85 ${sourceColor[recipe.source_type]}`}
          >
            <SourceIcon className="w-3 h-3" strokeWidth={2.25} />
            {sourceLabel[recipe.source_type]}
          </span>
        </div>

        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleFavorite();
          }}
          className="absolute top-2 right-2 w-7 h-7 rounded-full bg-white/85 backdrop-blur-sm flex items-center justify-center hover:bg-white transition-colors"
        >
          <Heart
            className={`w-[14px] h-[14px] transition-colors ${
              recipe.is_favorite
                ? 'fill-accent-600 text-accent-600'
                : 'text-stone-500 group-hover:text-stone-700'
            }`}
          />
        </button>
      </div>

      <div className="p-3.5">
        <h3 className="font-display font-semibold text-[15px] text-stone-900 leading-snug line-clamp-2 mb-1">
          {recipe.title}
        </h3>
        {recipe.source_author && (
          <p className="text-[12px] text-stone-500 mb-2 truncate">{recipe.source_author}</p>
        )}

        <div className="flex items-center gap-3 text-[12px] text-stone-500 mt-2">
          <span className="inline-flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {formatTime(recipe.total_time_minutes)}
          </span>
          <span className="inline-flex items-center gap-1">
            <Users className="w-3 h-3" />
            {recipe.yield_amount} {recipe.yield_unit}
          </span>
        </div>

        {tags.length > 0 && (
          <div className="flex items-center gap-1 mt-2.5 flex-wrap">
            {tags.slice(0, 3).map((t) => (
              <span
                key={t.id}
                onClick={(e) => {
                  if (onTagClick) { e.stopPropagation(); onTagClick(t.id); }
                }}
                className={`inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded-md bg-stone-100 text-stone-600 ${onTagClick ? 'hover:bg-stone-200 cursor-pointer' : ''}`}
              >
                <span
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ backgroundColor: t.color }}
                />
                {t.name}
              </span>
            ))}
            {tags.length > 3 && (
              <span className="text-[11px] text-stone-400">+{tags.length - 3}</span>
            )}
          </div>
        )}
      </div>
    </button>
  );
}

interface RecipeListRowProps {
  recipe: Recipe;
  tags: Tag[];
  onClick: () => void;
  onToggleFavorite: () => void;
  onTagClick?: (tagId: string) => void;
}

export function RecipeListRow({ recipe, tags, onClick, onToggleFavorite, onTagClick }: RecipeListRowProps) {
  const SourceIcon = sourceIcon[recipe.source_type];
  return (
    <button
      onClick={onClick}
      className="w-full grid grid-cols-[64px_1fr_140px_120px_120px_40px] gap-4 items-center px-3 py-2 hover:bg-stone-50 rounded-lg text-left transition-colors group"
    >
      <div className="w-16 h-16 rounded-md overflow-hidden bg-stone-100 shrink-0">
        {recipe.cover_image_url && (
          <img src={recipe.cover_image_url} alt={recipe.title} className="w-full h-full object-cover" />
        )}
      </div>
      <div className="min-w-0">
        <div className="font-display font-semibold text-[14px] text-stone-900 truncate">
          {recipe.title}
        </div>
        <div className="flex items-center gap-2 mt-1">
          {tags.slice(0, 3).map((t) => (
            <span
              key={t.id}
              onClick={(e) => {
                if (onTagClick) { e.stopPropagation(); onTagClick(t.id); }
              }}
              className={`inline-flex items-center gap-1 text-[11px] text-stone-500 ${onTagClick ? 'hover:text-stone-800 cursor-pointer' : ''}`}
            >
              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: t.color }} />
              {t.name}
            </span>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-1.5 text-[12px] text-stone-600">
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md ${sourceColor[recipe.source_type]}`}>
          <SourceIcon className="w-3 h-3" strokeWidth={2.25} />
          <span className="font-medium">{sourceLabel[recipe.source_type]}</span>
        </span>
      </div>
      <div className="text-[12px] text-stone-600 inline-flex items-center gap-1">
        <Clock className="w-3 h-3" />
        {formatTime(recipe.total_time_minutes)}
      </div>
      <div className="text-[12px] text-stone-600 inline-flex items-center gap-1">
        <Users className="w-3 h-3" />
        {recipe.yield_amount} {recipe.yield_unit}
      </div>
      <div className="flex items-center gap-1 justify-end">
        <span
          onClick={(e) => {
            e.stopPropagation();
            onToggleFavorite();
          }}
          className="w-7 h-7 rounded-md hover:bg-stone-100 flex items-center justify-center cursor-pointer"
        >
          <Heart
            className={`w-3.5 h-3.5 ${
              recipe.is_favorite ? 'fill-accent-600 text-accent-600' : 'text-stone-400'
            }`}
          />
        </span>
        <span className="w-7 h-7 rounded-md hover:bg-stone-100 flex items-center justify-center cursor-pointer opacity-0 group-hover:opacity-100">
          <MoreHorizontal className="w-3.5 h-3.5 text-stone-400" />
        </span>
      </div>
    </button>
  );
}
