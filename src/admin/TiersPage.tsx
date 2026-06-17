import { useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { Loader2, Plus, Trash2, Save, Star } from 'lucide-react';

interface Tier {
  id: string;
  tier_name: string;
  monthly_cost: number;
  max_recipes: number | null;
  max_url_imports: number | null;
  max_image_scans: number | null;
  multi_device_enabled: boolean;
  kitchen_mode_enabled: boolean;
  planner_enabled: boolean;
  shopping_list_enabled: boolean;
  pantry_match_enabled: boolean;
  is_default: boolean;
  position: number;
}

const FEATURES: { key: keyof Tier; label: string }[] = [
  { key: 'multi_device_enabled', label: 'Multi-device sync' },
  { key: 'kitchen_mode_enabled', label: 'Kitchen Mode' },
  { key: 'planner_enabled', label: 'Meal planner' },
  { key: 'shopping_list_enabled', label: 'Shopping list' },
  { key: 'pantry_match_enabled', label: 'Pantry match' },
];

const LIMITS: { key: keyof Tier; label: string }[] = [
  { key: 'max_recipes', label: 'Max recipes' },
  { key: 'max_url_imports', label: 'URL imports / mo' },
  { key: 'max_image_scans', label: 'Image scans / mo' },
];

function blankTier(): Tier {
  return {
    id: '', tier_name: '', monthly_cost: 0,
    max_recipes: null, max_url_imports: null, max_image_scans: null,
    multi_device_enabled: true, kitchen_mode_enabled: true, planner_enabled: true,
    shopping_list_enabled: true, pantry_match_enabled: true, is_default: false, position: 0,
  };
}

function TierCard({ initial, onChanged }: { initial: Tier; onChanged: () => void }) {
  const [t, setT] = useState<Tier>(initial);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const isNew = initial.id === '';

  const set = <K extends keyof Tier>(k: K, v: Tier[K]) => setT((p) => ({ ...p, [k]: v }));

  const save = async () => {
    setBusy(true); setErr(null); setMsg(null);
    try {
      const payload = {
        tier_name: t.tier_name,
        monthly_cost: t.monthly_cost,
        max_recipes: t.max_recipes,
        max_url_imports: t.max_url_imports,
        max_image_scans: t.max_image_scans,
        multi_device_enabled: t.multi_device_enabled,
        kitchen_mode_enabled: t.kitchen_mode_enabled,
        planner_enabled: t.planner_enabled,
        shopping_list_enabled: t.shopping_list_enabled,
        pantry_match_enabled: t.pantry_match_enabled,
        is_default: t.is_default,
        position: t.position,
      };
      await api.post(isNew ? '/admin/tiers' : `/admin/tiers/${t.id}`, payload);
      setMsg('Saved.');
      onChanged();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Save failed.');
    } finally {
      setBusy(false);
    }
  };

  const del = async () => {
    if (!window.confirm(`Delete the "${t.tier_name}" tier?`)) return;
    setBusy(true); setErr(null);
    try {
      await api.post(`/admin/tiers/${t.id}/delete`, {});
      onChanged();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Delete failed.');
      setBusy(false);
    }
  };

  const limitInput = (key: keyof Tier) => {
    const val = t[key] as number | null;
    return (
      <input
        type="number" min={0}
        value={val === null ? '' : val}
        placeholder="∞"
        onChange={(e) => set(key, (e.target.value === '' ? null : Math.max(0, Math.floor(Number(e.target.value)))) as Tier[keyof Tier])}
        className="w-24 px-2 py-1 text-[13px] bg-white border border-stone-200 rounded-md focus:outline-none focus:ring-2 focus:ring-stone-900/5"
      />
    );
  };

  return (
    <div className="bg-white border border-stone-200 rounded-xl p-4">
      <div className="flex items-center gap-3 mb-3">
        <input
          value={t.tier_name}
          onChange={(e) => set('tier_name', e.target.value)}
          placeholder="Tier name"
          className="font-display text-[18px] font-semibold text-stone-900 border-b border-transparent hover:border-stone-200 focus:border-stone-300 focus:outline-none bg-transparent"
        />
        {t.is_default && <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-700 bg-amber-50 rounded px-2 py-0.5"><Star className="w-3 h-3" /> Default</span>}
      </div>

      <div className="flex flex-wrap gap-x-6 gap-y-3 mb-3">
        <label className="text-[12px] text-stone-600">
          <span className="block mb-1 font-medium">£ / month</span>
          <input
            type="number" min={0} step="0.01" value={t.monthly_cost}
            onChange={(e) => set('monthly_cost', Number(e.target.value))}
            className="w-24 px-2 py-1 text-[13px] bg-white border border-stone-200 rounded-md focus:outline-none focus:ring-2 focus:ring-stone-900/5"
          />
        </label>
        {LIMITS.map((l) => (
          <label key={l.key} className="text-[12px] text-stone-600">
            <span className="block mb-1 font-medium">{l.label}</span>
            {limitInput(l.key)}
          </label>
        ))}
      </div>
      <p className="text-[11px] text-stone-400 mb-3">Leave a limit blank for unlimited.</p>

      <div className="flex flex-wrap gap-x-5 gap-y-2 mb-3">
        {FEATURES.map((fdef) => (
          <label key={fdef.key} className="inline-flex items-center gap-1.5 text-[13px] text-stone-700">
            <input
              type="checkbox" checked={t[fdef.key] as boolean}
              onChange={(e) => set(fdef.key, e.target.checked as Tier[keyof Tier])}
            />
            {fdef.label}
          </label>
        ))}
        <label className="inline-flex items-center gap-1.5 text-[13px] text-stone-700">
          <input type="checkbox" checked={t.is_default} onChange={(e) => set('is_default', e.target.checked)} />
          Default tier
        </label>
      </div>

      {err && <div className="mb-2 text-[12px] text-red-600">{err}</div>}
      {msg && <div className="mb-2 text-[12px] text-emerald-700">{msg}</div>}

      <div className="flex items-center gap-2">
        <button onClick={save} disabled={busy} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[13px] font-medium bg-stone-900 hover:bg-stone-800 disabled:bg-stone-300 text-white rounded-lg">
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          {isNew ? 'Create tier' : 'Save'}
        </button>
        {!isNew && (
          <button onClick={del} disabled={busy} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[13px] font-medium text-rose-600 hover:bg-rose-50 rounded-lg">
            <Trash2 className="w-3.5 h-3.5" /> Delete
          </button>
        )}
      </div>
    </div>
  );
}

export function TiersPage() {
  const [tiers, setTiers] = useState<Tier[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    api.get<{ tiers: Tier[] }>('/admin/tiers').then((r) => setTiers(r.tiers)).catch(() => setTiers([]));
  }, [reloadKey]);

  const reload = () => { setCreating(false); setReloadKey((k) => k + 1); };

  return (
    <div className="max-w-4xl mx-auto px-8 py-8">
      <div className="flex items-center justify-between mb-5">
        <h1 className="font-display text-[26px] font-semibold text-stone-900">Tiers &amp; paywall</h1>
        <button onClick={() => setCreating(true)} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[13px] font-medium bg-stone-900 hover:bg-stone-800 text-white rounded-lg">
          <Plus className="w-3.5 h-3.5" /> New tier
        </button>
      </div>
      <p className="text-[13px] text-stone-500 mb-5">Edit plan limits and feature toggles. Changes apply immediately — no deploy needed.</p>

      {!tiers ? (
        <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-stone-400" /></div>
      ) : (
        <div className="space-y-4">
          {creating && <TierCard key="new" initial={blankTier()} onChanged={reload} />}
          {tiers.map((t) => <TierCard key={t.id} initial={t} onChanged={reload} />)}
        </div>
      )}
    </div>
  );
}
