import { useEffect, useMemo, useState } from 'react';
import { useAuth } from './contexts/AuthContext';
import { AuthPage } from './components/AuthPage';
import { Sidebar, type ViewKey } from './components/Sidebar';
import { LibraryView } from './components/LibraryView';
import { RecipeDetail } from './components/RecipeDetail';
import { RecipeEditor, type RecipeFormData } from './components/RecipeEditor';
import { InboxView } from './components/InboxView';
import { GroceryView } from './components/GroceryView';
import { MealPlannerView } from './components/MealPlannerView';
import { CollectionsView } from './components/CollectionsView';
import { CollectionDetailView } from './components/CollectionDetailView';
import { PantryMatchView } from './components/PantryMatchView';
import { ImportModal } from './components/ImportModal';
import { KitchenMode } from './components/KitchenMode';
import { PublicRecipeView } from './components/PublicRecipeView';
import {
  useFolders,
  useTags,
  useRecipes,
  useRecipeTags,
  useRecipeIngredients,
  useRecipeInstructions,
  useExtractionJobs,
  useGroceryList,
  useRecipeCrud,
  useMealPlan,
  useCollections,
  useCollectionRecipes,
} from './hooks/useData';
import { api } from './lib/api';
import { Loader2, Menu, ChefHat } from 'lucide-react';

function descendantFolderIds(
  rootId: string,
  folders: { id: string; parent_id: string | null }[]
): string[] {
  const result = new Set<string>([rootId]);
  let added = true;
  while (added) {
    added = false;
    folders.forEach((f) => {
      if (f.parent_id && result.has(f.parent_id) && !result.has(f.id)) {
        result.add(f.id);
        added = true;
      }
    });
  }
  return [...result];
}

function App() {
  const { user, loading: authLoading } = useAuth();
  const [shareToken, setShareToken] = useState<string | null>(() => {
    const path = window.location.pathname;
    const match = path.match(/^\/r\/([a-f0-9]+)$/);
    return match ? match[1] : null;
  });

  if (authLoading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-stone-50">
        <Loader2 className="w-6 h-6 animate-spin text-stone-400" />
      </div>
    );
  }

  if (shareToken && !user) {
    return (
      <PublicRecipeView
        token={shareToken}
        onSignUp={() => {
          window.history.pushState({}, '', '/');
          setShareToken(null);
        }}
      />
    );
  }

  if (!user) return <AuthPage />;

  return <Workspace userId={user.id} userEmail={user.email} shareToken={shareToken} clearShareToken={() => { window.history.pushState({}, '', '/'); setShareToken(null); }} />;
}

