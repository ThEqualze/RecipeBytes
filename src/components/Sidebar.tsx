import { useMemo, useState } from 'react';
import {
  Search,
  Plus,
  Inbox,
  Heart,
  Flame,
  ShoppingBasket,
  Folder,
  FolderOpen,
  ChevronRight,
  Hash,
  LogOut,
  BookOpen,
  Sparkles,
  CircleUserRound,
  CalendarDays,
  Library,
  Refrigerator,
} from 'lucide-react';
import type { Folder as FolderRow, Tag } from '../lib/database.types';
import rbLogo from '../assets/rb-logo-hat.webp';

export type ViewKey =
  | { kind: 'library'; filter?: 'all' | 'favorites' | 'recent' }
  | { kind: 'folder'; folderId: string }
  | { kind: 'tag'; tagId: string }
  | { kind: 'inbox' }
  | { kind: 'grocery' }
  | { kind: 'mealplan' }
  | { kind: 'collections' }
  | { kind: 'collection'; collectionId: string }
  | { kind: 'pantry' };

interface SidebarProps {
  folders: FolderRow[];
  tags: Tag[];
  recipeCounts: {
    total: number;
    favorites: number;
    recent: number;
    inbox: number;
    grocery: number;
    byFolder: Record<string, number>;
    byTag: Record<string, number>;
  };
  activeView: ViewKey;
  onSelect: (view: ViewKey) => void;
  search: string;
  onSearchChange: (value: string) => void;
  onImport: () => void;
  onNewRecipe: () => void;
  onCreateFolder: (name: string) => Promise<string | null>;
  userEmail?: string;
  userName?: string;
  onSignOut?: () => void;
}

interface FolderTreeNode extends FolderRow {
  children: FolderTreeNode[];
}

function buildTree(folders: FolderRow[]): FolderTreeNode[] {
  const map = new Map<string, FolderTreeNode>();
  folders.forEach((f) => map.set(f.id, { ...f, children: [] }));
  const roots: FolderTreeNode[] = [];
  map.forEach((node) => {
    if (node.parent_id && map.has(node.parent_id)) {
      map.get(node.parent_id)!.children.push(node);
    } else {
      roots.push(node);
    }
  });
  return roots;
}

function isViewActive(active: ViewKey, candidate: ViewKey): boolean {
  if (active.kind !== candidate.kind) return false;
  if (active.kind === 'library' && candidate.kind === 'library') {
    return (active.filter ?? 'all') === (candidate.filter ?? 'all');
  }
  if (active.kind === 'folder' && candidate.kind === 'folder') {
    return active.folderId === candidate.folderId;
  }
  if (active.kind === 'tag' && candidate.kind === 'tag') {
    return active.tagId === candidate.tagId;
  }
  return true;
}

