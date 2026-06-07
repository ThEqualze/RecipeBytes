import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
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

export function useFolders(userId: string | undefined) {
  const [folders, setFolders] = useState<Folder[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    if (!userId) return;
    const { data } = await supabase
      .from('folders')
      .select('*')
      .order('position');
    setFolders(data ?? []);
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
    const { data } = await supabase
      .from('tags')
      .select('*')
      .order('category')
      .order('name');
    setTags(data ?? []);
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
    const { data } = await supabase
      .from('recipes')
      .select('*')
      .order('created_at', { ascending: false });
    setRecipes(data ?? []);
    setLoading(false);
  }, [userId]);

  useEffect(() => { fetch(); }, [fetch]);

  const toggleFavorite = async (id: string) => {
    const recipe = recipes.find((r) => r.id === id);
    if (!recipe) return;
    const next = !recipe.is_favorite;
    setRecipes((prev) => prev.map((r) => (r.id === id ? { ...r, is_favorite: next } : r)));
    await supabase.from('recipes').update({ is_favorite: next }).eq('id', id);
  };

  const markCooked = async (id: string) => {
    const now = new Date().toISOString();
    setRecipes((prev) => prev.map((r) => (r.id === id ? { ...r, last_cooked_at: now } : r)));
    await supabase.from('recipes').update({ last_cooked_at: now }).eq('id', id);
  };

  return { recipes, loading, refetch: fetch, toggleFavorite, markCooked };
}

