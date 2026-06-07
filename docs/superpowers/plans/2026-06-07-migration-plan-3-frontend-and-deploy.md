# Migration Plan 3: Frontend Rewrite & Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Supabase client throughout the React frontend with calls to the Plan 1/2 PHP API, remove `@supabase/supabase-js`, fix the 27 pre-existing TypeScript errors, drop the sample-data seed, and produce the production artifacts needed to deploy to 20i — leaving the app fully self-hosted.

**Architecture:** A small `src/lib/api.ts` fetch wrapper (base `/api`, `credentials:'include'`) replaces `src/lib/supabase.ts`. Every hook in `useData.ts` and the auth context keep their existing signatures and return shapes — only their internals change from `supabase.*` to `api.*`. The 3 direct component call sites (App share, PublicRecipeView, PantryMatchView) are rewritten. The API contract is exactly what Plan 2 built; the frontend conforms to it.

**Tech Stack:** Vite + React 18 + TypeScript + Tailwind. Verification via `npm run typecheck` (must reach 0 errors) and `npm run build`.

**Builds on:** Plans 1 & 2 (DONE — full PHP API, 90 passing tests). **Spec:** `docs/superpowers/specs/2026-06-07-supabase-to-php-mysql-migration-design.md`.

## Decisions locked
- **Seed:** DROPPED. New accounts start empty. `useSeedData` and `src/data/seed.ts` are removed.
- **Deployment:** prepared here as artifacts + a runbook; the actual 20i upload is done interactively with the user (not a subagent step).

## Local environment reminders (Windows + XAMPP)
- MariaDB running on 127.0.0.1:3306; PHP API dev server on `http://127.0.0.1:8000` (`php -S 127.0.0.1:8000 router.php`). Vite dev proxies `/api` → :8000 (already configured in `vite.config.ts`).
- Verify with `npm run typecheck` and `npm run build`. Do NOT `git push` unless told. Commit after each task.

---

## File Structure (created/modified)

```
src/lib/api.ts              CREATE: fetch wrapper + ApiError
src/lib/supabase.ts         DELETE
src/contexts/AuthContext.tsx REWRITE: api-based auth, local AuthUser type
src/hooks/useData.ts        REWRITE: all hooks call api.*; useSeedData removed
src/App.tsx                 MODIFY: share create + token resolve via api; remove seed effect
src/components/PublicRecipeView.tsx  REWRITE fetch: single /public/recipes/{token} call
src/components/PantryMatchView.tsx   MODIFY: /pantry/ingredients + client-side filter
src/components/LibraryView.tsx       FIX: total_time_min -> total_time_minutes
src/components/RecipeDetail.tsx      FIX: total_time_min, servings, step.body
src/components/CollectionsView.tsx   FIX: remove unused Pencil import
src/lib/database.types.ts   FIX: GroceryListItem add is_checked/position/created_at
src/data/seed.ts            DELETE
.env                        MODIFY: remove VITE_SUPABASE_*; (VITE_API_BASE optional, defaults /api)
package.json                MODIFY: remove @supabase/supabase-js dependency
api/.htaccess               CREATE: Apache routing of /api/* -> api/index.php (production)
docs/DEPLOY-20i.md          CREATE: deployment runbook
```

---

## Task 1: API client + Auth context

**Files:**
- Create: `src/lib/api.ts`
- Rewrite: `src/contexts/AuthContext.tsx`
- Delete: `src/lib/supabase.ts`

**Context:** `api.ts` is the single chokepoint for all server calls. The API returns `{data}` on success and `{error}` with a non-2xx status on failure; the wrapper unwraps `data` or throws `ApiError`. The session endpoint returns `{data:null}` (HTTP 200) when logged out, so `api.get('/auth/session')` returns `null` without throwing. No one consumes `useAuth().session` (verified), so the context drops `session` and uses a local `AuthUser` type.

- [ ] **Step 1: Create `src/lib/api.ts`**

```ts
const BASE = (import.meta.env.VITE_API_BASE as string) || '/api';

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(BASE + path, {
    method,
    credentials: 'include',
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let json: { data?: unknown; error?: string } | null = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  if (!res.ok) {
    throw new ApiError(json?.error ?? res.statusText, res.status);
  }
  return (json?.data ?? null) as T;
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
  del: <T>(path: string, body?: unknown) => request<T>('DELETE', path, body),
};
```

- [ ] **Step 2: Rewrite `src/contexts/AuthContext.tsx`**

