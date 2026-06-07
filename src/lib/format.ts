import type { SourceType } from '../lib/database.types';
import { Globe, Instagram, Music2, Facebook, Youtube, Pencil, Link2 } from 'lucide-react';

export const sourceLabel: Record<SourceType, string> = {
  manual: 'Manual',
  web: 'Web',
  tiktok: 'TikTok',
  instagram: 'Instagram',
  facebook: 'Facebook',
  youtube: 'YouTube',
  other: 'Other',
};

export const sourceIcon: Record<SourceType, typeof Globe> = {
  manual: Pencil,
  web: Globe,
  tiktok: Music2,
  instagram: Instagram,
  facebook: Facebook,
  youtube: Youtube,
  other: Link2,
};

export const sourceColor: Record<SourceType, string> = {
  manual: 'text-stone-500 bg-stone-100',
  web: 'text-sky-700 bg-sky-50',
  tiktok: 'text-rose-700 bg-rose-50',
  instagram: 'text-pink-700 bg-pink-50',
  facebook: 'text-blue-700 bg-blue-50',
  youtube: 'text-red-700 bg-red-50',
  other: 'text-stone-500 bg-stone-100',
};

export function formatTime(minutes: number): string {
  if (minutes <= 0) return '—';
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

export function formatQuantity(qty: number | null): string {
  if (qty == null) return '';
  const fractionMap: Record<string, string> = {
    '0.25': '¼',
    '0.5': '½',
    '0.75': '¾',
    '0.33': '⅓',
    '0.67': '⅔',
    '0.125': '⅛',
  };
  const whole = Math.floor(qty);
  const frac = +(qty - whole).toFixed(3).slice(0, 5);
  const fracStr = fractionMap[frac.toString()];
  if (fracStr && whole === 0) return fracStr;
  if (fracStr) return `${whole} ${fracStr}`;
  return Number.isInteger(qty) ? `${qty}` : `${qty}`;
}
