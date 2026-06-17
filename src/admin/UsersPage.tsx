import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { Loader2, Search, ChevronLeft, ChevronRight, ShieldCheck } from 'lucide-react';

interface UserRow {
  id: string;
  email: string;
  display_name: string;
  is_admin: boolean;
  suspended: boolean;
  created_at: string;
  tier_name: string | null;
  recipe_count: number;
}
interface UsersResp { users: UserRow[]; total: number; page: number; per_page: number; }

export function UsersPage({ onOpenUser }: { onOpenUser: (id: string) => void }) {
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<UsersResp | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page) });
    if (q.trim()) params.set('q', q.trim());
    api.get<UsersResp>('/admin/users?' + params.toString())
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [q, page]);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.per_page)) : 1;

  return (
    <div className="max-w-5xl mx-auto px-8 py-8">
      <h1 className="font-display text-[26px] font-semibold text-stone-900 mb-5">Users</h1>

      <div className="relative mb-4 max-w-sm">
        <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          value={q}
          onChange={(e) => { setPage(1); setQ(e.target.value); }}
          placeholder="Search email or name…"
          className="w-full pl-9 pr-3 py-2 text-[13px] bg-white border border-stone-200 rounded-lg placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-900/5 focus:border-stone-300"
        />
      </div>

      <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
        <table className="w-full text-[13px]">
          <thead className="bg-stone-50 text-stone-500">
            <tr>
              <th className="text-left font-medium px-4 py-2.5">User</th>
              <th className="text-left font-medium px-4 py-2.5">Tier</th>
              <th className="text-left font-medium px-4 py-2.5">Recipes</th>
              <th className="text-left font-medium px-4 py-2.5">Status</th>
              <th className="text-left font-medium px-4 py-2.5">Joined</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="px-4 py-10 text-center"><Loader2 className="w-5 h-5 animate-spin text-stone-400 mx-auto" /></td></tr>
            ) : !data || data.users.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-10 text-center text-stone-400">No users found.</td></tr>
            ) : (
              data.users.map((u) => (
                <tr
                  key={u.id}
                  onClick={() => onOpenUser(u.id)}
                  className="border-t border-stone-100 hover:bg-stone-50 cursor-pointer"
                >
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-1.5 font-medium text-stone-800">
                      {u.display_name || u.email.split('@')[0]}
                      {u.is_admin && <ShieldCheck className="w-3.5 h-3.5 text-accent-700" />}
                    </div>
                    <div className="text-[12px] text-stone-500">{u.email}</div>
                  </td>
                  <td className="px-4 py-2.5 text-stone-600">{u.tier_name ?? '—'}</td>
                  <td className="px-4 py-2.5 text-stone-600">{u.recipe_count}</td>
                  <td className="px-4 py-2.5">
                    {u.suspended
                      ? <span className="text-[12px] font-medium text-rose-600 bg-rose-50 rounded px-2 py-0.5">Suspended</span>
                      : <span className="text-[12px] font-medium text-emerald-700 bg-emerald-50 rounded px-2 py-0.5">Active</span>}
                  </td>
                  <td className="px-4 py-2.5 text-stone-500">{new Date(u.created_at + 'Z').toLocaleDateString()}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {data && data.total > data.per_page && (
        <div className="flex items-center justify-between mt-4 text-[13px] text-stone-500">
          <span>{data.total} users</span>
          <div className="flex items-center gap-2">
            <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="p-1.5 rounded-md hover:bg-stone-100 disabled:opacity-40"><ChevronLeft className="w-4 h-4" /></button>
            <span>Page {page} / {totalPages}</span>
            <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className="p-1.5 rounded-md hover:bg-stone-100 disabled:opacity-40"><ChevronRight className="w-4 h-4" /></button>
          </div>
        </div>
      )}
    </div>
  );
}