```tsx
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { api, ApiError } from '../lib/api';

export interface AuthUser {
  id: string;
  email: string;
  display_name?: string;
}

interface AuthState {
  user: AuthUser | null;
  loading: boolean;
  signUp: (email: string, password: string, displayName: string) => Promise<string | null>;
  signIn: (email: string, password: string) => Promise<string | null>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<AuthUser | null>('/auth/session')
      .then((u) => setUser(u))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const signUp = async (
    email: string,
    password: string,
    displayName: string
  ): Promise<string | null> => {
    try {
      const u = await api.post<AuthUser>('/auth/signup', {
        email,
        password,
        display_name: displayName,
      });
      setUser(u);
      return null;
    } catch (e) {
      return e instanceof ApiError ? e.message : 'Sign up failed';
    }
  };

  const signIn = async (email: string, password: string): Promise<string | null> => {
    try {
      const u = await api.post<AuthUser>('/auth/login', { email, password });
      setUser(u);
      return null;
    } catch (e) {
      return e instanceof ApiError ? e.message : 'Sign in failed';
    }
  };

  const signOut = async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      /* ignore */
    }
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, signUp, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
```

- [ ] **Step 3: Delete `src/lib/supabase.ts`**

```bash
rm src/lib/supabase.ts
```

- [ ] **Step 4: Partial typecheck sanity (will still have errors elsewhere)**

```bash
npm run typecheck 2>&1 | grep -E "AuthContext|api.ts" || echo "no errors in auth/api files"
```
Expected: no errors originating in `AuthContext.tsx` or `api.ts`. (Other files still reference supabase/seed and will error until later tasks — that is expected now.)

- [ ] **Step 5: Commit**

```bash
git add src/lib/api.ts src/contexts/AuthContext.tsx
git rm src/lib/supabase.ts
git commit -m "feat(fe): add API client, rewrite auth context, remove supabase client"
```

---

## Task 2: Rewrite `src/hooks/useData.ts`

**Files:**
- Rewrite: `src/hooks/useData.ts`

