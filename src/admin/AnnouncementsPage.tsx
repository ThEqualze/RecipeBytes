import { useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { Loader2, Megaphone, Plus, Trash2 } from 'lucide-react';

type AnnType = 'info' | 'warning' | 'critical';
type Status = 'off' | 'scheduled' | 'live' | 'expired';

interface Ann {
  id: string;
  message: string;
  type: AnnType;
  link_label: string | null;
  link_url: string | null;
  is_active: boolean;
  starts_at: string | null;
  ends_at: string | null;
  created_at: string;
  status: Status;
  hidden_by_newer: boolean;
}

interface FormState {
  message: string;
  type: AnnType;
  link_label: string;
  link_url: string;
  is_active: boolean;
  starts_at: string;
  ends_at: string;
}

const EMPTY: FormState = {
  message: '', type: 'info', link_label: '', link_url: '', is_active: true, starts_at: '', ends_at: '',
};

const STATUS_BADGE: Record<Status, string> = {
  live:      'bg-green-100 text-green-700',
  scheduled: 'bg-blue-100 text-blue-700',
  expired:   'bg-stone-100 text-stone-500',
  off:       'bg-stone-100 text-stone-500',
};

export function AnnouncementsPage() {
  const [items, setItems] = useState<Ann[] | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [editId, setEditId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = () => {
    api.get<{ announcements: Ann[] }>('/admin/announcements')
      .then((r) => setItems(r.announcements))
      .catch(() => setItems([]));
  };
  useEffect(load, []);

  const startEdit = (a: Ann) => {
    setEditId(a.id);
    setForm({
      message: a.message,
      type: a.type,
      link_label: a.link_label ?? '',
      link_url: a.link_url ?? '',
      is_active: a.is_active,
      starts_at: a.starts_at ? a.starts_at.replace(' ', 'T').slice(0, 16) : '',
      ends_at: a.ends_at ? a.ends_at.replace(' ', 'T').slice(0, 16) : '',
    });
  };

  const reset = () => { setEditId(null); setForm(EMPTY); setErr(null); };

  const save = async () => {
    setBusy(true); setErr(null);
    const body = {
      message: form.message,
      type: form.type,
      link_label: form.link_label,
      link_url: form.link_url,
      is_active: form.is_active,
      starts_at: form.starts_at,
      ends_at: form.ends_at,
    };
    try {
      if (editId) await api.patch(`/admin/announcements/${editId}`, body);
      else await api.post('/admin/announcements', body);
      reset();
      load();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Save failed.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    setBusy(true); setErr(null);
    try { await api.del(`/admin/announcements/${id}`); if (editId === id) reset(); load(); }
    catch (e) { setErr(e instanceof ApiError ? e.message : 'Delete failed.'); }
    finally { setBusy(false); }
  };

  const field = 'w-full text-[13px] border border-stone-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-stone-300';

  return (
    <div className="max-w-5xl mx-auto px-8 py-8">
      <h1 className="font-display text-[26px] font-semibold text-stone-900 mb-2 flex items-center gap-2">
        <Megaphone className="w-6 h-6 text-accent-700" /> Announcements
      </h1>
      <p className="text-[13px] text-stone-500 mb-6">The single newest <strong>live</strong> announcement is shown to users. Dismissals are per-person.</p>

      {err && <div className="mb-4 text-[13px] text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{err}</div>}

      {/* Editor */}
      <div className="bg-white border border-stone-200 rounded-xl p-5 mb-8 space-y-3">
        <div className="text-[14px] font-semibold text-stone-800">{editId ? 'Edit announcement' : 'New announcement'}</div>
        <textarea className={field} rows={2} maxLength={280} placeholder="Message (max 280 chars)"
          value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <select className={field} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as AnnType })}>
            <option value="info">Info (blue)</option>
            <option value="warning">Warning (amber)</option>
            <option value="critical">Critical (red)</option>
          </select>
          <input className={field} placeholder="Link label (optional)" value={form.link_label}
            onChange={(e) => setForm({ ...form, link_label: e.target.value })} />
          <input className={field} placeholder="Link URL (https://… or /path)" value={form.link_url}
            onChange={(e) => setForm({ ...form, link_url: e.target.value })} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="text-[12px] text-stone-500">Starts (optional, UTC)
            <input type="datetime-local" className={field} value={form.starts_at}
              onChange={(e) => setForm({ ...form, starts_at: e.target.value })} />
          </label>
          <label className="text-[12px] text-stone-500">Ends (optional, UTC)
            <input type="datetime-local" className={field} value={form.ends_at}
              onChange={(e) => setForm({ ...form, ends_at: e.target.value })} />
          </label>
        </div>
        <label className="flex items-center gap-2 text-[13px] text-stone-700">
          <input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />
          Active
        </label>
        <div className="flex items-center gap-2 pt-1">
          <button disabled={busy} onClick={save}
            className="inline-flex items-center gap-1.5 text-[13px] font-medium text-white bg-stone-900 hover:bg-stone-800 rounded-lg px-3.5 py-2 disabled:opacity-50">
            <Plus className="w-4 h-4" /> {editId ? 'Save changes' : 'Create'}
          </button>
          {editId && <button onClick={reset} className="text-[13px] font-medium text-stone-600 hover:text-stone-900 px-2 py-2">Cancel</button>}
        </div>
      </div>

      {/* List */}
      <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
        {!items ? <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-stone-400" /></div> :
          items.length === 0 ? <div className="px-4 py-6 text-center text-stone-400 text-[13px]">No announcements yet.</div> : (
            <table className="w-full text-[13px]">
              <thead className="bg-stone-50 text-stone-500"><tr>
                <th className="text-left font-medium px-4 py-2.5">Message</th>
                <th className="text-left font-medium px-4 py-2.5">Type</th>
                <th className="text-left font-medium px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5"></th>
              </tr></thead>
              <tbody>
                {items.map((a) => (
                  <tr key={a.id} className="border-t border-stone-100">
                    <td className="px-4 py-2.5 text-stone-800 max-w-md truncate">{a.message}</td>
                    <td className="px-4 py-2.5 text-stone-600 capitalize">{a.type}</td>
                    <td className="px-4 py-2.5">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-medium ${STATUS_BADGE[a.status]}`}>{a.status}</span>
                      {a.hidden_by_newer && <span className="ml-2 text-[11px] text-stone-400">(hidden — newer active)</span>}
                    </td>
                    <td className="px-4 py-2.5 text-right whitespace-nowrap">
                      <button onClick={() => startEdit(a)} className="text-[12px] font-medium text-stone-700 bg-stone-100 hover:bg-stone-200 rounded px-2.5 py-1 mr-2">Edit</button>
                      <button disabled={busy} onClick={() => remove(a.id)} aria-label="Delete" className="inline-flex items-center text-[12px] font-medium text-red-600 hover:bg-red-50 rounded px-2 py-1">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
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
