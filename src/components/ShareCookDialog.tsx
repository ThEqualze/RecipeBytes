import { useState, useRef, useEffect } from 'react';
import { X, Upload, Loader2, Share2, Link2, Download, Check } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { cookCaption, shareUrl, networkShareLinks, canShareFiles } from '../lib/share';

interface ShareCookDialogProps {
  recipe: { id: string; title: string; description: string; cover_image_url: string; cook_image_url: string };
  onClose: () => void;
  onUpdated: () => void;
}

export function ShareCookDialog({ recipe, onClose, onUpdated }: ShareCookDialogProps) {
  const [cookUrl, setCookUrl] = useState(recipe.cook_image_url || '');
  const [pickedFile, setPickedFile] = useState<File | null>(null);
  // A File kept ready ahead of the tap so navigator.share() can be called
  // synchronously inside the click — mobile (esp. iOS) blocks share() if you
  // await anything (like fetching the image) first.
  const [shareFile, setShareFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [publicOn, setPublicOn] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Seed the toggle from the recipe's current public state.
  useEffect(() => {
    let active = true;
    api.get<{ token: string | null }>(`/recipes/${recipe.id}/share`)
      .then((data) => { if (active && data.token) { setToken(data.token); setPublicOn(true); } })
      .catch(() => { /* leave as private if status can't be loaded */ });
    return () => { active = false; };
  }, [recipe.id]);

  // Keep a shareable File ready: the just-picked file, or fetched from the
  // stored photo URL. Done ahead of time so the Share tap stays synchronous.
  useEffect(() => {
    if (pickedFile) { setShareFile(pickedFile); return; }
    if (!cookUrl) { setShareFile(null); return; }
    let active = true;
    fetch(cookUrl)
      .then((r) => (r.ok ? r.blob() : null))
      .then((blob) => {
        if (!active || !blob) return;
        const ext = (blob.type.split('/')[1] || 'jpg').replace('jpeg', 'jpg');
        setShareFile(new File([blob], `dish.${ext}`, { type: blob.type }));
      })
      .catch(() => { /* fall back to a link/text-only share */ });
    return () => { active = false; };
  }, [cookUrl, pickedFile]);

  const origin = window.location.origin;
  const caption = cookCaption(recipe.title);
  const linkUrl = shareUrl(publicOn, token, origin);

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const ok = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!ok.includes(file.type)) { setError('Use a JPEG, PNG, WebP, or GIF image.'); return; }
    if (file.size > 5 * 1024 * 1024) { setError('Image must be 5 MB or smaller.'); return; }
    setError('');
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const data = await api.upload<{ url: string }>('/uploads', fd);
      await api.patch(`/recipes/${recipe.id}`, { cook_image_url: data.url });
      setCookUrl(data.url);
      setPickedFile(file);
      onUpdated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Upload failed.');
    } finally {
      setUploading(false);
    }
  };

  const togglePublic = async () => {
    setBusy(true);
    setError('');
    try {
      if (!publicOn) {
        const data = await api.post<{ token: string }>(`/recipes/${recipe.id}/share`);
        setToken(data.token);
        setPublicOn(true);
      } else {
        await api.del(`/recipes/${recipe.id}/share`);
        setToken(null);
        setPublicOn(false);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not update sharing.');
    } finally {
      setBusy(false);
    }
  };

  // Open the native share sheet. Called synchronously from the tap (no awaits
  // before navigator.share) so mobile browsers keep the user-activation that
  // share() requires; the shareable File was prepared ahead of time.
  const nativeShare = () => {
    setError('');
    const text = `${caption}${publicOn && token ? ` ${linkUrl}` : ''}`;
    const url = publicOn && token ? linkUrl : undefined;
    if (typeof navigator.share !== 'function') {
      setError('Sharing isn’t supported here — use the buttons below.');
      return;
    }
    const data: ShareData = shareFile && canShareFiles(shareFile)
      ? { files: [shareFile], text, url }
      : { text, url };
    navigator.share(data).catch(() => { /* sheet dismissed/cancelled — ignore */ });
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(linkUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setError('Could not copy — please copy the link manually.');
    }
  };

  const net = networkShareLinks(linkUrl, caption, cookUrl || undefined);
  const hasPhoto = !!cookUrl;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4" onClick={onClose}>
      <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-[15px] font-semibold text-stone-900">Share your cook</h2>
          <button onClick={onClose} aria-label="Close" className="p-1 text-stone-400 hover:text-stone-600"><X className="w-5 h-5" /></button>
        </div>

        {/* Photo */}
        <div className="flex items-center gap-3">
          <div className="w-20 h-20 rounded-xl overflow-hidden border border-stone-200 bg-stone-100 shrink-0">
            {hasPhoto && <img src={cookUrl} alt="" className="w-full h-full object-cover" />}
          </div>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-[13px] font-medium text-stone-700 bg-white border border-stone-200 rounded-lg hover:bg-stone-50 disabled:opacity-50"
          >
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            {uploading ? 'Uploading…' : hasPhoto ? 'Replace photo' : 'Add a photo'}
          </button>
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" capture="environment" onChange={onPick} className="hidden" />
        </div>

        {/* Public toggle */}
        <div className="flex items-center justify-between gap-3 py-2">
          <span id="public-toggle-label" className="text-[13px] text-stone-700">Make this recipe public<br /><span className="text-[12px] text-stone-400">People who open your link can view the recipe.</span></span>
          <button
            type="button"
            role="switch"
            aria-checked={publicOn}
            aria-labelledby="public-toggle-label"
            onClick={togglePublic}
            disabled={busy}
            className={`relative w-11 h-6 rounded-full transition-colors ${publicOn ? 'bg-emerald-500' : 'bg-stone-300'} disabled:opacity-50`}
          >
            <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${publicOn ? 'translate-x-5' : ''}`} />
          </button>
        </div>

        {error && <p className="text-[12px] text-red-600">{error}</p>}

        {/* Primary share */}
        <button
          type="button"
          onClick={nativeShare}
          disabled={!hasPhoto && !publicOn}
          className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-[14px] font-semibold text-white bg-stone-900 rounded-xl hover:bg-stone-800 disabled:opacity-40"
        >
          <Share2 className="w-4 h-4" /> Share
        </button>

        {/* Fallback links */}
        <div className="flex flex-wrap gap-2">
          {publicOn && token && (
            <>
              <a href={net.x} target="_blank" rel="noreferrer" className="px-3 py-1.5 text-[12px] border border-stone-200 rounded-lg hover:bg-stone-50">X</a>
              <a href={net.facebook} target="_blank" rel="noreferrer" className="px-3 py-1.5 text-[12px] border border-stone-200 rounded-lg hover:bg-stone-50">Facebook</a>
              <a href={net.whatsapp} target="_blank" rel="noreferrer" className="px-3 py-1.5 text-[12px] border border-stone-200 rounded-lg hover:bg-stone-50">WhatsApp</a>
              <a href={net.pinterest} target="_blank" rel="noreferrer" className="px-3 py-1.5 text-[12px] border border-stone-200 rounded-lg hover:bg-stone-50">Pinterest</a>
              <button type="button" onClick={copyLink} className="inline-flex items-center gap-1 px-3 py-1.5 text-[12px] border border-stone-200 rounded-lg hover:bg-stone-50">
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Link2 className="w-3.5 h-3.5" />} Copy link
              </button>
            </>
          )}
          {cookUrl && (
            <a href={cookUrl} download className="inline-flex items-center gap-1 px-3 py-1.5 text-[12px] border border-stone-200 rounded-lg hover:bg-stone-50">
              <Download className="w-3.5 h-3.5" /> Save image
            </a>
          )}
        </div>
        <p className="text-[11px] text-stone-400">Instagram: tap Share on your phone and pick Instagram, or save the image and post it from the app.</p>
      </div>
    </div>
  );
}
