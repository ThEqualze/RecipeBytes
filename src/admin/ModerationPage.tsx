import { useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { Loader2, Link2, ShieldOff, RotateCcw, Flag } from 'lucide-react';

interface Share { id: string; token: string; title: string; owner: string; is_active: boolean; flagged_count: number; created_at: string; }
interface Report { id: string; token: string; title: string; reason: string; status: string; created_at: string; share_active: boolean | null; flagged_count: number | null; }

export function ModerationPage() {
  const [shares, setShares] = useState<Share[] | null>(null);
  const [reports, setReports] = useState<Report[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = () => {
    api.get<{ shares: Share[] }>('/admin/shares').then((r) => setShares(r.shares)).catch(() => setShares([]));
    api.get<{ reports: Report[] }>('/admin/reports').then((r) => setReports(r.reports)).catch(() => setReports([]));
  };
  useEffect(load, []);

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true); setErr(null);
    try { await fn(); load(); }
    catch (e) { setErr(e instanceof ApiError ? e.message : 'Action failed.'); }
    finally { setBusy(false); }
  };

  return (
    <div className="max-w-5xl mx-auto px-8 py-8">
      <h1 className="font-display text-[26px] font-semibold text-stone-900 mb-2">Moderation</h1>
      {err && <div className="mb-4 text-[13px] text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{err}</div>}

      <h2 className="font-display text-[18px] font-semibold text-stone-900 mb-2 mt-4 flex items-center gap-1.5"><Flag className="w-4 h-4 text-rose-500" /> Reported content</h2>
      <div className="bg-white border border-stone-200 rounded-xl overflow-hidden mb-8">
        {!reports ? <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-stone-400" /></div> :
          reports.length === 0 ? <div className="px-4 py-6 text-center text-stone-400 text-[13px]">No open reports.</div> : (
            <table className="w-full text-[13px]">
              <thead className="bg-stone-50 text-stone-500"><tr><th className="text-left font-medium px-4 py-2.5">Recipe</th><th className="text-left font-medium px-4 py-2.5">Reason</th><th className="text-left font-medium px-4 py-2.5">When</th><th className="px-4 py-2.5"></th></tr></thead>
              <tbody>
                {reports.map((r) => (
                  <tr key={r.id} className="border-t border-stone-100">
                    <td className="px-4 py-2.5 text-stone-800">{r.title}{r.share_active === false && <span className="ml-2 text-[11px] text-stone-500">(taken down)</span>}</td>
                    <td className="px-4 py-2.5 text-stone-600">{r.reason || <span className="text-stone-400">—</span>}</td>
                    <td className="px-4 py-2.5 text-stone-500 whitespace-nowrap">{new Date(r.created_at + 'Z').toLocaleDateString()}</td>
                    <td className="px-4 py-2.5 text-right whitespace-nowrap">
                      <button disabled={busy} onClick={() => act(() => api.post(`/admin/reports/${r.id}/resolve`, {}))} className="text-[12px] font-medium text-stone-700 bg-stone-100 hover:bg-stone-200 rounded px-2.5 py-1">Resolve</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
      </div>

      <h2 className="font-display text-[18px] font-semibold text-stone-900 mb-2 flex items-center gap-1.5"><Link2 className="w-4 h-4" /> Public links</h2>
      <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
        {!shares ? <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-stone-400" /></div> :
          shares.length === 0 ? <div className="px-4 py-6 text-center text-stone-400 text-[13px]">No public links yet.</div> : (
            <table className="w-full text-[13px]">
              <thead className="bg-stone-50 text-stone-500"><tr><th className="text-left font-medium px-4 py-2.5">Recipe</th><th className="text-left font-medium px-4 py-2.5">Owner</th><th className="text-left font-medium px-4 py-2.5">Flags</th><th className="text-left font-medium px-4 py-2.5">Status</th><th className="px-4 py-2.5"></th></tr></thead>
              <tbody>
                {shares.map((s) => (
                  <tr key={s.id} className="border-t border-stone-100">
                    <td className="px-4 py-2.5 text-stone-800">{s.title}</td>
                    <td className="px-4 py-2.5 text-stone-600">{s.owner}</td>
                    <td className="px-4 py-2.5">{s.flagged_count > 0 ? <span className="text-rose-600 font-medium">{s.flagged_count}</span> : <span className="text-stone-400">0</span>}</td>
                    <td className="px-4 py-2.5">{s.is_active ? <span className="text-emerald-700 bg-emerald-50 rounded px-2 py-0.5 text-[12px] font-medium">Live</span> : <span className="text-stone-600 bg-stone-100 rounded px-2 py-0.5 text-[12px] font-medium">Taken down</span>}</td>
                    <td className="px-4 py-2.5 text-right whitespace-nowrap">
                      {s.is_active
                        ? <button disabled={busy} onClick={() => act(() => api.post(`/admin/shares/${s.id}/revoke`, {}))} className="inline-flex items-center gap-1 text-[12px] font-medium text-white bg-rose-600 hover:bg-rose-700 rounded px-2.5 py-1"><ShieldOff className="w-3 h-3" /> Take down</button>
                        : <button disabled={busy} onClick={() => act(() => api.post(`/admin/shares/${s.id}/restore`, {}))} className="inline-flex items-center gap-1 text-[12px] font-medium text-stone-700 bg-stone-100 hover:bg-stone-200 rounded px-2.5 py-1"><RotateCcw className="w-3 h-3" /> Restore</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
      </div>
    </div>
  );
}
