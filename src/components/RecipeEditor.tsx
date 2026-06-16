import { useState, useRef } from 'react';
import {
  ArrowLeft,
  Plus,
  Trash2,
  GripVertical,
  Image as ImageIcon,
  Clock,
  Users,
  Save,
  Upload,
  Loader2,
  X,
  Sparkles,
} from 'lucide-react';
import { api, ApiError } from '../lib/api';
import type { Recipe, Ingredient, Instruction, Folder, Tag } from '../lib/database.types';

export interface RecipeFormData {
  title: string;
  description: string;
  cover_image_url: string;
  source_url: string;
  source_author: string;
  folder_id: string | null;
  prep_time_minutes: number;
  cook_time_minutes: number;
  total_time_minutes: number;
  yield_amount: number;
  yield_unit: string;
  notes: string;
  tagIds: string[];
  ingredients: IngredientRow[];
  instructions: InstructionRow[];
}

export interface IngredientRow {
  id?: string;
  quantity: string;
  unit: string;
  name: string;
  prep_note: string;
  group_name: string;
}

export interface InstructionRow {
  id?: string;
  content: string;
  timer_seconds: string;
  group_name: string;
}

interface RecipeEditorProps {
  mode: 'create' | 'edit';
  recipe?: Recipe;
  initialForm?: RecipeFormData;
  initialIngredients?: Ingredient[];
  initialInstructions?: Instruction[];
  folders: Folder[];
  tags: Tag[];
  onSave: (data: RecipeFormData) => Promise<void>;
  onDelete?: () => void;
  onCancel: () => void;
  onImport?: () => void;
}

const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

function emptyIngredient(): IngredientRow {
  return { quantity: '', unit: '', name: '', prep_note: '', group_name: '' };
}

function emptyInstruction(): InstructionRow {
  return { content: '', timer_seconds: '', group_name: '' };
}

