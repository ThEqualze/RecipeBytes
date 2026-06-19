import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { Info, AlertTriangle, AlertOctagon, X } from 'lucide-react';

interface Announcement {
  id: string;
  message: string;
  type: 'info' | 'warning' | 'critical';
  link_label: string | null;
  link_url: string | null;
}

const STYLES: Record<Announcement['type'], { bar: string; Icon: typeof Info }> = {
  info:     { bar: 'bg-blue-600 text-white',  Icon: Info },
  warning:  { bar: 'bg-amber-500 text-stone-900', Icon: AlertTriangle },
  critical: { bar: 'bg-red-600 text-white',   Icon: AlertOctagon },
};

const dismissKey = (id: string) => `rb_announce_dismissed_${id}`;

export function AnnouncementBar() {
  const [ann, setAnn] = useState<Announcement | null>(null);

  useEffect(() => {
    let alive = true;
    api.get<Announcement | null>('/announcements/active')
      .then((a) => {
        if (!alive || !a) return;
        if (localStorage.getItem(dismissKey(a.id))) return;
        setAnn(a);
      })
      .catch(() => { /* a banner is non-critical; stay silent on failure */ });
    return () => { alive = false; };
  }, []);

  if (!ann) return null;

  const { bar, Icon } = STYLES[ann.type];
  const dismiss = () => {
    try { localStorage.setItem(dismissKey(ann.id), '1'); } catch { /* ignore quota */ }
    setAnn(null);
  };
  const absolute = !!ann.link_url && /^https?:\/\//i.test(ann.link_url);

  return (
    <div className={`relative z-[70] flex items-center gap-3 px-4 py-2 text-[13px] font-medium shadow-sm ${bar}`}>
      <Icon className="w-4 h-4 shrink-0" />
      <span className="flex-1 min-w-0">{ann.message}</span>
      {ann.link_url && ann.link_label && (
        <a
          href={ann.link_url}
          target={absolute ? '_blank' : undefined}
          rel={absolute ? 'noopener noreferrer' : undefined}
          className="shrink-0 underline underline-offset-2 hover:opacity-80"
        >
          {ann.link_label}
        </a>
      )}
      <button
        onClick={dismiss}
        aria-label="Dismiss announcement"
        className="shrink-0 inline-flex items-center justify-center w-6 h-6 rounded hover:bg-black/10"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
