import { useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { Loader2, Cpu, AlertTriangle, Save } from 'lucide-react';

interface Stats {
  totals: { jobs: number; success: number; failed: number; tokens: number; cost: number };
  by_type: { job_type: string; jobs: number; tokens: number; cost: number }[];
  leaderboard: { user_id: string | null; email: string; jobs: number; tokens: number; cost: number }[];
}
interface Failure { id: string; email: string; job_type: string; model: string; error_message: string | null; created_at: string; }

export function AiMonitorPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [failures, setFailures] = useState<Failure[] | null>(null);
  const [model, setModel] = useState('');
  const [models, setModels] = useState<string[]>([]);
  const [savingModel, setSavingModel] = useState(false);
  const [modelMsg, setModelMsg] = useState<string | null>(null);

  useEffect(() => {
    api.get<Stats>('/admin/ai/stats').then(setStats).catch(() => setStats(null));
    api.get<{ failures: Failure[] }>('/admin/ai/failures').then((r) => setFailures(r.failures)).catch(() => setFailures([]));
    api.get<{ model: string; available: string[] }>('/admin/ai/model').then((r) => { setModel(r.model); setModels(r.available.includes(r.model) ? r.available : [r.model, ...r.available]); }).catch(() => {});
  }, []);

  const saveModel = async () => {
    setSavingModel(true); setModelMsg(null);
    try { await api.post('/admin/ai/model', { model }); setModelMsg('Active model updated.'); }
    catch (e) { setModelMsg(e instanceof ApiError ? e.message : 'Failed.'); }
    finally { setSavingModel(false); }
  };

  const money = (n: number) => '£' + n.toFixed(4);

  return (
    <div className="max-w-5xl mx-auto px-8 py-8">
      <h1 className="font-display text-[26px] font-semibold text-stone-900 mb-6">AI cost &amp; performance</h1>

      {/* Model switcher */}
      <div className="bg-white border border-stone-200 rounded-xl p-4 mb-6">
        <div className="text-[11px] uppercase tracking-wider font-semibold text-stone-500 mb-2 flex items-center gap-1.5"><Cpu className="w-3.5 h-3.5" /> Active AI model</div>
        <div className="flex flex-wrap items-center gap-2">
          <select value={model} onChange={(e) => setModel(e.target.value)} className="text-[13px] border border-stone-200 rounded-lg px-2 py-1.5 bg-white">
            {models.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
          <button onClick={saveModel} disabled={savingModel} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[13px] font-medium bg-stone-900 hover:bg-stone-800 disabled:bg-stone-300 text-white rounded-lg">
            {savingModel ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Set model
          </button>
          {modelMsg && <span className="text-[12px] text-stone-500">{modelMsg}</span>}
        </div>
        <p className="text-[11px] text-stone-400 mt-2">Applies to all URL + image extractions immediately. Overrides config.php.</p>
      </div>

      {!stats ? <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-stone-400" /></div> : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            {[
              { l: 'AI jobs', v: stats.totals.jobs },
              { l: 'Success', v: stats.totals.success },
              { l: 'Failed', v: stats.totals.failed },
              { l: 'Tokens', v: stats.totals.tokens.toLocaleString() },
            ].map((c) => (
              <div key={c.l} className="bg-white border border-stone-200 rounded-xl p-4">
                <div className="text-[28px] font-semibold text-stone-900 leading-none">{c.v}</div>
                <div className="text-[12px] text-stone-500 mt-1">{c.l}</div>
              </div>
            ))}
          </div>
          <div className="bg-white border border-stone-200 rounded-xl p-4 mb-6 text-[13px] text-stone-700">
            Estimated total cost: <span className="font-semibold">{money(stats.totals.cost)}</span>
            <span className="text-stone-400"> (set ai_cost_per_1k_tokens in config to populate)</span>
          </div>

          <h2 className="font-display text-[18px] font-semibold text-stone-900 mb-2">Top token consumers</h2>
          <div className="bg-white border border-stone-200 rounded-xl overflow-hidden mb-6">
            <table className="w-full text-[13px]">
              <thead className="bg-stone-50 text-stone-500"><tr><th className="text-left font-medium px-4 py-2.5">User</th><th className="text-left font-medium px-4 py-2.5">Jobs</th><th className="text-left font-medium px-4 py-2.5">Tokens</th><th className="text-left font-medium px-4 py-2.5">Cost</th></tr></thead>
              <tbody>
                {stats.leaderboard.length === 0 ? <tr><td colSpan={4} className="px-4 py-6 text-center text-stone-400">No AI jobs yet.</td></tr> :
                  stats.leaderboard.map((r, i) => (
                    <tr key={i} className="border-t border-stone-100">
                      <td className="px-4 py-2.5 text-stone-800">{r.email}</td>
                      <td className="px-4 py-2.5 text-stone-600">{r.jobs}</td>
                      <td className="px-4 py-2.5 text-stone-600">{r.tokens.toLocaleString()}</td>
                      <td className="px-4 py-2.5 text-stone-600">{money(r.cost)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <h2 className="font-display text-[18px] font-semibold text-stone-900 mb-2 flex items-center gap-1.5"><AlertTriangle className="w-4 h-4 text-amber-500" /> Extraction failures</h2>
      <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
        {!failures ? <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-stone-400" /></div> :
          failures.length === 0 ? <div className="px-4 py-6 text-center text-stone-400 text-[13px]">No failures logged.</div> : (
            <table className="w-full text-[13px]">
              <thead className="bg-stone-50 text-stone-500"><tr><th className="text-left font-medium px-4 py-2.5">When</th><th className="text-left font-medium px-4 py-2.5">User</th><th className="text-left font-medium px-4 py-2.5">Type</th><th className="text-left font-medium px-4 py-2.5">Error</th></tr></thead>
              <tbody>
                {failures.map((f) => (
                  <tr key={f.id} className="border-t border-stone-100">
                    <td className="px-4 py-2.5 text-stone-500 whitespace-nowrap">{new Date(f.created_at + 'Z').toLocaleString()}</td>
                    <td className="px-4 py-2.5 text-stone-600">{f.email}</td>
                    <td className="px-4 py-2.5 text-stone-600">{f.job_type}</td>
                    <td className="px-4 py-2.5 text-rose-700 font-mono text-[12px]">{f.error_message ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
      </div>
    </div>
  );
}