**Context:** Every hook keeps its EXACT exported name, parameters, and return shape (components must not change). Only the internals switch from `supabase.*` to `api.*`. `useSeedData` is REMOVED (seed dropped). Endpoint mapping:
- folders→`GET /folders`; tags→`GET /tags`; recipes list→`GET /recipes`; favorite/cooked→`PATCH /recipes/{id}`; recipe-tags→`GET /recipe-tags`; ingredients→`GET /recipes/{id}/ingredients`; instructions→`GET /recipes/{id}/instructions`; extraction-jobs→`GET /extraction-jobs`.
- grocery: `GET /grocery-list` returns `{list, items}`; add item→`POST /grocery-list/items`; from-recipe→`POST /grocery-list/items/from-recipe {recipe_id}` (server reads the recipe's ingredients — the `recipeIngredients` argument is now ignored but kept for signature compatibility); toggle→`PATCH /grocery-list/items/{id}`; remove→`DELETE /grocery-list/items/{id}`; clear→`POST /grocery-list/clear-checked`.
- recipe CRUD: create→`POST /recipes`; update→`PATCH /recipes/{id}`; delete→`DELETE /recipes/{id}`; duplicate→`POST /recipes/{id}/duplicate`. (The API accepts the existing `RecipePayload` shape verbatim.)
- meal plans: list→`GET /meal-plans?from&to`; add→`POST /meal-plans`; remove→`DELETE`; move→`PATCH`.
- collections: list→`GET /collections`; create→`POST`; update→`PATCH`; delete→`DELETE`. collection_recipes: list→`GET /collections/{id}/recipes`; add→`POST /collections/{id}/recipes`; remove→`DELETE /collections/{id}/recipes/{recipeId}`.

Reads are wrapped so a failure leaves the state empty rather than throwing (mirrors the old `data ?? []`).

- [ ] **Step 1: Replace the ENTIRE contents of `src/hooks/useData.ts` with:**

```ts
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import type {
  Folder,
  Tag,
  Recipe,
  Ingredient,
  Instruction,
  ExtractionJob,
  GroceryList,
  GroceryListItem,
  MealPlan,
  MealType,
  Collection,
  CollectionRecipe,
} from '../lib/database.types';

async function safe<T>(p: Promise<T>, fallback: T): Promise<T> {
  try {
    return await p;
  } catch {
    return fallback;
  }
}

export function useFolders(userId: string | undefined) {
  const [folders, setFolders] = useState<Folder[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    if (!userId) return;
    setFolders(await safe(api.get<Folder[]>('/folders'), []));
    setLoading(false);
  }, [userId]);

  useEffect(() => { fetch(); }, [fetch]);
  return { folders, loading, refetch: fetch };
}

export function useTags(userId: string | undefined) {
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    if (!userId) return;
    setTags(await safe(api.get<Tag[]>('/tags'), []));
    setLoading(false);
  }, [userId]);

  useEffect(() => { fetch(); }, [fetch]);
  return { tags, loading, refetch: fetch };
}

export function useRecipes(userId: string | undefined) {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    if (!userId) return;
    setRecipes(await safe(api.get<Recipe[]>('/recipes'), []));
    setLoading(false);
  }, [userId]);

  useEffect(() => { fetch(); }, [fetch]);

  const toggleFavorite = async (id: string) => {
    const recipe = recipes.find((r) => r.id === id);
    if (!recipe) return;
    const next = !recipe.is_favorite;
    setRecipes((prev) => prev.map((r) => (r.id === id ? { ...r, is_favorite: next } : r)));
    await safe(api.patch(`/recipes/${id}`, { is_favorite: next }), null);
  };

  const markCooked = async (id: string) => {
    const now = new Date().toISOString();
    setRecipes((prev) => prev.map((r) => (r.id === id ? { ...r, last_cooked_at: now } : r)));
    await safe(api.patch(`/recipes/${id}`, { last_cooked_at: now }), null);
  };

  return { recipes, loading, refetch: fetch, toggleFavorite, markCooked };
}

export function useRecipeTags(userId: string | undefined) {
  const [map, setMap] = useState<Record<string, string[]>>({});

  const fetch = useCallback(async () => {
    if (!userId) return;
    const data = await safe(api.get<{ recipe_id: string; tag_id: string }[]>('/recipe-tags'), []);
    const m: Record<string, string[]> = {};
    data.forEach((row) => {
      if (!m[row.recipe_id]) m[row.recipe_id] = [];
      m[row.recipe_id].push(row.tag_id);
    });
    setMap(m);
  }, [userId]);

  useEffect(() => { fetch(); }, [fetch]);
  return { recipeTagIds: map, refetch: fetch };
}

export function useRecipeIngredients(recipeId: string | null) {
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!recipeId) { setIngredients([]); return; }
    setLoading(true);
    safe(api.get<Ingredient[]>(`/recipes/${recipeId}/ingredients`), []).then((data) => {
      setIngredients(data);
      setLoading(false);
    });
  }, [recipeId]);

  return { ingredients, loading };
}

export function useRecipeInstructions(recipeId: string | null) {
  const [instructions, setInstructions] = useState<Instruction[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!recipeId) { setInstructions([]); return; }
    setLoading(true);
    safe(api.get<Instruction[]>(`/recipes/${recipeId}/instructions`), []).then((data) => {
      setInstructions(data);
      setLoading(false);
    });
  }, [recipeId]);

  return { instructions, loading };
}

export function useExtractionJobs(userId: string | undefined) {
  const [jobs, setJobs] = useState<ExtractionJob[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    if (!userId) return;
    setJobs(await safe(api.get<ExtractionJob[]>('/extraction-jobs'), []));
    setLoading(false);
  }, [userId]);

  useEffect(() => { fetch(); }, [fetch]);
  return { jobs, loading, refetch: fetch };
}

export function useGroceryList(userId: string | undefined) {
  const [list, setList] = useState<GroceryList | null>(null);
  const [items, setItems] = useState<GroceryListItem[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    if (!userId) return;
    const data = await safe(
      api.get<{ list: GroceryList | null; items: GroceryListItem[] }>('/grocery-list'),
      { list: null, items: [] }
    );
    setList(data.list);
    setItems(data.items);
    setLoading(false);
  }, [userId]);

  useEffect(() => { fetch(); }, [fetch]);

  const toggleItem = async (id: string) => {
    const item = items.find((i) => i.id === id);
    if (!item) return;
    const next = !item.is_checked;
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, is_checked: next } : i)));
    await safe(api.patch(`/grocery-list/items/${id}`, { is_checked: next }), null);
  };

  const addRecipeIngredients = useCallback(
    async (recipeId: string, _recipeIngredients: Ingredient[]): Promise<number> => {
      if (!userId) return 0;
      const inserted = await safe(
        api.post<GroceryListItem[]>('/grocery-list/items/from-recipe', { recipe_id: recipeId }),
        []
      );
      if (inserted.length > 0) {
        if (!list) await fetch();
        else setItems((prev) => [...prev, ...inserted]);
      }
      return inserted.length;
    },
    [userId, list, fetch]
  );

  const removeItem = async (id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
    await safe(api.del(`/grocery-list/items/${id}`), null);
  };

  const clearChecked = async () => {
    setItems((prev) => prev.filter((i) => !i.is_checked));
    await safe(api.post('/grocery-list/clear-checked'), null);
  };

  const addItem = useCallback(
    async (name: string) => {
      if (!userId) return;
      const inserted = await safe(
        api.post<GroceryListItem>('/grocery-list/items', { name }),
        null as GroceryListItem | null
      );
      if (inserted) {
        if (!list) await fetch();
        else setItems((prev) => [...prev, inserted]);
      }
    },
    [userId, list, fetch]
  );

  return { list, items, loading, refetch: fetch, toggleItem, addRecipeIngredients, removeItem, clearChecked, addItem };
}

export interface RecipePayload {
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
  ingredients: {
    quantity: string;
    unit: string;
    name: string;
    prep_note: string;
    group_name: string;
  }[];
  instructions: {
    content: string;
    timer_seconds: string;
    group_name: string;
  }[];
}

export function useRecipeCrud(userId: string | undefined) {
  const createRecipe = useCallback(
    async (data: RecipePayload): Promise<string | null> => {
      if (!userId) return null;
      const res = await safe(api.post<{ id: string }>('/recipes', data), null as { id: string } | null);
      return res?.id ?? null;
    },
    [userId]
  );

  const updateRecipe = useCallback(
    async (recipeId: string, data: RecipePayload): Promise<boolean> => {
      if (!userId) return false;
      await safe(api.patch(`/recipes/${recipeId}`, data), null);
      return true;
    },
    [userId]
  );

  const deleteRecipe = useCallback(
    async (recipeId: string): Promise<boolean> => {
      if (!userId) return false;
      await safe(api.del(`/recipes/${recipeId}`), null);
      return true;
    },
    [userId]
  );

  const duplicateRecipe = useCallback(
    async (recipeId: string): Promise<string | null> => {
      if (!userId) return null;
      const res = await safe(api.post<{ id: string }>(`/recipes/${recipeId}/duplicate`), null as { id: string } | null);
      return res?.id ?? null;
    },
    [userId]
  );

  return { createRecipe, updateRecipe, deleteRecipe, duplicateRecipe };
}

export function useMealPlan(userId: string | undefined) {
  const [plans, setPlans] = useState<MealPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [weekStart, setWeekStart] = useState<Date>(() => {
    const d = new Date();
    d.setDate(d.getDate() - d.getDay());
    d.setHours(0, 0, 0, 0);
    return d;
  });

  const weekEnd = useMemo(() => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + 6);
    return d;
  }, [weekStart]);

  const fetch = useCallback(async () => {
    if (!userId) return;
    const startStr = weekStart.toISOString().slice(0, 10);
    const endStr = weekEnd.toISOString().slice(0, 10);
    setPlans(await safe(api.get<MealPlan[]>(`/meal-plans?from=${startStr}&to=${endStr}`), []));
    setLoading(false);
  }, [userId, weekStart, weekEnd]);

  useEffect(() => { fetch(); }, [fetch]);

  const addMeal = useCallback(
    async (recipeId: string, date: string, mealType: MealType) => {
      if (!userId) return;
      const created = await safe(
        api.post<MealPlan>('/meal-plans', { recipe_id: recipeId, planned_date: date, meal_type: mealType }),
        null as MealPlan | null
      );
      if (created) setPlans((prev) => [...prev, created]);
    },
    [userId]
  );

  const removeMeal = useCallback(async (id: string) => {
    setPlans((prev) => prev.filter((p) => p.id !== id));
    await safe(api.del(`/meal-plans/${id}`), null);
  }, []);

  const moveMeal = useCallback(
    async (id: string, date: string, mealType: MealType) => {
      setPlans((prev) =>
        prev.map((p) => (p.id === id ? { ...p, planned_date: date, meal_type: mealType } : p))
      );
      await safe(api.patch(`/meal-plans/${id}`, { planned_date: date, meal_type: mealType }), null);
    },
    []
  );

  const goToPrevWeek = () => {
    setWeekStart((prev) => {
      const d = new Date(prev);
      d.setDate(d.getDate() - 7);
      return d;
    });
  };

  const goToNextWeek = () => {
    setWeekStart((prev) => {
      const d = new Date(prev);
      d.setDate(d.getDate() + 7);
      return d;
    });
  };

  const goToThisWeek = () => {
    const d = new Date();
    d.setDate(d.getDate() - d.getDay());
    d.setHours(0, 0, 0, 0);
    setWeekStart(d);
  };

  return {
    plans,
    loading,
    weekStart,
    weekEnd,
    addMeal,
    removeMeal,
    moveMeal,
    goToPrevWeek,
    goToNextWeek,
    goToThisWeek,
    refetch: fetch,
  };
}

export function useCollections(userId: string | undefined) {
  const [collections, setCollections] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    if (!userId) return;
    setCollections(await safe(api.get<Collection[]>('/collections'), []));
    setLoading(false);
  }, [userId]);

  useEffect(() => { fetch(); }, [fetch]);

  const createCollection = useCallback(
    async (title: string, description = ''): Promise<string | null> => {
      if (!userId) return null;
      const created = await safe(
        api.post<Collection>('/collections', { title, description }),
        null as Collection | null
      );
      if (created) setCollections((prev) => [...prev, created]);
      return created?.id ?? null;
    },
    [userId]
  );

  const updateCollection = useCallback(
    async (id: string, updates: { title?: string; description?: string; cover_image_url?: string; is_public?: boolean }) => {
      setCollections((prev) => prev.map((c) => (c.id === id ? { ...c, ...updates } : c)));
      await safe(api.patch(`/collections/${id}`, updates), null);
    },
    []
  );

  const deleteCollection = useCallback(async (id: string) => {
    setCollections((prev) => prev.filter((c) => c.id !== id));
    await safe(api.del(`/collections/${id}`), null);
  }, []);

  return { collections, loading, refetch: fetch, createCollection, updateCollection, deleteCollection };
}

export function useCollectionRecipes(collectionId: string | null) {
  const [items, setItems] = useState<CollectionRecipe[]>([]);
  const [loading, setLoading] = useState(false);

  const fetch = useCallback(async () => {
    if (!collectionId) { setItems([]); return; }
    setLoading(true);
    setItems(await safe(api.get<CollectionRecipe[]>(`/collections/${collectionId}/recipes`), []));
    setLoading(false);
  }, [collectionId]);

  useEffect(() => { fetch(); }, [fetch]);

  const addRecipe = useCallback(
    async (recipeId: string) => {
      if (!collectionId) return;
      const created = await safe(
        api.post<CollectionRecipe>(`/collections/${collectionId}/recipes`, { recipe_id: recipeId }),
        null as CollectionRecipe | null
      );
      if (created) setItems((prev) => [...prev, created]);
    },
    [collectionId]
  );

  const removeRecipe = useCallback(async (recipeId: string) => {
    if (!collectionId) return;
    setItems((prev) => prev.filter((i) => i.recipe_id !== recipeId));
    await safe(api.del(`/collections/${collectionId}/recipes/${recipeId}`), null);
  }, [collectionId]);

  return { items, loading, refetch: fetch, addRecipe, removeRecipe };
}
```

- [ ] **Step 2: Typecheck just this file's imports resolve**

```bash
npm run typecheck 2>&1 | grep "useData.ts" || echo "no useData.ts errors"
```
Expected: no errors in `useData.ts` itself. (App.tsx will still error because it imports the now-removed `useSeedData` — fixed in Task 3.)

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useData.ts
git commit -m "feat(fe): rewrite data hooks to use PHP API; drop useSeedData"
```

---

## Task 3: Rewrite the 3 direct component call sites

**Files:**
- Modify: `src/App.tsx`, `src/components/PantryMatchView.tsx`
- Rewrite fetch: `src/components/PublicRecipeView.tsx`

**Context:** These are the only components that called `supabase` directly. App also still imports the removed `useSeedData`. Apply the exact edits below.

### 3a. `src/App.tsx`

- [ ] **Step 1: Fix imports.** In the `from './hooks/useData'` import block, REMOVE the line `  useSeedData,`. Then REPLACE `import { supabase } from './lib/supabase';` with `import { api } from './lib/api';`.

- [ ] **Step 2: Remove the seed hook usage.** Delete this line:
```tsx
  const { seedIfEmpty } = useSeedData(userId);
```

- [ ] **Step 3: Drop the now-unused `refetchJobs`.** Change:
```tsx
  const { jobs, refetch: refetchJobs } = useExtractionJobs(userId);
```
to:
```tsx
  const { jobs } = useExtractionJobs(userId);
```

- [ ] **Step 4: Replace the seed effect.** Change:
```tsx
  useEffect(() => {
    seedIfEmpty().then((didSeed) => {
      if (didSeed) {
        refetchRecipes();
        refetchJobs();
      }
      setReady(true);
    });
  }, [seedIfEmpty, refetchRecipes, refetchJobs]);
```
to:
```tsx
  useEffect(() => {
    setReady(true);
  }, []);
```

- [ ] **Step 5: Replace the share-token resolve effect.** Change:
```tsx
      const { data } = await supabase
        .from('shared_recipes')
        .select('recipe_id')
        .eq('token', shareToken)
        .maybeSingle();
      if (data?.recipe_id) {
        setActiveRecipeId(data.recipe_id);
      }
      clearShareToken();
```
to:
```tsx
      try {
        const data = await api.get<{ recipe_id: string }>(`/recipes/shared/${shareToken}`);
        if (data?.recipe_id) setActiveRecipeId(data.recipe_id);
      } catch {
        /* token not found or not owned */
      }
      clearShareToken();
```

- [ ] **Step 6: Replace the share-create handler.** Change:
```tsx
              const { data } = await supabase
                .from('shared_recipes')
                .insert({ recipe_id: activeRecipe.id })
                .select('token')
                .single();
              if (data?.token) {
                return `${window.location.origin}/r/${data.token}`;
              }
              return null;
```
to:
```tsx
              try {
                const data = await api.post<{ token: string }>(`/recipes/${activeRecipe.id}/share`);
                if (data?.token) {
                  return `${window.location.origin}/r/${data.token}`;
                }
              } catch {
                /* ignore */
              }
              return null;
```

- [ ] **Step 7: Replace the meal-planner generate-grocery loop.** Change:
```tsx
              for (const rid of recipeIds) {
                const { data: ings } = await supabase
                  .from('ingredients')
                  .select('*')
                  .eq('recipe_id', rid);
                if (ings && ings.length > 0) {
                  await addRecipeIngredients(rid, ings);
                }
              }
```
to:
```tsx
              for (const rid of recipeIds) {
                await addRecipeIngredients(rid, []);
              }
```

### 3b. `src/components/PublicRecipeView.tsx`

- [ ] **Step 8: Swap the import.** Replace `import { supabase } from '../lib/supabase';` with `import { api } from '../lib/api';`.

- [ ] **Step 9: Replace the entire `useEffect` load block** (the one that resolves the share and runs the three queries) with:
```tsx
  useEffect(() => {
    async function load() {
      try {
        const data = await api.get<{
          recipe: Recipe | null;
          ingredients: Ingredient[];
          tags: Tag[];
          message: string;
        }>(`/public/recipes/${token}`);
        if (!data || !data.recipe) {
          setNotFound(true);
          setLoading(false);
          return;
        }
        setShareMessage(data.message || '');
        setRecipe(data.recipe);
        setIngredients(data.ingredients ?? []);
        setTags(data.tags ?? []);
      } catch {
        setNotFound(true);
      }
      setLoading(false);
    }
    load();
  }, [token]);
```

### 3c. `src/components/PantryMatchView.tsx`

- [ ] **Step 10: Swap the import.** Replace `import { supabase } from '../lib/supabase';` with `import { api } from '../lib/api';`.

- [ ] **Step 11: Replace the ingredient fetch.** Change:
```tsx
    const { data: allIngredients } = await supabase
      .from('ingredients')
      .select('recipe_id, name')
      .in('recipe_id', recipeIds);

    if (!allIngredients || allIngredients.length === 0) {
```
to:
```tsx
    const all = await api
      .get<{ recipe_id: string; name: string }[]>('/pantry/ingredients')
      .catch(() => [] as { recipe_id: string; name: string }[]);
    const recipeIdSet = new Set(recipeIds);
    const allIngredients = all.filter((i) => recipeIdSet.has(i.recipe_id));

    if (allIngredients.length === 0) {
```

- [ ] **Step 12: Typecheck these files**

```bash
npm run typecheck 2>&1 | grep -E "App.tsx|PublicRecipeView|PantryMatchView" || echo "no errors in the 3 rewritten files"
```
Expected: no errors in those 3 files. (Remaining errors will be the field-name bugs + GroceryListItem type, fixed in Task 4.)

- [ ] **Step 13: Commit**

```bash
git add src/App.tsx src/components/PublicRecipeView.tsx src/components/PantryMatchView.tsx
git commit -m "feat(fe): rewrite share, public view, and pantry to use the API"
```

---

## Task 4: Fix types, field-name bugs, remove Supabase dependency, delete seed

**Files:**
- Modify: `src/lib/database.types.ts`, `src/components/LibraryView.tsx`, `src/components/RecipeDetail.tsx`, `src/components/CollectionsView.tsx`, `.env`, `package.json`
- Delete: `src/data/seed.ts`

**Context:** The bolt export shipped with 27 TypeScript errors unrelated to (but surfaced by) the migration. Fix them, delete the now-unused seed, and drop the Supabase package.

- [ ] **Step 1: Fix `GroceryListItem` in `src/lib/database.types.ts`.** The runtime code uses `is_checked` and `position`, which the type omits. Change:
```ts
export interface GroceryListItem {
  id: string;
  grocery_list_id: string;
  recipe_id: string | null;
  ingredient_id: string | null;
  name: string;
  quantity: number | null;
  unit: string;
  aisle: Aisle;
  updated_at: string;
}
```
to:
```ts
export interface GroceryListItem {
  id: string;
  grocery_list_id: string;
  recipe_id: string | null;
  ingredient_id: string | null;
  name: string;
  quantity: number | null;
  unit: string;
  aisle: Aisle;
  is_checked: boolean;
  position: number;
  created_at: string;
  updated_at: string;
}
```

- [ ] **Step 2: Fix `src/components/LibraryView.tsx`.** On the sort comparator (~line 79), change both `total_time_min` to `total_time_minutes`:
```tsx
          (a, b) => (a.total_time_min ?? 9999) - (b.total_time_min ?? 9999)
```
to:
```tsx
          (a, b) => (a.total_time_minutes ?? 9999) - (b.total_time_minutes ?? 9999)
```

- [ ] **Step 3: Fix `src/components/RecipeDetail.tsx`.** Three changes in `handleCopyRecipe`:
```tsx
    if (recipe.total_time_min) lines.push(`Total time: ${formatTime(recipe.total_time_min)}`);
    if (recipe.servings) lines.push(`Servings: ${recipe.servings}`);
```
to:
```tsx
    if (recipe.total_time_minutes) lines.push(`Total time: ${formatTime(recipe.total_time_minutes)}`);
    if (recipe.yield_amount) lines.push(`Servings: ${recipe.yield_amount}`);
```
and:
```tsx
      lines.push(`${i + 1}. ${step.body}`);
```
to:
```tsx
      lines.push(`${i + 1}. ${step.content}`);
```

- [ ] **Step 4: Fix the unused import in `src/components/CollectionsView.tsx`.** Remove `Pencil` from the `lucide-react` import (it is declared but never used). Keep the other icons in that import unchanged.

- [ ] **Step 5: Delete the seed data file.**
```bash
git rm src/data/seed.ts
```
Confirm nothing still imports it: `grep -rn "data/seed" src || echo "no seed imports"` — expected: no imports.

- [ ] **Step 6: Remove the Supabase dependency.**
```bash
npm uninstall @supabase/supabase-js
```
This updates `package.json` + `package-lock.json` and removes it from `node_modules`. Confirm: `grep -rn "@supabase" src package.json || echo "no supabase references remain"`.

- [ ] **Step 7: Clean `.env`.** Remove the two lines `VITE_SUPABASE_URL=...` and `VITE_SUPABASE_ANON_KEY=...`. The app no longer reads them (`api.ts` uses `VITE_API_BASE`, default `/api`). `.env` is gitignored; this is a local change only.

- [ ] **Step 8: Commit**
```bash
git add src/lib/database.types.ts src/components/LibraryView.tsx src/components/RecipeDetail.tsx src/components/CollectionsView.tsx package.json package-lock.json
git rm src/data/seed.ts
git commit -m "fix(fe): correct GroceryListItem type + field-name bugs; remove supabase dep and seed"
```

---

## Task 5: Verify — typecheck + build

**Files:** none (verification gate)

**Context:** The gate that proves the rewrite is structurally correct: zero TypeScript errors (down from 27) and a successful production build.

- [ ] **Step 1: Typecheck must be clean**
```bash
npm run typecheck; echo "exit=$?"
```
Expected: NO errors, `exit=0`. If any error remains, fix it in the offending file (a leftover Supabase reference, a missed field rename, or an unused import). Do not proceed until clean.

- [ ] **Step 2: Production build must succeed**
```bash
npm run build; echo "exit=$?"
```
Expected: Vite build completes, `exit=0`, output in `dist/`.

- [ ] **Step 3: Confirm the bundle has no Supabase reference**
```bash
grep -rIl "supabase" dist 2>/dev/null && echo "WARNING: supabase string in bundle" || echo "clean: no supabase in dist"
```
Expected: "clean".

- [ ] **Step 4: Commit**
```bash
git add -A
git commit -m "chore(fe): typecheck clean + production build verified" --allow-empty
```

### Manual smoke test (run with the user, not a subagent)
With MariaDB + `php -S 127.0.0.1:8000 router.php` running and `npm run dev` (Vite proxies `/api`): in a browser — sign up, create a recipe (with ingredients/steps), toggle favourite, add to grocery, build a meal plan, create a collection, generate a share link and open `/r/{token}` in a private window (recipe + ingredients show, instructions hidden).

---

## Task 6: Production artifacts for 20i

**Files:**
- Create: `api/.htaccess`, `docs/DEPLOY-20i.md`

**Context:** 20i runs Apache/LiteSpeed. The root `.htaccess` (Plan 1) does SPA fallback and lets `/api/*` pass through to the filesystem — but the PHP front controller needs ALL `/api/*` requests routed to `api/index.php`. An `api/.htaccess` does this and blocks direct access to route/lib/config files.

- [ ] **Step 1: Create `api/.htaccess`**
```apache
<IfModule mod_rewrite.c>
  RewriteEngine On
  RewriteBase /api/

  # Route every /api/* request to the front controller, EXCEPT a direct
  # request for index.php itself. Also prevents direct access to
  # routes/*.php, lib/*.php, config.php, and schema.sql.
  RewriteCond %{REQUEST_URI} !/api/index\.php$
  RewriteRule ^ index.php [L]
</IfModule>
```

- [ ] **Step 2: Create `docs/DEPLOY-20i.md`**
````markdown
# Deploying RecipeBytes to 20i

The app is **static frontend + PHP API + MySQL**, all on 20i. Frontend and API are
same-origin, so no CORS config is needed.

## One-time setup
1. **Create a MySQL database** in the 20i control panel (Manage MySQL Databases).
   Note the DB name, username, password, and host (often `localhost` on 20i).
2. **Import the schema:** open phpMyAdmin for that database and import `api/schema.sql`.
   Confirm 16 tables are created.
3. **Production config:** create `api/config.php` on the server (do NOT commit it) with
   the real DB credentials and production cookie setting:
   ```php
   <?php
   return [
       'db_host' => 'localhost',          // per 20i panel
       'db_name' => 'YOUR_DB_NAME',
       'db_user' => 'YOUR_DB_USER',
       'db_pass' => 'YOUR_DB_PASSWORD',
       'db_charset' => 'utf8mb4',
       'session_ttl' => 60 * 60 * 24,     // 24h
       'cookie_secure' => true,           // HTTPS on 20i -> Secure cookie
   ];
   ```
   (Optionally place this file above the web root and `require` it from `api/config.php`.)

## Each deploy
1. Local: `npm run build` → produces `dist/`.
2. Upload the **contents of `dist/`** (index.html + assets/) into `public_html/`.
3. Upload the **`api/` folder** to `public_html/api/` (include `api/.htaccess`; do NOT
   upload `api/config.php` from your machine — the server has its own).
4. Upload the root **`.htaccess`** to `public_html/.htaccess` (SPA fallback).
5. Ensure the server PHP version is 8.x (20i panel) and `pdo_mysql` is enabled (default).

## Smoke test (live)
- Visit `https://yourdomain/api/health` → `{"data":{"status":"ok"}}`.
- Visit the site root → sign up → create a recipe → generate a share link → open
  `/r/{token}` while logged out (recipe + ingredients show; instructions hidden).

## Notes
- `api/config.php`, `.env*`, and `node_modules/` are gitignored and never deployed from git.
- Set `display_errors = Off` in production PHP (20i default) so errors never leak to clients.
````

- [ ] **Step 3: Commit**
```bash
git add api/.htaccess docs/DEPLOY-20i.md
git commit -m "chore(deploy): add api/.htaccess (Apache API routing) and 20i runbook"
```

---

## Final note
After Task 6 the codebase is fully migrated and build-verified. The actual 20i upload + DB
creation is performed interactively with the user. Optionally, the production `.htaccess` routing
can be verified locally via XAMPP's Apache before touching 20i.

## Coverage vs spec
Frontend swap (api client, auth, all hooks, 3 components) ✓ · Supabase package removed ✓ ·
27 TS errors fixed ✓ · seed dropped (per decision) ✓ · production `.htaccess` + runbook ✓ ·
build verified ✓. Deployment executed live with the user.
