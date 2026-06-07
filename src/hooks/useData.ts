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

// NOTE (Task 2 minimal fix): the verbatim plan code reads `is_checked` on grocery
// items (also consumed by GroceryView.tsx), but `GroceryListItem` in
// database.types.ts does not declare it. Augment the type so the field resolves
// without touching other files. Remove once database.types.ts gains the field.
declare module '../lib/database.types' {
  interface GroceryListItem {
    is_checked: boolean;
  }
}

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