export function Sidebar({
  folders,
  tags,
  recipeCounts,
  activeView,
  onSelect,
  search,
  onSearchChange,
  onImport,
  onNewRecipe,
  onCreateFolder,
  userEmail,
  userName,
  onSignOut,
}: SidebarProps) {
  const tree = useMemo(() => buildTree(folders), [folders]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({
    'f-weekend': true,
    'f-baking': true,
  });
  const [tagsOpen, setTagsOpen] = useState(true);
  const [foldersOpen, setFoldersOpen] = useState(true);
  const [addingFolder, setAddingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');

  const toggleFolder = (id: string) =>
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));

  const submitNewFolder = async () => {
    const name = newFolderName.trim();
    setNewFolderName('');
    setAddingFolder(false);
    if (name) await onCreateFolder(name);
  };

  return (
    <aside className="w-full h-full shrink-0 border-r border-stone-200 bg-stone-50 flex flex-col">
      <div className="px-4 pt-4 pb-3">
        <div className="flex items-center gap-2.5">
          <img src={rbLogo} alt="RecipeBytes" className="w-8 h-8 object-contain shrink-0" />
          <div className="flex flex-col leading-tight">
            <span className="font-display text-[15px] font-semibold text-stone-900">RecipeBytes</span>
            <span className="text-[11px] text-stone-500 font-medium">Demo workspace</span>
          </div>
        </div>
      </div>

      <div className="px-3 pb-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-[14px] h-[14px] text-stone-400" />
          <input
            data-search-input
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search recipes, ingredients..."
            className="w-full pl-8 pr-2 py-1.5 text-[13px] bg-white border border-stone-200 rounded-md text-stone-800 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-900/5 focus:border-stone-300"
          />
        </div>
      </div>

      <div className="px-3 pb-3 space-y-1">
        <button
          onClick={onImport}
          className="w-full flex items-center gap-2 px-2 py-1.5 text-[13px] text-accent-700 bg-accent-50 hover:bg-accent-100 rounded-md font-medium transition-colors"
        >
          <Sparkles className="w-[14px] h-[14px]" />
          Import from link
        </button>
        <button
          onClick={onNewRecipe}
          className="w-full flex items-center gap-2 px-2 py-1.5 text-[13px] text-stone-600 hover:bg-stone-100 rounded-md font-medium transition-colors"
        >
          <Plus className="w-[14px] h-[14px]" />
          New blank recipe
        </button>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin px-2 pb-4">
        <NavGroup label="Library">
          <NavItem
            icon={BookOpen}
            label="All recipes"
            count={recipeCounts.total}
            active={isViewActive(activeView, { kind: 'library', filter: 'all' })}
            onClick={() => onSelect({ kind: 'library', filter: 'all' })}
          />
          <NavItem
            icon={Heart}
            label="Favorites"
            count={recipeCounts.favorites}
            active={isViewActive(activeView, { kind: 'library', filter: 'favorites' })}
            onClick={() => onSelect({ kind: 'library', filter: 'favorites' })}
          />
          <NavItem
            icon={Flame}
            label="Recently cooked"
            count={recipeCounts.recent}
            active={isViewActive(activeView, { kind: 'library', filter: 'recent' })}
            onClick={() => onSelect({ kind: 'library', filter: 'recent' })}
          />
          <NavItem
            icon={Inbox}
            label="Inbox"
            count={recipeCounts.inbox}
            badge={recipeCounts.inbox > 0}
            active={isViewActive(activeView, { kind: 'inbox' })}
            onClick={() => onSelect({ kind: 'inbox' })}
          />
          <NavItem
            icon={ShoppingBasket}
            label="Grocery list"
            count={recipeCounts.grocery}
            active={isViewActive(activeView, { kind: 'grocery' })}
            onClick={() => onSelect({ kind: 'grocery' })}
          />
          <NavItem
            icon={CalendarDays}
            label="Meal planner"
            active={isViewActive(activeView, { kind: 'mealplan' })}
            onClick={() => onSelect({ kind: 'mealplan' })}
          />
          <NavItem
            icon={Library}
            label="Collections"
            active={activeView.kind === 'collections' || activeView.kind === 'collection'}
            onClick={() => onSelect({ kind: 'collections' })}
          />
          <NavItem
            icon={Refrigerator}
            label="What can I make?"
            active={isViewActive(activeView, { kind: 'pantry' })}
            onClick={() => onSelect({ kind: 'pantry' })}
          />
        </NavGroup>

        <NavGroup
          label="Folders"
          collapsible
          open={foldersOpen}
          onToggle={() => setFoldersOpen(!foldersOpen)}
          action={
            <button
              onClick={() => { setFoldersOpen(true); setAddingFolder(true); }}
              title="New folder"
              className="opacity-0 group-hover:opacity-100 hover:bg-stone-200 rounded p-0.5 transition"
            >
              <Plus className="w-[12px] h-[12px] text-stone-500" />
            </button>
          }
        >
          {foldersOpen && (
            <>
              {addingFolder && (
                <input
                  autoFocus
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') submitNewFolder();
                    else if (e.key === 'Escape') { setNewFolderName(''); setAddingFolder(false); }
                  }}
                  onBlur={submitNewFolder}
                  placeholder="Folder name"
                  className="w-full text-[13px] px-2 py-1 mb-0.5 bg-white border border-stone-300 rounded focus:outline-none focus:ring-2 focus:ring-stone-900/10"
                />
              )}
              {tree.map((node) => (
                <FolderItem
                  key={node.id}
                  node={node}
                  depth={0}
                  expanded={expanded}
                  toggle={toggleFolder}
                  counts={recipeCounts.byFolder}
                  activeView={activeView}
                  onSelect={onSelect}
                />
              ))}
            </>
          )}
        </NavGroup>

        <NavGroup
          label="Tags"
          collapsible
          open={tagsOpen}
          onToggle={() => setTagsOpen(!tagsOpen)}
        >
          {tagsOpen &&
            tags.map((tag) => (
              <button
                key={tag.id}
                onClick={() => onSelect({ kind: 'tag', tagId: tag.id })}
                className={`group w-full flex items-center gap-2 px-2 py-1 rounded-md text-[13px] transition-colors ${
                  isViewActive(activeView, { kind: 'tag', tagId: tag.id })
                    ? 'bg-stone-200/70 text-stone-900'
                    : 'text-stone-600 hover:bg-stone-100'
                }`}
              >
                <span
                  className="w-1.5 h-1.5 rounded-full shrink-0"
                  style={{ backgroundColor: tag.color }}
                />
                <span className="flex-1 text-left truncate">{tag.name}</span>
                <span className="text-[11px] text-stone-400 tabular-nums">
                  {recipeCounts.byTag[tag.id] ?? 0}
                </span>
              </button>
            ))}
        </NavGroup>
      </div>

      <div className="border-t border-stone-200 px-3 py-2.5 flex items-center gap-2">
        <div className="w-7 h-7 rounded-full bg-stone-200 flex items-center justify-center">
          <CircleUserRound className="w-4 h-4 text-stone-500" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-medium text-stone-800 truncate">{userName || 'User'}</div>
          <div className="text-[11px] text-stone-500 truncate">{userEmail || ''}</div>
        </div>
        <button
          onClick={onSignOut}
          title="Sign out"
          className="p-1.5 text-stone-500 hover:bg-stone-100 rounded-md transition-colors"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>
    </aside>
  );
}

