import { useEffect, useRef, useState } from 'react';
import {
  Sparkles, X, Music2, Instagram, Facebook, Youtube, Globe, Loader2,
  Link2, Camera, ImagePlus,
} from 'lucide-react';
import { api, ApiError } from '../lib/api';
import type { RecipeFormData } from './RecipeEditor';

interface ImportModalProps {
  open: boolean;
  onClose: () => void;
  onImported: (data: RecipeFormData) => void;
}

type Mode = 'link' | 'photo';

const MAX_FILES = 6;
const MAX_BYTES = 5 * 1024 * 1024;

export function ImportModal({ open, onClose, onImported }: ImportModalProps) {
  const [mode, setMode] = useState<Mode>('link');
  const [url, setUrl] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Build object URLs for thumbnails; revoke them when the list changes/unmounts.
  useEffect(() => {
    const urls = files.map((f) => URL.createObjectURL(f));
    setPreviews(urls);
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, [files]);

  if (!open) return null;

  const reset = () => {
    setUrl('');
    setFiles([]);
    setError(null);
    setBusy(false);
  };

  const close = () => { reset(); setMode('link'); onClose(); };

  const switchMode = (m: Mode) => { setMode(m); setError(null); };

  const submitLink = async () => {
    if (!url || busy) return;
    setBusy(true);
    setError(null);
    try {
      const data = await api.post<RecipeFormData>('/import', { url });
      reset();
      onImported(data);
    } catch (e) {
      setBusy(false);
      setError(e instanceof ApiError ? e.message : 'Something went wrong importing that link.');
    }
  };

  const addFiles = (incoming: FileList | null) => {
    if (!incoming) return;
    setError(null);
    const next = [...files];
    for (const f of Array.from(incoming)) {
      if (!f.type.startsWith('image/')) { setError('Only image files are supported.'); continue; }
      if (f.size > MAX_BYTES) { setError('Each photo must be 5 MB or smaller.'); continue; }
      if (next.some((x) => x.name === f.name && x.size === f.size)) continue; // de-dupe
      if (next.length >= MAX_FILES) { setError(`You can add up to ${MAX_FILES} photos.`); break; }
      next.push(f);
    }
    setFiles(next);
    if (fileInputRef.current) fileInputRef.current.value = ''; // allow re-picking the same file
  };

  const removeFile = (i: number) => setFiles(files.filter((_, idx) => idx !== i));

  const submitPhotos = async () => {
    if (files.length === 0 || busy) return;
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      files.forEach((f) => form.append('files[]', f));
      const data = await api.upload<RecipeFormData>('/import/photo', form);
      reset();
      onImported(data);
    } catch (e) {
      setBusy(false);
      setError(e instanceof ApiError ? e.message : 'Something went wrong reading that photo.');
    }
  };

  const tabClass = (m: Mode) =>
    `flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-[13px] font-medium rounded-lg transition-colors ${
      mode === m ? 'bg-stone-900 text-white' : 'text-stone-600 hover:bg-stone-100'
    }`;

  return (
    <div
      className="fixed inset-0 bg-stone-900/30 backdrop-blur-sm flex items-center justify-center z-50 px-4 animate-fade-in"
      onClick={close}
    >
      <div
        className="bg-white rounded-2xl border border-stone-200 shadow-2xl w-full max-w-lg p-7 relative"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={close}
          className="absolute top-4 right-4 w-8 h-8 rounded-md hover:bg-stone-100 flex items-center justify-center text-stone-500"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-2 text-accent-700 text-[12px] uppercase tracking-wider font-semibold mb-2">
          <Sparkles className="w-3.5 h-3.5" />
          AI extraction
        </div>

        <div className="flex items-center gap-1.5 p-1 bg-stone-100 rounded-xl mb-5">
          <button onClick={() => switchMode('link')} className={tabClass('link')}>
            <Link2 className="w-3.5 h-3.5" /> From link
          </button>
          <button onClick={() => switchMode('photo')} className={tabClass('photo')}>
            <Camera className="w-3.5 h-3.5" /> From photo
          </button>
        </div>

        {mode === 'link' ? (
          <>
            <h2 className="font-display text-[26px] font-semibold text-stone-900 leading-tight mb-2">
              Import a recipe from a link
            </h2>
            <p className="text-[14px] text-stone-500 leading-relaxed mb-5">
              Paste a recipe blog or web page URL. We'll pull the recipe and open it in the
              editor for you to review.
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
              onKeyDown={(e) => { if (e.key === 'Enter') submitLink(); }}
              placeholder="https://example.com/best-pancakes"
              className="w-full px-3.5 py-3 text-[14px] bg-stone-50 border border-stone-200 rounded-lg placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-900/5 focus:border-stone-300 mb-3"
            />

            {error && (
              <div className="mb-3 text-[13px] text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                {error}
              </div>
            )}

            <div className="flex items-center gap-2">
              <button
                onClick={close}
                className="px-4 py-2 text-[13px] font-medium text-stone-700 hover:bg-stone-100 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={submitLink}
                disabled={!url || busy}
                className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-stone-900 hover:bg-stone-800 disabled:bg-stone-300 disabled:cursor-not-allowed text-white text-[13px] font-medium rounded-lg transition-colors"
              >
                {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                {busy ? 'Extracting…' : 'Extract recipe'}
              </button>
            </div>
          </>
        ) : (
          <>
            <h2 className="font-display text-[26px] font-semibold text-stone-900 leading-tight mb-2">
              Snap a recipe card
            </h2>
            <p className="text-[14px] text-stone-500 leading-relaxed mb-5">
              Take or upload photos of a meal-plan card (e.g. Gousto). Add both sides if the
              steps are on the back. We'll read them and open the recipe in the editor.
            </p>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => addFiles(e.target.files)}
            />

            {files.length > 0 && (
              <div className="grid grid-cols-3 gap-2 mb-3">
                {previews.map((src, i) => (
                  <div key={i} className="relative aspect-square rounded-lg overflow-hidden border border-stone-200 bg-stone-50">
                    <img src={src} alt={`Photo ${i + 1}`} className="w-full h-full object-cover" />
                    <button
                      onClick={() => removeFile(i)}
                      className="absolute top-1 right-1 w-6 h-6 rounded-md bg-stone-900/70 hover:bg-stone-900 text-white flex items-center justify-center"
                      aria-label="Remove photo"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                    {i === 0 && (
                      <span className="absolute bottom-1 left-1 text-[10px] font-medium text-white bg-stone-900/70 rounded px-1.5 py-0.5">
                        Cover
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}

            {files.length < MAX_FILES && (
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full flex flex-col items-center justify-center gap-2 px-4 py-6 mb-3 border-2 border-dashed border-stone-200 hover:border-stone-300 hover:bg-stone-50 rounded-xl text-stone-500 transition-colors"
              >
                <ImagePlus className="w-6 h-6" />
                <span className="text-[13px] font-medium">
                  {files.length === 0 ? 'Add photos' : 'Add more photos'}
                </span>
                <span className="text-[11px] text-stone-400">JPEG, PNG, WebP or GIF · up to {MAX_FILES} · 5 MB each</span>
              </button>
            )}

            {error && (
              <div className="mb-3 text-[13px] text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                {error}
              </div>
            )}

            <div className="flex items-center gap-2">
              <button
                onClick={close}
                className="px-4 py-2 text-[13px] font-medium text-stone-700 hover:bg-stone-100 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={submitPhotos}
                disabled={files.length === 0 || busy}
                className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-stone-900 hover:bg-stone-800 disabled:bg-stone-300 disabled:cursor-not-allowed text-white text-[13px] font-medium rounded-lg transition-colors"
              >
                {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                {busy ? 'Reading…' : 'Read recipe'}
              </button>
            </div>
          </>
        )}

        <div className="mt-5 p-3 rounded-lg bg-stone-50 border border-stone-100">
          <div className="text-[11px] uppercase tracking-wider font-semibold text-stone-500 mb-1">
            How it works
          </div>
          <ol className="text-[12px] text-stone-600 leading-relaxed list-decimal list-inside space-y-0.5">
            {mode === 'link' ? (
              <>
                <li>Fetch the recipe page</li>
                <li>Read its structured recipe data (or use AI if needed)</li>
                <li>Open it pre-filled in the editor</li>
                <li>Review and save to your library</li>
              </>
            ) : (
              <>
                <li>Take or upload photo(s) of the card</li>
                <li>AI reads the title, ingredients and steps</li>
                <li>Open it pre-filled in the editor (first photo becomes the cover)</li>
                <li>Review and save to your library</li>
              </>
            )}
          </ol>
        </div>
      </div>
    </div>
  );
}
