import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { Loader2, Users, ShieldCheck, Ban, BookOpen } from 'lucide-react';

interface Tier { id: string; tier_name: string; monthly_cost: string; is_default: number; position: number; }
interface Overview {
  counts: { users: number; admins: number; suspended: number; active_recipes: number };
  tiers: Tier[];
}

export function OverviewPage() {
  const [data, setData] = useState<Overview | null>(null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    api.get<Overview>('/admin/overview').then(setData).catch(() => setErr(true));
  }, []);

  if (err) return <div className="p-8 text-stone-500">Couldn't load the overview.</div>;
  if (!data) return <div className="p-8 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-stone-400" /></div>;

  const cards = [
    { label: 'Total users', value: data.counts.users, icon: Users },
    { label: 'Admins', value: data.counts.admins, icon: ShieldCheck },
    { label: 'Suspended', value: data.counts.suspended, icon: Ban },
    { label: 'Active recipes', value: data.counts.active_recipes, icon: BookOpen },
  ];

  return (
    <div className="max-w-5xl mx-auto px-8 py-8">
      <h1 className="font-display text-[26px] font-semibold text-stone-900 mb-6">Overview</h1>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
        {cards.map((c) => (
          <div key={c.label} className="bg-white border border-stone-200 rounded-xl p-4">
            <div className="flex items-center gap-2 text-stone-400 mb-2"><c.icon className="w-4 h-4" /></div>
            <div className="text-[28px] font-semibold text-stone-900 leading-none">{c.value}</div>
            <div className="text-[12px] text-stone-500 mt-1">{c.label}</div>
          </div>
        ))}
      </div>

      <h2 className="font-display text-[18px] font-semibold text-stone-900 mb-3">Subscription tiers</h2>
      <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
        <table className="w-full text-[13px]">
          <thead className="bg-stone-50 text-stone-500">
            <tr>
              <th className="text-left font-medium px-4 py-2.5">Tier</th>
              <th className="text-left font-medium px-4 py-2.5">Monthly cost</th>
              <th className="text-left font-medium px-4 py-2.5">Default</th>
            </tr>
          </thead>
          <tbody>
            {data.tiers.map((t) => (
              <tr key={t.id} className="border-t border-stone-100">
                <td className="px-4 py-2.5 font-medium text-stone-800">{t.tier_name}</td>
                <td className="px-4 py-2.5 text-stone-600">£{Number(t.monthly_cost).toFixed(2)}</td>
                <td className="px-4 py-2.5 text-stone-600">{Number(t.is_default) === 1 ? 'Yes' : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[12px] text-stone-400 mt-3">Editing tier limits & features arrives in the Tier Manager (Phase 3).</p>
    </div>
  );
}
