import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { ArrowLeft, Loader2, ShieldCheck, Ban, RotateCcw, Gift, LogIn } from 'lucide-react';

interface Dossier {
  user: { id: string; email: string; display_name: string; is_admin: boolean; suspended: boolean; suspended_at: string | null; created_at: string };
  subscription: null | {
    tier_id: string; tier_name: string; status: string; monthly_cost: number;
    current_period_end: string | null;
    limits: { max_recipes: number | null; max_url_imports: number | null; max_image_scans: number | null };
    features: Record<string, boolean>;
  };
  usage: { period_start: string; reset_date: string; url_imports_count: number; image_scans_count: number };
  stats: { recipe_count: number; ai_jobs: { job_type: string; status: string; count: number }[] };
}
interface Tier { id: string; tier_name: string; }

const lim = (n: number | null) => (n === null ? '∞' : String(n));

export function UserDossier({ id, onBack }: { id: string; onBack: () => void }) {
  const [d, setD] = useState<Dossier | null>(null);
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(() => {
    api.get<Dossier>('/admin/users/' + id).then(setD).catch(() => setErr('Could not load this user.'));
  }, [id]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { api.get<{ tiers: Tier[] }>('/admin/overview').then((o) => setTiers(o.tiers)).catch(() => {}); }, []);

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true); setErr(null);
    try { await fn(); load(); }
    catch (e) { setErr(e instanceof ApiError ? e.message : 'Action failed.'); }
    finally { setBusy(false); }
  };

  const impersonate = async () => {
    setBusy(true); setErr(null);
    try {
      const r = await api.post<{ redirect: string }>(`/admin/users/${id}/impersonate`, {});
      window.location.href = r.redirect || '/';
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Could not start impersonation.');
      setBusy(false);
    }
  };

  if (err && !d) return <div className="p-8 text-stone-500">{err}</div>;
  if (!d) return <div className="p-8 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-stone-400" /></div>;

  const u = d.user;

  return (
    <div className="max-w-4xl mx-auto px-8 py-8">
      <button onClick={onBack} className="inline-flex items-center gap-1.5 text-[13px] text-stone-600 hover:text-stone-900 font-medium mb-5">
        <ArrowLeft className="w-3.5 h-3.5" /> Back to users
      </button>

      <div className="flex items-center gap-2 mb-1">
        <h1 className="font-display text-[26px] font-semibold text-stone-900">{u.display_name || u.email.split('@')[0]}</h1>
        {u.is_admin && <span className="inline-flex items-center gap-1 text-[12px] font-medium text-accent-700 bg-accent-50 rounded px-2 py-0.5"><ShieldCheck className="w-3 h-3" /> Admin</span>}
        {u.suspended && <span className="text-[12px] font-medium text-rose-600 bg-rose-50 rounded px-2 py-0.5">Suspended</span>}
      </div>
      <div className="text-[13px] text-stone-500 mb-6">{u.email} · joined {new Date(u.created_at + 'Z').toLocaleDateString()}</div>

      {err && <div className="mb-4 text-[13px] text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{err}</div>}

      <div className="grid sm:grid-cols-2 gap-4 mb-6">
        {/* Subscription */}
        <div className="bg-white border border-stone-200 rounded-xl p-4">
          <div className="text-[11px] uppercase tracking-wider font-semibold text-stone-500 mb-2">Subscription</div>
          {d.subscription ? (
            <>
              <div className="text-[18px] font-semibold text-stone-900">{d.subscription.tier_name}
                <span className="text-[12px] font-normal text-stone-500 ml-2">{d.subscription.status}</span></div>
              <div className="text-[12px] text-stone-500 mt-1">
                Limits — recipes {lim(d.subscription.limits.max_recipes)}, URL {lim(d.subscription.limits.max_url_imports)}/mo, scans {lim(d.subscription.limits.max_image_scans)}/mo
              </div>
              {d.subscription.current_period_end && (
                <div className="text-[12px] text-stone-500 mt-1">Renews/expires {new Date(d.subscription.current_period_end + 'Z').toLocaleDateString()}</div>
              )}
            </>
          ) : <div className="text-stone-400 text-[13px]">No subscription</div>}

          <div className="mt-3 flex items-center gap-2">
            <select
              value={d.subscription?.tier_id ?? ''}
              disabled={busy}
              onChange={(e) => act(() => api.post(`/admin/users/${id}/subscription`, { tier_id: e.target.value, status: 'active' }))}
              className="text-[13px] border border-stone-200 rounded-lg px-2 py-1.5 bg-white"
            >
              {tiers.map((t) => <option key={t.id} value={t.id}>{t.tier_name}</option>)}
            </select>
            {tiers.find((t) => t.tier_name === 'Pro') && (
              <button
                disabled={busy}
                onClick={() => act(() => {
                  const pro = tiers.find((t) => t.tier_name === 'Pro')!;
                  const end = new Date(); end.setFullYear(end.getFullYear() + 1);
                  return api.post(`/admin/users/${id}/subscription`, { tier_id: pro.id, status: 'gifted', current_period_end: end.toISOString().slice(0, 19).replace('T', ' ') });
                })}
                className="inline-flex items-center gap-1.5 text-[13px] font-medium text-accent-700 bg-accent-50 hover:bg-accent-100 rounded-lg px-3 py-1.5"
              >
                <Gift className="w-3.5 h-3.5" /> Gift 1yr Pro
              </button>
            )}
          </div>
        </div>

        {/* Usage */}
        <div className="bg-white border border-stone-200 rounded-xl p-4">
          <div className="text-[11px] uppercase tracking-wider font-semibold text-stone-500 mb-2">This month's usage</div>
          <div className="text-[13px] text-stone-700">URL imports: <span className="font-semibold">{d.usage.url_imports_count}</span></div>
          <div className="text-[13px] text-stone-700">Image scans: <span className="font-semibold">{d.usage.image_scans_count}</span></div>
          <div className="text-[12px] text-stone-500 mt-1">Resets {new Date(d.usage.reset_date + 'T00:00:00Z').toLocaleDateString()}</div>
          <button
            disabled={busy}
            onClick={() => act(() => api.post(`/admin/users/${id}/usage-reset`, {}))}
            className="mt-3 inline-flex items-center gap-1.5 text-[13px] font-medium text-stone-700 bg-stone-100 hover:bg-stone-200 rounded-lg px-3 py-1.5"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Reset counters
          </button>
        </div>
      </div>

      {/* Stats + danger zone */}
      <div className="bg-white border border-stone-200 rounded-xl p-4 mb-6">
        <div className="text-[11px] uppercase tracking-wider font-semibold text-stone-500 mb-2">Activity</div>
        <div className="text-[13px] text-stone-700">Active recipes: <span className="font-semibold">{d.stats.recipe_count}</span></div>
        <div className="text-[13px] text-stone-700">AI jobs: {d.stats.ai_jobs.length === 0 ? <span className="text-stone-400">none</span> : d.stats.ai_jobs.map((j, i) => <span key={i} className="mr-3">{j.job_type}/{j.status}: <span className="font-semibold">{j.count}</span></span>)}</div>
      </div>

      {/* Support */}
      <div className="bg-white border border-stone-200 rounded-xl p-4 mb-6">
        <div className="text-[11px] uppercase tracking-wider font-semibold text-stone-500 mb-2">Support</div>
        <button
          disabled={busy || u.is_admin}
          onClick={impersonate}
          className="inline-flex items-center gap-1.5 text-[13px] font-medium text-accent-700 bg-accent-50 hover:bg-accent-100 disabled:opacity-50 rounded-lg px-3 py-1.5"
        >
          <LogIn className="w-3.5 h-3.5" /> Log in as this user
        </button>
        <p className="text-[12px] text-stone-500 mt-2">
          Opens the app as this user in a time-limited support session (no password needed); a banner lets you exit back to admin.
          {u.is_admin && ' Admins cannot be impersonated.'}
        </p>
      </div>

      <div className="border border-rose-200 bg-rose-50/40 rounded-xl p-4">
        <div className="text-[11px] uppercase tracking-wider font-semibold text-rose-600 mb-2">Account actions</div>
        {u.suspended ? (
          <button disabled={busy} onClick={() => act(() => api.post(`/admin/users/${id}/suspend`, { suspend: false }))}
            className="inline-flex items-center gap-1.5 text-[13px] font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg px-3 py-1.5">
            <ShieldCheck className="w-3.5 h-3.5" /> Reinstate user
          </button>
        ) : (
          <button disabled={busy || u.is_admin} onClick={() => act(() => api.post(`/admin/users/${id}/suspend`, { suspend: true }))}
            className="inline-flex items-center gap-1.5 text-[13px] font-medium text-white bg-rose-600 hover:bg-rose-700 disabled:bg-stone-300 rounded-lg px-3 py-1.5">
            <Ban className="w-3.5 h-3.5" /> Suspend / ban user
          </button>
        )}
        <p className="text-[12px] text-stone-500 mt-2">Suspending immediately signs the user out of all devices and blocks login. Password reset arrives in Phase 2c.</p>
      </div>
    </div>
  );
}