function NavGroup({
  label,
  children,
  collapsible,
  open = true,
  onToggle,
  action,
}: {
  label: string;
  children: React.ReactNode;
  collapsible?: boolean;
  open?: boolean;
  onToggle?: () => void;
  action?: React.ReactNode;
}) {
  return (
    <div className="mt-3 first:mt-1">
      <div className="group flex items-center justify-between px-2 py-1">
        <button
          onClick={onToggle}
          disabled={!collapsible}
          className="flex items-center gap-1 text-[11px] uppercase tracking-wider font-semibold text-stone-500 hover:text-stone-700 transition-colors"
        >
          {collapsible && (
            <ChevronRight
              className={`w-3 h-3 transition-transform ${open ? 'rotate-90' : ''}`}
            />
          )}
          {label}
        </button>
        {action}
      </div>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function NavItem({
  icon: Icon,
  label,
  count,
  active,
  onClick,
  badge,
}: {
  icon: typeof BookOpen;
  label: string;
  count?: number;
  active?: boolean;
  onClick?: () => void;
  badge?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-[13px] transition-colors ${
        active
          ? 'bg-stone-200/70 text-stone-900 font-medium'
          : 'text-stone-600 hover:bg-stone-100'
      }`}
    >
      <Icon className="w-[14px] h-[14px] shrink-0" />
      <span className="flex-1 text-left truncate">{label}</span>
      {count != null &&
        (badge && count > 0 ? (
          <span className="text-[10px] font-semibold text-white bg-accent-600 px-1.5 py-0.5 rounded-full tabular-nums leading-none">
            {count}
          </span>
        ) : (
          <span className="text-[11px] text-stone-400 tabular-nums">{count}</span>
        ))}
    </button>
  );
}

function FolderItem({
  node,
  depth,
  expanded,
  toggle,
  counts,
  activeView,
  onSelect,
}: {
  node: FolderTreeNode;
  depth: number;
  expanded: Record<string, boolean>;
  toggle: (id: string) => void;
  counts: Record<string, number>;
  activeView: ViewKey;
  onSelect: (v: ViewKey) => void;
}) {
  const isOpen = expanded[node.id];
  const hasChildren = node.children.length > 0;
  const active = isViewActive(activeView, { kind: 'folder', folderId: node.id });

  return (
    <div>
      <div
        className={`group flex items-center gap-1 pl-2 pr-2 py-1 rounded-md text-[13px] cursor-pointer transition-colors ${
          active ? 'bg-stone-200/70 text-stone-900' : 'text-stone-600 hover:bg-stone-100'
        }`}
        style={{ paddingLeft: 8 + depth * 12 }}
        onClick={() => onSelect({ kind: 'folder', folderId: node.id })}
      >
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (hasChildren) toggle(node.id);
          }}
          className={`w-4 h-4 flex items-center justify-center rounded hover:bg-stone-200/70 ${
            hasChildren ? '' : 'invisible'
          }`}
        >
          <ChevronRight
            className={`w-3 h-3 text-stone-500 transition-transform ${
              isOpen ? 'rotate-90' : ''
            }`}
          />
        </button>
        {isOpen && hasChildren ? (
          <FolderOpen className="w-[14px] h-[14px] text-stone-500 shrink-0" />
        ) : (
          <Folder className="w-[14px] h-[14px] text-stone-500 shrink-0" />
        )}
        <span className="flex-1 truncate">{node.name}</span>
        <span className="text-[11px] text-stone-400 tabular-nums">
          {counts[node.id] ?? 0}
        </span>
      </div>
      {isOpen &&
        node.children.map((child) => (
          <FolderItem
            key={child.id}
            node={child}
            depth={depth + 1}
            expanded={expanded}
            toggle={toggle}
            counts={counts}
            activeView={activeView}
            onSelect={onSelect}
          />
        ))}
    </div>
  );
}

export { Hash };
