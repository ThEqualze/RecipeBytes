import { useState } from 'react';
import { Sparkles, X, Music2, Instagram, Facebook, Youtube, Globe } from 'lucide-react';

interface ImportModalProps {
  open: boolean;
  onClose: () => void;
}

export function ImportModal({ open, onClose }: ImportModalProps) {
  const [url, setUrl] = useState('');
  const [submitted, setSubmitted] = useState(false);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 bg-stone-900/30 backdrop-blur-sm flex items-center justify-center z-50 px-4 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl border border-stone-200 shadow-2xl w-full max-w-lg p-7 relative"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 w-8 h-8 rounded-md hover:bg-stone-100 flex items-center justify-center text-stone-500"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-2 text-accent-700 text-[12px] uppercase tracking-wider font-semibold mb-2">
          <Sparkles className="w-3.5 h-3.5" />
          AI extraction
        </div>
        <h2 className="font-display text-[26px] font-semibold text-stone-900 leading-tight mb-2">
          Import a recipe from a link
        </h2>
        <p className="text-[14px] text-stone-500 leading-relaxed mb-5">
          Paste any TikTok, Instagram Reel, YouTube video, or recipe blog URL. We'll
          transcribe the audio, scan on-screen text, and structure it into a recipe.
        </p>

        <div className="flex items-center gap-1.5 mb-3">
          {[Music2, Instagram, Facebook, Youtube, Globe].map((Icon, i) => (
            <span
              key={i}
              className="w-8 h-8 rounded-md bg-stone-100 flex items-center justify-center text-stone-500"
            >
              <Icon className="w-4 h-4" />
            </span>
          ))}
        </div>

        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://tiktok.com/@chef/video/..."
          className="w-full px-3.5 py-3 text-[14px] bg-stone-50 border border-stone-200 rounded-lg placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-900/5 focus:border-stone-300 mb-4"
        />

        <div className="flex items-center gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-[13px] font-medium text-stone-700 hover:bg-stone-100 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => {
              setSubmitted(true);
              setTimeout(() => {
                setSubmitted(false);
                setUrl('');
                onClose();
              }, 1100);
            }}
            disabled={!url || submitted}
            className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-stone-900 hover:bg-stone-800 disabled:bg-stone-300 disabled:cursor-not-allowed text-white text-[13px] font-medium rounded-lg transition-colors"
          >
            <Sparkles className="w-3.5 h-3.5" />
            {submitted ? 'Queued for extraction…' : 'Extract recipe'}
          </button>
        </div>

        <div className="mt-5 p-3 rounded-lg bg-stone-50 border border-stone-100">
          <div className="text-[11px] uppercase tracking-wider font-semibold text-stone-500 mb-1">
            How it works
          </div>
          <ol className="text-[12px] text-stone-600 leading-relaxed list-decimal list-inside space-y-0.5">
            <li>Fetch the source video or page</li>
            <li>Transcribe audio + OCR on-screen text</li>
            <li>Synthesize into a structured recipe</li>
            <li>Land in your Inbox for review</li>
          </ol>
        </div>
      </div>
    </div>
  );
}