export function RecipeEditor({
  mode,
  recipe,
  initialForm,
  initialIngredients,
  initialInstructions,
  folders,
  tags,
  onSave,
  onDelete,
  onCancel,
  onImport,
}: RecipeEditorProps) {
  const seed = mode === 'create' ? initialForm : undefined;
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState(seed?.title ?? recipe?.title ?? '');
  const [description, setDescription] = useState(seed?.description ?? recipe?.description ?? '');
  const [coverUrl, setCoverUrl] = useState(seed?.cover_image_url ?? recipe?.cover_image_url ?? '');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleCoverFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-picking the same file later
    if (!file) return;
    if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
      setUploadError('Use a JPEG, PNG, WebP, or GIF image.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setUploadError('Image must be 5 MB or smaller.');
      return;
    }
    setUploadError('');
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const data = await api.upload<{ url: string }>('/uploads', fd);
      setCoverUrl(data.url);
    } catch (err) {
      setUploadError(err instanceof ApiError ? err.message : 'Upload failed.');
    } finally {
      setUploading(false);
    }
  };

  const [sourceUrl, setSourceUrl] = useState(seed?.source_url ?? recipe?.source_url ?? '');
  const [sourceAuthor, setSourceAuthor] = useState(seed?.source_author ?? recipe?.source_author ?? '');
  const [folderId, setFolderId] = useState<string | null>(seed?.folder_id ?? recipe?.folder_id ?? null);
  const [prepTime, setPrepTime] = useState(
    seed ? String(seed.prep_time_minutes || '') : String(recipe?.prep_time_minutes ?? '')
  );
  const [cookTime, setCookTime] = useState(
    seed ? String(seed.cook_time_minutes || '') : String(recipe?.cook_time_minutes ?? '')
  );
  const [yieldAmount, setYieldAmount] = useState(
    seed ? String(seed.yield_amount || '') : String(recipe?.yield_amount ?? '')
  );
  const [yieldUnit, setYieldUnit] = useState(seed?.yield_unit ?? recipe?.yield_unit ?? 'servings');
  const [notes, setNotes] = useState(seed?.notes ?? recipe?.notes ?? '');
  const [selectedTags, setSelectedTags] = useState<string[]>(seed?.tagIds ?? []);
  const [ingredients, setIngredients] = useState<IngredientRow[]>(
    seed
      ? seed.ingredients.length
        ? seed.ingredients.map((i) => ({ ...i }))
        : [emptyIngredient()]
      : initialIngredients?.length
      ? initialIngredients.map((i) => ({
          id: i.id,
          quantity: i.quantity != null ? String(i.quantity) : '',
          unit: i.unit,
          name: i.name,
          prep_note: i.prep_note,
          group_name: i.group_name,
        }))
      : [emptyIngredient()]
  );
  const [instructions, setInstructions] = useState<InstructionRow[]>(
    seed
      ? seed.instructions.length
        ? seed.instructions.map((s) => ({ ...s }))
        : [emptyInstruction()]
      : initialInstructions?.length
      ? initialInstructions.map((s) => ({
          id: s.id,
          content: s.content,
          timer_seconds: s.timer_seconds != null ? String(s.timer_seconds) : '',
          group_name: s.group_name,
        }))
      : [emptyInstruction()]
  );
  const [confirmDelete, setConfirmDelete] = useState(false);

  const updateIngredient = (idx: number, patch: Partial<IngredientRow>) =>
    setIngredients((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  const removeIngredient = (idx: number) =>
    setIngredients((prev) => prev.filter((_, i) => i !== idx));
  const addIngredient = () => setIngredients((prev) => [...prev, emptyIngredient()]);

  const updateInstruction = (idx: number, patch: Partial<InstructionRow>) =>
    setInstructions((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  const removeInstruction = (idx: number) =>
    setInstructions((prev) => prev.filter((_, i) => i !== idx));
  const addInstruction = () => setInstructions((prev) => [...prev, emptyInstruction()]);

  const toggleTag = (id: string) =>
    setSelectedTags((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const handleSubmit = async () => {
    if (!title.trim()) return;
    setSaving(true);
    const prep = parseInt(prepTime) || 0;
    const cook = parseInt(cookTime) || 0;
    await onSave({
      title: title.trim(),
      description: description.trim(),
      cover_image_url: coverUrl.trim(),
      source_url: sourceUrl.trim(),
      source_author: sourceAuthor.trim(),
      folder_id: folderId,
      prep_time_minutes: prep,
      cook_time_minutes: cook,
      total_time_minutes: prep + cook,
      yield_amount: parseFloat(yieldAmount) || 0,
      yield_unit: yieldUnit.trim() || 'servings',
      notes: notes.trim(),
      tagIds: selectedTags,
      ingredients: ingredients.filter((r) => r.name.trim()),
      instructions: instructions.filter((r) => r.content.trim()),
    });
    setSaving(false);
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto scrollbar-thin animate-fade-in bg-stone-50">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-white/95 backdrop-blur border-b border-stone-200 px-4 sm:px-6 lg:px-10 py-3 flex items-center justify-between">
        <button
          onClick={onCancel}
          className="inline-flex items-center gap-1.5 text-[13px] text-stone-600 hover:text-stone-900 font-medium px-2 py-1.5 rounded-md hover:bg-stone-100 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Cancel
        </button>
        <div className="flex items-center gap-2">
          {mode === 'create' && onImport && (
            <button
              onClick={onImport}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[13px] font-medium text-accent-700 bg-accent-50 hover:bg-accent-100 rounded-lg transition-colors"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span className="sm:hidden">Import</span>
              <span className="hidden sm:inline">Import from link or image</span>
            </button>
          )}
          {mode === 'edit' && onDelete && (
            <button
              onClick={() => {
                if (confirmDelete) onDelete();
                else setConfirmDelete(true);
              }}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-[13px] font-medium rounded-lg transition-colors ${
                confirmDelete
                  ? 'bg-rose-600 text-white hover:bg-rose-700'
                  : 'text-rose-600 hover:bg-rose-50'
              }`}
            >
              <Trash2 className="w-3.5 h-3.5" />
              {confirmDelete ? 'Confirm delete' : 'Delete'}
            </button>
          )}
          <button
            onClick={handleSubmit}
            disabled={!title.trim() || saving}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-stone-900 hover:bg-stone-800 disabled:bg-stone-300 text-white text-[13px] font-medium rounded-lg transition-colors"
          >
            <Save className="w-3.5 h-3.5" />
            {saving ? 'Saving...' : mode === 'create' ? 'Create recipe' : 'Save changes'}
          </button>
        </div>
      </div>

      <div className="flex-1 max-w-3xl w-full mx-auto px-4 sm:px-6 lg:px-10 py-6 sm:py-8 space-y-8 sm:space-y-10">
        {/* Basics */}
        <section className="space-y-4">
          <SectionLabel>Basics</SectionLabel>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Recipe title"
            className="w-full font-display text-[28px] font-semibold text-stone-900 bg-transparent border-0 border-b-2 border-stone-200 focus:border-stone-900 focus:outline-none placeholder:text-stone-300 pb-2 transition-colors"
          />
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="A short description..."
            rows={2}
            className="w-full text-[14px] text-stone-700 bg-transparent border border-stone-200 rounded-lg px-3 py-2.5 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-900/5 focus:border-stone-300 resize-none"
          />

          <div className="space-y-2">
            <label className="text-[11px] uppercase tracking-wider font-semibold text-stone-500 block">
              Cover image
            </label>
            <div className="flex items-center gap-3">
              <div className="flex-1 relative">
                <ImageIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
                <input
                  type="url"
                  value={coverUrl}
                  onChange={(e) => { setCoverUrl(e.target.value); setUploadError(''); }}
                  placeholder="Paste an image URL…"
                  className="w-full pl-9 pr-3 py-2 text-[13px] bg-white border border-stone-200 rounded-lg placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-900/5 focus:border-stone-300"
                />
              </div>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading || saving}
                className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 text-[13px] font-medium text-stone-700 bg-white border border-stone-200 rounded-lg hover:bg-stone-50 disabled:opacity-50"
              >
                {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                {uploading ? 'Uploading…' : 'Upload'}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                onChange={handleCoverFile}
                className="hidden"
              />
              {coverUrl && (
                <div className="w-16 h-16 rounded-lg overflow-hidden border border-stone-200 shrink-0">
                  <img src={coverUrl} alt="" className="w-full h-full object-cover" />
                </div>
              )}
            </div>
            {uploadError && <p className="text-[12px] text-red-600">{uploadError}</p>}
          </div>
        </section>

        {/* Source + folder */}
        <section className="space-y-4">
          <SectionLabel>Source &amp; Organization</SectionLabel>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Source URL">
              <input
                type="url"
                value={sourceUrl}
                onChange={(e) => setSourceUrl(e.target.value)}
                placeholder="https://..."
                className="input-field"
              />
            </Field>
            <Field label="Author">
              <input
                type="text"
                value={sourceAuthor}
                onChange={(e) => setSourceAuthor(e.target.value)}
                placeholder="Author name"
                className="input-field"
              />
            </Field>
          </div>
          <Field label="Folder">
            <select
              value={folderId ?? ''}
              onChange={(e) => setFolderId(e.target.value || null)}
              className="input-field"
            >
              <option value="">No folder</option>
              {folders.map((f) => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>
          </Field>

          {tags.length > 0 && (
            <div>
              <label className="text-[11px] uppercase tracking-wider font-semibold text-stone-500 mb-2 block">
                Tags
              </label>
              <div className="flex flex-wrap gap-1.5">
                {tags.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => toggleTag(t.id)}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[12px] font-medium border transition-colors ${
                      selectedTags.includes(t.id)
                        ? 'bg-stone-900 text-white border-stone-900'
                        : 'bg-white text-stone-600 border-stone-200 hover:border-stone-300'
                    }`}
                  >
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: t.color }} />
                    {t.name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* Timing */}
        <section className="space-y-4">
          <SectionLabel>Timing &amp; Yield</SectionLabel>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Field label="Prep (min)" icon={<Clock className="w-3.5 h-3.5 text-stone-400" />}>
              <input
                type="number"
                min={0}
                value={prepTime}
                onChange={(e) => setPrepTime(e.target.value)}
                placeholder="0"
                className="input-field"
              />
            </Field>
            <Field label="Cook (min)" icon={<Clock className="w-3.5 h-3.5 text-stone-400" />}>
              <input
                type="number"
                min={0}
                value={cookTime}
                onChange={(e) => setCookTime(e.target.value)}
                placeholder="0"
                className="input-field"
              />
            </Field>
            <Field label="Yield" icon={<Users className="w-3.5 h-3.5 text-stone-400" />}>
              <input
                type="number"
                min={0}
                step="any"
                value={yieldAmount}
                onChange={(e) => setYieldAmount(e.target.value)}
                placeholder="4"
                className="input-field"
              />
            </Field>
            <Field label="Unit">
              <input
                type="text"
                value={yieldUnit}
                onChange={(e) => setYieldUnit(e.target.value)}
                placeholder="servings"
                className="input-field"
              />
            </Field>
          </div>
        </section>

        {/* Ingredients */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <SectionLabel>Ingredients</SectionLabel>
            <span className="text-[12px] text-stone-500">{ingredients.filter((i) => i.name.trim()).length} items</span>
          </div>
          <div className="space-y-2">
            {ingredients.map((row, idx) => (
              <div key={idx} className="flex flex-wrap sm:flex-nowrap items-center gap-2 group">
                <GripVertical className="w-4 h-4 text-stone-300 shrink-0 hidden sm:block opacity-0 group-hover:opacity-100 transition-opacity" />
                <input
                  type="text"
                  value={row.quantity}
                  onChange={(e) => updateIngredient(idx, { quantity: e.target.value })}
                  placeholder="Qty"
                  className="w-14 sm:w-16 px-2 py-2 text-[13px] bg-white border border-stone-200 rounded-md placeholder:text-stone-400 focus:outline-none focus:border-stone-400 text-center tabular-nums"
                />
                <input
                  type="text"
                  value={row.unit}
                  onChange={(e) => updateIngredient(idx, { unit: e.target.value })}
                  placeholder="Unit"
                  className="w-14 sm:w-16 px-2 py-2 text-[13px] bg-white border border-stone-200 rounded-md placeholder:text-stone-400 focus:outline-none focus:border-stone-400"
                />
                <input
                  type="text"
                  value={row.name}
                  onChange={(e) => updateIngredient(idx, { name: e.target.value })}
                  placeholder="Ingredient name"
                  className="flex-1 min-w-[120px] px-2.5 py-2 text-[13px] bg-white border border-stone-200 rounded-md placeholder:text-stone-400 focus:outline-none focus:border-stone-400"
                />
                <input
                  type="text"
                  value={row.prep_note}
                  onChange={(e) => updateIngredient(idx, { prep_note: e.target.value })}
                  placeholder="Prep note"
                  className="w-full sm:w-28 px-2 py-2 text-[13px] bg-white border border-stone-200 rounded-md placeholder:text-stone-400 focus:outline-none focus:border-stone-400"
                />
                <button
                  onClick={() => removeIngredient(idx)}
                  className="w-7 h-7 rounded-md text-stone-400 hover:text-rose-600 hover:bg-rose-50 flex items-center justify-center sm:opacity-0 group-hover:opacity-100 transition-all"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
          <button
            onClick={addIngredient}
            className="inline-flex items-center gap-1.5 text-[13px] font-medium text-stone-600 hover:text-stone-900 px-2 py-1.5 rounded-md hover:bg-stone-100 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Add ingredient
          </button>
        </section>

        {/* Instructions */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <SectionLabel>Instructions</SectionLabel>
            <span className="text-[12px] text-stone-500">{instructions.filter((s) => s.content.trim()).length} steps</span>
          </div>
          <div className="space-y-3">
            {instructions.map((row, idx) => (
              <div key={idx} className="flex gap-3 group">
                <div className="shrink-0 pt-2.5">
                  <div className="w-6 h-6 rounded-full bg-stone-200 text-[11px] font-semibold text-stone-600 flex items-center justify-center tabular-nums">
                    {idx + 1}
                  </div>
                </div>
                <div className="flex-1 space-y-1.5">
                  <textarea
                    value={row.content}
                    onChange={(e) => updateInstruction(idx, { content: e.target.value })}
                    placeholder={`Step ${idx + 1}...`}
                    rows={2}
                    className="w-full px-3 py-2 text-[13px] bg-white border border-stone-200 rounded-lg placeholder:text-stone-400 focus:outline-none focus:border-stone-400 resize-none leading-relaxed"
                  />
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={0}
                      value={row.timer_seconds}
                      onChange={(e) => updateInstruction(idx, { timer_seconds: e.target.value })}
                      placeholder="Timer (seconds)"
                      className="w-40 px-2 py-1.5 text-[12px] bg-stone-50 border border-stone-200 rounded-md placeholder:text-stone-400 focus:outline-none focus:border-stone-400"
                    />
                    <span className="text-[11px] text-stone-400">optional timer</span>
                  </div>
                </div>
                <button
                  onClick={() => removeInstruction(idx)}
                  className="mt-2.5 w-7 h-7 rounded-md text-stone-400 hover:text-rose-600 hover:bg-rose-50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all shrink-0"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
          <button
            onClick={addInstruction}
            className="inline-flex items-center gap-1.5 text-[13px] font-medium text-stone-600 hover:text-stone-900 px-2 py-1.5 rounded-md hover:bg-stone-100 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Add step
          </button>
        </section>

        {/* Notes */}
        <section className="space-y-3 pb-12">
          <SectionLabel>Notes</SectionLabel>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Personal notes, variations, tips..."
            rows={3}
            className="w-full text-[14px] text-stone-700 bg-white border border-stone-200 rounded-lg px-3 py-2.5 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-900/5 focus:border-stone-300 resize-none"
          />
        </section>
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-[11px] uppercase tracking-wider font-semibold text-stone-500">
      {children}
    </h2>
  );
}

function Field({
  label,
  icon,
  children,
}: {
  label: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="text-[11px] uppercase tracking-wider font-semibold text-stone-500 mb-1 flex items-center gap-1">
        {icon}
        {label}
      </label>
      {children}
    </div>
  );
}