function Workspace({ userId, userEmail, shareToken, clearShareToken }: { userId: string; userEmail?: string; shareToken: string | null; clearShareToken: () => void }) {
  const { signOut } = useAuth();
  const [view, setView] = useState<ViewKey>({ kind: 'library', filter: 'all' });
  const [activeRecipeId, setActiveRecipeId] = useState<string | null>(null);
  const [editorMode, setEditorMode] = useState<'create' | 'edit' | null>(null);
  const [search, setSearch] = useState('');
  const [layout, setLayout] = useState<'grid' | 'list'>('grid');
  const [importOpen, setImportOpen] = useState(false);
  const [kitchenRecipeId, setKitchenRecipeId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [ready, setReady] = useState(false);

  const { folders } = useFolders(userId);
  const { tags } = useTags(userId);
  const { recipes, toggleFavorite, markCooked, refetch: refetchRecipes } = useRecipes(userId);
  const { recipeTagIds, refetch: refetchTags } = useRecipeTags(userId);
  const { jobs } = useExtractionJobs(userId);
  const { items: groceryItems, toggleItem, addRecipeIngredients, removeItem: removeGroceryItem, clearChecked: clearCheckedGrocery, addItem: addGroceryItem } = useGroceryList(userId);
  const { plans: mealPlans, weekStart, weekEnd, addMeal, removeMeal, moveMeal, goToPrevWeek, goToNextWeek, goToThisWeek } = useMealPlan(userId);
  const { collections, createCollection, updateCollection, deleteCollection } = useCollections(userId);
  const activeCollectionId = view.kind === 'collection' ? view.collectionId : null;
  const { items: collectionRecipes, addRecipe: addCollectionRecipe, removeRecipe: removeCollectionRecipe } = useCollectionRecipes(activeCollectionId);
  const { ingredients } = useRecipeIngredients(activeRecipeId);
  const { instructions } = useRecipeInstructions(activeRecipeId);
  const { createRecipe, updateRecipe, deleteRecipe, duplicateRecipe } = useRecipeCrud(userId);

  useEffect(() => {
    setReady(true);
  }, []);

  useEffect(() => {
    if (!shareToken) return;
    (async () => {
      try {
        const data = await api.get<{ recipe_id: string }>(`/recipes/shared/${shareToken}`);
        if (data?.recipe_id) setActiveRecipeId(data.recipe_id);
      } catch {
        /* token not found or not owned */
      }
      clearShareToken();
    })();
  }, [shareToken, clearShareToken]);

  const recipeCounts = useMemo(() => {
    const byFolder: Record<string, number> = {};
    const byTag: Record<string, number> = {};

    folders.forEach((f) => {
      const ids = descendantFolderIds(f.id, folders);
      byFolder[f.id] = recipes.filter(
        (r) => r.folder_id && ids.includes(r.folder_id) && r.status === 'active'
      ).length;
    });

    tags.forEach((t) => {
      byTag[t.id] = Object.entries(recipeTagIds).filter(
        ([rid, tids]) =>
          tids.includes(t.id) && recipes.some((r) => r.id === rid && r.status === 'active')
      ).length;
    });

    return {
      total: recipes.filter((r) => r.status === 'active').length,
      favorites: recipes.filter((r) => r.is_favorite).length,
      recent: recipes.filter((r) => !!r.last_cooked_at).length,
      inbox: jobs.filter((j) => j.status === 'ready_for_review').length,
      grocery: groceryItems.length,
      byFolder,
      byTag,
    };
  }, [recipes, folders, tags, recipeTagIds, jobs, groceryItems]);

  const filteredRecipes = useMemo(() => {
    let list = recipes.filter((r) => r.status === 'active');

    if (view.kind === 'library') {
      if (view.filter === 'favorites') list = list.filter((r) => r.is_favorite);
      else if (view.filter === 'recent') list = list.filter((r) => !!r.last_cooked_at);
    } else if (view.kind === 'folder') {
      const ids = descendantFolderIds(view.folderId, folders);
      list = list.filter((r) => r.folder_id && ids.includes(r.folder_id));
    } else if (view.kind === 'tag') {
      list = list.filter((r) => (recipeTagIds[r.id] ?? []).includes(view.tagId));
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (r) =>
          r.title.toLowerCase().includes(q) ||
          r.description.toLowerCase().includes(q) ||
          r.source_author.toLowerCase().includes(q)
      );
    }

    return list;
  }, [recipes, view, search, folders, recipeTagIds]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;

      if (e.key === 'Escape') {
        if (editorMode) { setEditorMode(null); return; }
        if (kitchenRecipeId) { setKitchenRecipeId(null); return; }
        if (activeRecipeId) { setActiveRecipeId(null); return; }
        if (importOpen) { setImportOpen(false); return; }
      }

      if (isInput) return;

      if (e.key === '/' && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        document.querySelector<HTMLInputElement>('[data-search-input]')?.focus();
      }
      if (e.key === 'n' && !e.metaKey && !e.ctrlKey && !activeRecipeId && !editorMode) {
        e.preventDefault();
        setEditorMode('create');
        setActiveRecipeId(null);
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [editorMode, kitchenRecipeId, activeRecipeId, importOpen]);

  const activeRecipe = activeRecipeId
    ? recipes.find((r) => r.id === activeRecipeId)
    : null;

  const heading = useMemo(() => {
    if (view.kind === 'library') {
      if (view.filter === 'favorites')
        return { title: 'Favorites', subtitle: "Recipes you've starred for the rotation." };
      if (view.filter === 'recent')
        return { title: 'Recently cooked', subtitle: 'A timeline of what came out of your kitchen.' };
      return { title: 'All recipes', subtitle: 'Your complete collection — clipped, captured, and curated.' };
    }
    if (view.kind === 'folder') {
      const folder = folders.find((f) => f.id === view.folderId);
      return { title: folder?.name ?? 'Folder', subtitle: undefined };
    }
    if (view.kind === 'tag') {
      const tag = tags.find((t) => t.id === view.tagId);
      return { title: tag?.name ?? 'Tag', subtitle: `Tagged ${tag?.category.replace('_', ' ')}` };
    }
    return { title: '', subtitle: undefined };
  }, [view, folders, tags]);

  if (!ready) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-stone-50">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-6 h-6 animate-spin text-stone-400" />
          <span className="text-[13px] text-stone-500">Setting up your workspace...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-stone-50 text-stone-900">
      {/* Mobile header */}
      <div className="fixed top-0 left-0 right-0 z-40 md:hidden bg-white/95 backdrop-blur border-b border-stone-200 flex items-center justify-between px-4 py-3">
        <button
          onClick={() => setSidebarOpen(true)}
          className="w-9 h-9 flex items-center justify-center rounded-md hover:bg-stone-100 transition-colors"
        >
          <Menu className="w-5 h-5 text-stone-700" />
        </button>
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-md bg-stone-900 text-stone-50 flex items-center justify-center">
            <ChefHat className="w-4 h-4" strokeWidth={2} />
          </div>
          <span className="font-display text-[15px] font-semibold text-stone-900">Mise</span>
        </div>
        <div className="w-9" />
      </div>

      {/* Sidebar backdrop (mobile) */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/40 md:hidden animate-fade-in"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div
        className={`fixed inset-y-0 left-0 z-50 w-72 transform transition-transform duration-200 ease-out md:relative md:translate-x-0 md:z-auto ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <Sidebar
          folders={folders}
          tags={tags}
          recipeCounts={recipeCounts}
          activeView={view}
          onSelect={(v) => {
            setView(v);
            setActiveRecipeId(null);
            setSidebarOpen(false);
          }}
          search={search}
          onSearchChange={setSearch}
          onImport={() => {
            setImportOpen(true);
            setSidebarOpen(false);
          }}
          onNewRecipe={() => {
            setEditorMode('create');
            setActiveRecipeId(null);
            setSidebarOpen(false);
          }}
          userEmail={userEmail}
          userName={userEmail?.split('@')[0]}
          onSignOut={signOut}
        />
      </div>

      <main className="flex-1 min-w-0 bg-white pt-[57px] md:pt-0">
        {editorMode === 'create' ? (
          <RecipeEditor
            mode="create"
            folders={folders}
            tags={tags}
            onSave={async (data: RecipeFormData) => {
              const id = await createRecipe(data);
              setEditorMode(null);
              await refetchRecipes();
              await refetchTags();
              if (id) setActiveRecipeId(id);
            }}
            onCancel={() => setEditorMode(null)}
          />
        ) : editorMode === 'edit' && activeRecipe ? (
          <RecipeEditor
            mode="edit"
            recipe={activeRecipe}
            initialIngredients={ingredients}
            initialInstructions={instructions}
            folders={folders}
            tags={tags}
            onSave={async (data: RecipeFormData) => {
              await updateRecipe(activeRecipe.id, data);
              setEditorMode(null);
              await refetchRecipes();
              await refetchTags();
            }}
            onDelete={async () => {
              await deleteRecipe(activeRecipe.id);
              setEditorMode(null);
              setActiveRecipeId(null);
              await refetchRecipes();
              await refetchTags();
            }}
            onCancel={() => setEditorMode(null)}
          />
        ) : activeRecipe ? (
          <RecipeDetail
            recipe={activeRecipe}
            ingredients={ingredients}
            instructions={instructions}
            tags={tags.filter((t) =>
              (recipeTagIds[activeRecipe.id] ?? []).includes(t.id)
            )}
            onBack={() => setActiveRecipeId(null)}
            onToggleFavorite={() => toggleFavorite(activeRecipe.id)}
            onEnterKitchen={() => setKitchenRecipeId(activeRecipe.id)}
            onEdit={() => setEditorMode('edit')}
            onMarkCooked={() => markCooked(activeRecipe.id)}
            onDuplicate={async () => {
              const newId = await duplicateRecipe(activeRecipe.id);
              if (newId) {
                await refetchRecipes();
                await refetchTags();
                setActiveRecipeId(newId);
              }
            }}
            onShare={async () => {
              try {
                const data = await api.post<{ token: string }>(`/recipes/${activeRecipe.id}/share`);
                if (data?.token) {
                  return `${window.location.origin}/r/${data.token}`;
                }
              } catch {
                /* ignore */
              }
              return null;
            }}
            onDelete={async () => {
              await deleteRecipe(activeRecipe.id);
              setActiveRecipeId(null);
              await refetchRecipes();
              await refetchTags();
            }}
            onAddToGrocery={async () => {
              if (activeRecipe) {
                await addRecipeIngredients(activeRecipe.id, ingredients);
              }
            }}
          />
        ) : view.kind === 'inbox' ? (
          <InboxView jobs={jobs} />
        ) : view.kind === 'grocery' ? (
          <GroceryView items={groceryItems} onToggle={toggleItem} onRemove={removeGroceryItem} onClearChecked={clearCheckedGrocery} onAddItem={addGroceryItem} />
        ) : view.kind === 'mealplan' ? (
          <MealPlannerView
            plans={mealPlans}
            recipes={recipes}
            weekStart={weekStart}
            weekEnd={weekEnd}
            onAddMeal={addMeal}
            onRemoveMeal={removeMeal}
            onMoveMeal={moveMeal}
            onPrevWeek={goToPrevWeek}
            onNextWeek={goToNextWeek}
            onThisWeek={goToThisWeek}
            onGenerateGrocery={async (recipeIds) => {
              for (const rid of recipeIds) {
                await addRecipeIngredients(rid, []);
              }
            }}
            onSelectRecipe={(id) => setActiveRecipeId(id)}
          />
        ) : view.kind === 'collections' ? (
          <CollectionsView
            collections={collections}
            onCreateCollection={createCollection}
            onSelectCollection={(id) => setView({ kind: 'collection', collectionId: id })}
            onDeleteCollection={deleteCollection}
            onUpdateCollection={updateCollection}
          />
        ) : view.kind === 'collection' && collections.find((c) => c.id === view.collectionId) ? (
          <CollectionDetailView
            collection={collections.find((c) => c.id === view.collectionId)!}
            collectionRecipes={collectionRecipes}
            recipes={recipes}
            onBack={() => setView({ kind: 'collections' })}
            onAddRecipe={addCollectionRecipe}
            onRemoveRecipe={removeCollectionRecipe}
            onUpdate={(updates) => updateCollection(view.collectionId, updates)}
            onSelectRecipe={(id) => setActiveRecipeId(id)}
          />
        ) : view.kind === 'pantry' ? (
          <PantryMatchView
            recipes={recipes}
            onSelectRecipe={(id) => setActiveRecipeId(id)}
          />
        ) : (
          <LibraryView
            title={heading.title}
            subtitle={heading.subtitle}
            recipes={filteredRecipes}
            recipeTagIds={recipeTagIds}
            tags={tags}
            view={layout}
            onViewChange={setLayout}
            onSelectRecipe={setActiveRecipeId}
            onToggleFavorite={toggleFavorite}
            onNewRecipe={() => setEditorMode('create')}
            onTagClick={(tagId) => setView({ kind: 'tag', tagId })}
          />
        )}
      </main>

      <ImportModal open={importOpen} onClose={() => setImportOpen(false)} />

      {kitchenRecipeId && activeRecipe && kitchenRecipeId === activeRecipe.id && (
        <KitchenMode
          recipe={activeRecipe}
          ingredients={ingredients}
          instructions={instructions}
          onExit={() => setKitchenRecipeId(null)}
        />
      )}
    </div>
  );
}

export default App;