export function useRecipeTags(userId: string | undefined) {
  const [map, setMap] = useState<Record<string, string[]>>({});

  const fetch = useCallback(async () => {
    if (!userId) return;
    const { data } = await supabase.from('recipe_tags').select('recipe_id, tag_id');
    const m: Record<string, string[]> = {};
    (data ?? []).forEach((row) => {
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
    supabase
      .from('ingredients')
      .select('*')
      .eq('recipe_id', recipeId)
      .order('position')
      .then(({ data }) => {
        setIngredients(data ?? []);
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
    supabase
      .from('instructions')
      .select('*')
      .eq('recipe_id', recipeId)
      .order('position')
      .then(({ data }) => {
        setInstructions(data ?? []);
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
    const { data } = await supabase
      .from('extraction_jobs')
      .select('*')
      .order('created_at', { ascending: false });
    setJobs(data ?? []);
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
    const { data: lists } = await supabase
      .from('grocery_lists')
      .select('*')
      .eq('is_active', true)
      .limit(1);

    const activeList = lists?.[0] ?? null;
    setList(activeList);

    if (activeList) {
      const { data: listItems } = await supabase
        .from('grocery_list_items')
        .select('*')
        .eq('grocery_list_id', activeList.id)
        .order('position');
      setItems(listItems ?? []);
    } else {
      setItems([]);
    }
    setLoading(false);
  }, [userId]);

  useEffect(() => { fetch(); }, [fetch]);

  const toggleItem = async (id: string) => {
    const item = items.find((i) => i.id === id);
    if (!item) return;
    const next = !item.is_checked;
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, is_checked: next } : i)));
    await supabase.from('grocery_list_items').update({ is_checked: next }).eq('id', id);
  };

  const addRecipeIngredients = useCallback(
    async (recipeId: string, recipeIngredients: Ingredient[]): Promise<number> => {
      if (!userId || recipeIngredients.length === 0) return 0;

      let activeList = list;
      if (!activeList) {
        const { data: newList } = await supabase
          .from('grocery_lists')
          .insert({ user_id: userId, name: "This week's list", is_active: true })
          .select('*')
          .single();
        if (!newList) return 0;
        activeList = newList;
        setList(activeList);
      }

      const startPos = items.length;
      const rows = recipeIngredients.map((ing, idx) => ({
        grocery_list_id: activeList!.id,
        recipe_id: recipeId,
        ingredient_id: ing.id,
        name: ing.name,
        quantity: ing.quantity,
        unit: ing.unit,
        aisle: 'other' as const,
        is_checked: false,
        position: startPos + idx,
      }));

      const { data: inserted } = await supabase
        .from('grocery_list_items')
        .insert(rows)
        .select('*');

      if (inserted) {
        setItems((prev) => [...prev, ...inserted]);
      }
      return rows.length;
    },
    [userId, list, items.length]
  );

  const removeItem = async (id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
    await supabase.from('grocery_list_items').delete().eq('id', id);
  };

  const clearChecked = async () => {
    const checkedIds = items.filter((i) => i.is_checked).map((i) => i.id);
    if (checkedIds.length === 0) return;
    setItems((prev) => prev.filter((i) => !i.is_checked));
    await supabase.from('grocery_list_items').delete().in('id', checkedIds);
  };

  const addItem = useCallback(
    async (name: string) => {
      if (!userId) return;
      let activeList = list;
      if (!activeList) {
        const { data: newList } = await supabase
          .from('grocery_lists')
          .insert({ user_id: userId, name: "This week's list", is_active: true })
          .select('*')
          .single();
        if (!newList) return;
        activeList = newList;
        setList(activeList);
      }
      const { data: inserted } = await supabase
        .from('grocery_list_items')
        .insert({
          grocery_list_id: activeList.id,
          name,
          aisle: 'other' as const,
          is_checked: false,
          position: items.length,
        })
        .select('*')
        .single();
      if (inserted) setItems((prev) => [...prev, inserted]);
    },
    [userId, list, items.length]
  );

  return { list, items, loading, refetch: fetch, toggleItem, addRecipeIngredients, removeItem, clearChecked, addItem };
}

export function useSeedData(userId: string | undefined) {
  const [seeded, setSeeded] = useState(false);

  const seedIfEmpty = useCallback(async () => {
    if (!userId || seeded) return false;

    const { count } = await supabase
      .from('recipes')
      .select('*', { count: 'exact', head: true });

    if (count && count > 0) {
      setSeeded(true);
      return false;
    }

    const { seedFolders, seedRecipes, seedTags, seedRecipeTags, seedIngredients, seedInstructions, seedExtractionJobs, seedGroceryItems } = await import('../data/seed');

    const folders = seedFolders.map((f) => ({ ...f, user_id: userId }));
    await supabase.from('folders').insert(folders);

    const tags = seedTags.map((t) => ({ ...t, user_id: userId }));
    await supabase.from('tags').insert(tags);

    const recipes = seedRecipes.map((r) => ({ ...r, user_id: userId }));
    await supabase.from('recipes').insert(recipes);

    const tagRows = Object.entries(seedRecipeTags).flatMap(([recipeId, tagIds]) =>
      tagIds.map((tagId) => ({ recipe_id: recipeId, tag_id: tagId }))
    );
    if (tagRows.length) await supabase.from('recipe_tags').insert(tagRows);

    await supabase.from('ingredients').insert(seedIngredients);
    await supabase.from('instructions').insert(seedInstructions);

    const jobs = seedExtractionJobs.map((j) => ({ ...j, user_id: userId }));
    await supabase.from('extraction_jobs').insert(jobs);

    const { data: newList } = await supabase
      .from('grocery_lists')
      .insert({ user_id: userId, name: "This week's list", is_active: true })
      .select('id')
      .single();

    if (newList) {
      const groceryItems = seedGroceryItems.map((gi) => ({
        ...gi,
        id: undefined,
        grocery_list_id: newList.id,
      }));
      await supabase.from('grocery_list_items').insert(groceryItems);
    }

    setSeeded(true);
    return true;
  }, [userId, seeded]);

  return { seedIfEmpty, seeded };
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

      const { data: newRecipe, error } = await supabase
        .from('recipes')
        .insert({
          user_id: userId,
          title: data.title,
          description: data.description,
          cover_image_url: data.cover_image_url,
          source_type: data.source_url ? 'web' : 'manual',
          source_url: data.source_url,
          source_author: data.source_author,
          folder_id: data.folder_id,
          prep_time_minutes: data.prep_time_minutes,
          cook_time_minutes: data.cook_time_minutes,
          total_time_minutes: data.total_time_minutes,
          yield_amount: data.yield_amount,
          yield_unit: data.yield_unit,
          notes: data.notes,
        })
        .select('id')
        .single();

      if (error || !newRecipe) return null;
      const recipeId = newRecipe.id;

      if (data.ingredients.length > 0) {
        const rows = data.ingredients.map((ing, idx) => ({
          recipe_id: recipeId,
          position: idx,
          group_name: ing.group_name,
          quantity: ing.quantity ? parseFloat(ing.quantity) || null : null,
          unit: ing.unit,
          name: ing.name,
          prep_note: ing.prep_note,
          raw_text: [ing.quantity, ing.unit, ing.name, ing.prep_note].filter(Boolean).join(' '),
        }));
        await supabase.from('ingredients').insert(rows);
      }

      if (data.instructions.length > 0) {
        const rows = data.instructions.map((step, idx) => ({
          recipe_id: recipeId,
          position: idx,
          step_number: idx + 1,
          group_name: step.group_name,
          content: step.content,
          timer_seconds: step.timer_seconds ? parseInt(step.timer_seconds) || null : null,
        }));
        await supabase.from('instructions').insert(rows);
      }

      if (data.tagIds.length > 0) {
        const rows = data.tagIds.map((tagId) => ({ recipe_id: recipeId, tag_id: tagId }));
        await supabase.from('recipe_tags').insert(rows);
      }

      return recipeId;
    },
    [userId]
  );

  const updateRecipe = useCallback(
    async (recipeId: string, data: RecipePayload): Promise<boolean> => {
      if (!userId) return false;

      await supabase
        .from('recipes')
        .update({
          title: data.title,
          description: data.description,
          cover_image_url: data.cover_image_url,
          source_type: data.source_url ? 'web' : 'manual',
          source_url: data.source_url,
          source_author: data.source_author,
          folder_id: data.folder_id,
          prep_time_minutes: data.prep_time_minutes,
          cook_time_minutes: data.cook_time_minutes,
          total_time_minutes: data.total_time_minutes,
          yield_amount: data.yield_amount,
          yield_unit: data.yield_unit,
          notes: data.notes,
        })
        .eq('id', recipeId);

      await supabase.from('ingredients').delete().eq('recipe_id', recipeId);
      if (data.ingredients.length > 0) {
        const rows = data.ingredients.map((ing, idx) => ({
          recipe_id: recipeId,
          position: idx,
          group_name: ing.group_name,
          quantity: ing.quantity ? parseFloat(ing.quantity) || null : null,
          unit: ing.unit,
          name: ing.name,
          prep_note: ing.prep_note,
          raw_text: [ing.quantity, ing.unit, ing.name, ing.prep_note].filter(Boolean).join(' '),
        }));
        await supabase.from('ingredients').insert(rows);
      }

      await supabase.from('instructions').delete().eq('recipe_id', recipeId);
      if (data.instructions.length > 0) {
        const rows = data.instructions.map((step, idx) => ({
          recipe_id: recipeId,
          position: idx,
          step_number: idx + 1,
          group_name: step.group_name,
          content: step.content,
          timer_seconds: step.timer_seconds ? parseInt(step.timer_seconds) || null : null,
        }));
        await supabase.from('instructions').insert(rows);
      }

      await supabase.from('recipe_tags').delete().eq('recipe_id', recipeId);
      if (data.tagIds.length > 0) {
        const rows = data.tagIds.map((tagId) => ({ recipe_id: recipeId, tag_id: tagId }));
        await supabase.from('recipe_tags').insert(rows);
      }

      return true;
    },
    [userId]
  );

  const deleteRecipe = useCallback(
    async (recipeId: string): Promise<boolean> => {
      if (!userId) return false;
      await supabase.from('recipe_tags').delete().eq('recipe_id', recipeId);
      await supabase.from('ingredients').delete().eq('recipe_id', recipeId);
      await supabase.from('instructions').delete().eq('recipe_id', recipeId);
      await supabase.from('recipes').delete().eq('id', recipeId);
      return true;
    },
    [userId]
  );

  const duplicateRecipe = useCallback(
    async (recipeId: string): Promise<string | null> => {
      if (!userId) return null;

      const { data: orig } = await supabase.from('recipes').select('*').eq('id', recipeId).single();
      if (!orig) return null;

      const { data: newRecipe } = await supabase
        .from('recipes')
        .insert({
          user_id: userId,
          title: `${orig.title} (copy)`,
          description: orig.description,
          cover_image_url: orig.cover_image_url,
          source_type: orig.source_type,
          source_url: orig.source_url,
          source_author: orig.source_author,
          folder_id: orig.folder_id,
          prep_time_minutes: orig.prep_time_minutes,
          cook_time_minutes: orig.cook_time_minutes,
          total_time_minutes: orig.total_time_minutes,
          yield_amount: orig.yield_amount,
          yield_unit: orig.yield_unit,
          notes: orig.notes,
        })
        .select('id')
        .single();

      if (!newRecipe) return null;
      const newId = newRecipe.id;

      const { data: ings } = await supabase.from('ingredients').select('*').eq('recipe_id', recipeId).order('position');
      if (ings && ings.length > 0) {
        await supabase.from('ingredients').insert(
          ings.map(({ id, recipe_id, created_at, ...rest }) => ({ ...rest, recipe_id: newId }))
        );
      }

      const { data: steps } = await supabase.from('instructions').select('*').eq('recipe_id', recipeId).order('position');
      if (steps && steps.length > 0) {
        await supabase.from('instructions').insert(
          steps.map(({ id, recipe_id, created_at, ...rest }) => ({ ...rest, recipe_id: newId }))
        );
      }

      const { data: tagRows } = await supabase.from('recipe_tags').select('tag_id').eq('recipe_id', recipeId);
      if (tagRows && tagRows.length > 0) {
        await supabase.from('recipe_tags').insert(
          tagRows.map((t) => ({ recipe_id: newId, tag_id: t.tag_id }))
        );
      }

      return newId;
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
    const { data } = await supabase
      .from('meal_plans')
      .select('*')
      .gte('planned_date', startStr)
      .lte('planned_date', endStr)
      .order('position');
    setPlans(data ?? []);
    setLoading(false);
  }, [userId, weekStart, weekEnd]);

  useEffect(() => { fetch(); }, [fetch]);

  const addMeal = useCallback(
    async (recipeId: string, date: string, mealType: MealType) => {
      if (!userId) return;
      const position = plans.filter(
        (p) => p.planned_date === date && p.meal_type === mealType
      ).length;
      const { data } = await supabase
        .from('meal_plans')
        .insert({ recipe_id: recipeId, planned_date: date, meal_type: mealType, position })
        .select('*')
        .single();
      if (data) setPlans((prev) => [...prev, data]);
    },
    [userId, plans]
  );

  const removeMeal = useCallback(async (id: string) => {
    setPlans((prev) => prev.filter((p) => p.id !== id));
    await supabase.from('meal_plans').delete().eq('id', id);
  }, []);

  const moveMeal = useCallback(
    async (id: string, date: string, mealType: MealType) => {
      setPlans((prev) =>
        prev.map((p) => (p.id === id ? { ...p, planned_date: date, meal_type: mealType } : p))
      );
      await supabase.from('meal_plans').update({ planned_date: date, meal_type: mealType }).eq('id', id);
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
    const { data } = await supabase
      .from('collections')
      .select('*')
      .order('position')
      .order('created_at', { ascending: false });
    setCollections(data ?? []);
    setLoading(false);
  }, [userId]);

  useEffect(() => { fetch(); }, [fetch]);

  const createCollection = useCallback(
    async (title: string, description = ''): Promise<string | null> => {
      if (!userId) return null;
      const { data } = await supabase
        .from('collections')
        .insert({ title, description, position: collections.length })
        .select('*')
        .single();
      if (data) setCollections((prev) => [...prev, data]);
      return data?.id ?? null;
    },
    [userId, collections.length]
  );

  const updateCollection = useCallback(
    async (id: string, updates: { title?: string; description?: string; cover_image_url?: string; is_public?: boolean }) => {
      setCollections((prev) => prev.map((c) => (c.id === id ? { ...c, ...updates } : c)));
      await supabase.from('collections').update(updates).eq('id', id);
    },
    []
  );

  const deleteCollection = useCallback(async (id: string) => {
    setCollections((prev) => prev.filter((c) => c.id !== id));
    await supabase.from('collections').delete().eq('id', id);
  }, []);

  return { collections, loading, refetch: fetch, createCollection, updateCollection, deleteCollection };
}

export function useCollectionRecipes(collectionId: string | null) {
  const [items, setItems] = useState<CollectionRecipe[]>([]);
  const [loading, setLoading] = useState(false);

  const fetch = useCallback(async () => {
    if (!collectionId) { setItems([]); return; }
    setLoading(true);
    const { data } = await supabase
      .from('collection_recipes')
      .select('*')
      .eq('collection_id', collectionId)
      .order('position');
    setItems(data ?? []);
    setLoading(false);
  }, [collectionId]);

  useEffect(() => { fetch(); }, [fetch]);

  const addRecipe = useCallback(
    async (recipeId: string) => {
      if (!collectionId) return;
      const position = items.length;
      const { data } = await supabase
        .from('collection_recipes')
        .insert({ collection_id: collectionId, recipe_id: recipeId, position })
        .select('*')
        .single();
      if (data) setItems((prev) => [...prev, data]);
    },
    [collectionId, items.length]
  );

  const removeRecipe = useCallback(async (recipeId: string) => {
    if (!collectionId) return;
    setItems((prev) => prev.filter((i) => i.recipe_id !== recipeId));
    await supabase
      .from('collection_recipes')
      .delete()
      .eq('collection_id', collectionId)
      .eq('recipe_id', recipeId);
  }, [collectionId]);

  return { items, loading, refetch: fetch, addRecipe, removeRecipe };
}

