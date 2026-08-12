"use client";

import { Fragment, useEffect, useMemo, useState, type KeyboardEvent, type MouseEvent } from "react";
import {
  DndContext, DragOverlay, PointerSensor, pointerWithin, useDraggable, useDroppable,
  useSensor, useSensors, type DragEndEvent, type DragStartEvent,
} from "@dnd-kit/core";
import {
  ChevronDown, ChevronRight, Plus, Trash2, FileText, FolderPlus, Folder, FolderOpen, Ungroup,
  GripVertical, Briefcase,
} from "lucide-react";
import { canMove, INDENT_CAP, type Check, type TreeItem, type TreeKind } from "@/lib/notes/tree";
import type { TreeSelection } from "@/hooks/useNotes";
import type { NoteNode, NotebookNode, NotesTree } from "@/types";
import SelectionBar from "./SelectionBar";
import BagDrawer from "./BagDrawer";

interface Props {
  tree:                 NotesTree;
  treeItems:            TreeItem[];
  selectedNoteId:       string | null;
  selection:            TreeSelection | null;
  groupCheck:           Check | null;
  pendingRenameId:      string | null;
  expanded:             Set<string>;
  loading:              boolean;
  onToggleExpand:       (id: string) => void;
  onExpand:             (id: string) => void;
  onBag:                (kind: TreeKind, id: string) => void;
  onUnbag:              (kind: TreeKind, id: string) => void;
  onBagSelection:       () => void;
  onSelectNote:         (id: string) => void;
  onToggleSelect:       (kind: TreeKind, id: string) => void;
  onClearSelection:     () => void;
  onGroup:              () => void;
  onDissolve:           (kind: TreeKind, id: string) => void;
  onClearPendingRename: () => void;
  onMove:               (kind: TreeKind, id: string, parentId: string | null, index: number, notebookId?: string) => void;
  onAddNotebook:        () => void;
  onRenameNotebook:     (id: string, title: string) => void;
  onRemoveNotebook:     (id: string) => void;
  onAddNote:            (notebookId: string) => void;
  onRenameNote:         (id: string, title: string) => void;
  onRemoveNote:         (id: string) => void;
}

// What a drag is carrying, and what a drop target accepts.
interface DragData { kind: TreeKind; id: string; title: string }
type DropData =
  | { type: "gap";  kind: TreeKind; parentId: string | null; index: number; notebookId?: string }
  | { type: "into"; kind: TreeKind; id: string; notebookId?: string };

// Indentation stops growing past INDENT_CAP levels — nesting is unlimited, but
// a 256px sidebar can't give up more width than that and stay readable.
function indent(depth: number): number {
  return 4 + Math.min(depth, INDENT_CAP) * 12;
}

// Inline-editable label: double-click to rename, Enter/blur commits, Esc
// cancels. `autoEdit` opens it straight away — used on a folder the moment it
// is created, since "New group" is only a placeholder for a name.
function EditableLabel({
  value, onCommit, className, autoEdit, onAutoEditDone,
}: {
  value: string;
  onCommit: (v: string) => void;
  className?: string;
  autoEdit?: boolean;
  onAutoEditDone?: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  // `autoEdit` opens the editor without an effect: the row it applies to has
  // just been created, so this component mounts with `draft` already equal to
  // the placeholder title. Committing or cancelling calls onAutoEditDone, which
  // clears the flag upstream.
  const showEditor = editing || !!autoEdit;

  function finish() {
    setEditing(false);
    onAutoEditDone?.();
  }
  function commit() {
    finish();
    const v = draft.trim();
    if (v && v !== value) onCommit(v);
  }
  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    e.stopPropagation(); // don't let Esc/Ctrl+G reach the tree's shortcuts
    if (e.key === "Enter") commit();
    if (e.key === "Escape") { finish(); setDraft(value); }
  }

  return showEditor ? (
    <input
      autoFocus
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={onKey}
      onClick={(e) => e.stopPropagation()}
      className="w-full rounded bg-slate-900 px-1 py-0.5 text-sm text-slate-100 outline-none ring-1 ring-sky-500"
    />
  ) : (
    <span
      onDoubleClick={(e) => { e.stopPropagation(); setDraft(value); setEditing(true); }}
      title="Double-click to rename"
      className={className}
    >
      {value}
    </span>
  );
}

// Left pane: the notebook tree. Notebooks and pages both nest freely inside
// folders (Ctrl+click two rows then Group, or drag one onto a folder), so every
// row here is rendered by a recursive component rather than a fixed two-level
// loop.
export default function NotebookTree({
  tree, treeItems, selectedNoteId, selection, groupCheck, pendingRenameId, expanded, loading,
  onToggleExpand, onExpand, onBag, onUnbag, onBagSelection,
  onSelectNote, onToggleSelect, onClearSelection, onGroup, onDissolve, onClearPendingRename, onMove,
  onAddNotebook, onRenameNotebook, onRemoveNotebook, onAddNote, onRenameNote, onRemoveNote,
}: Props) {
  const [drag, setDrag] = useState<DragData | null>(null);

  // A small movement threshold so a plain click on a row still selects it
  // rather than starting a drag.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  // Ctrl+G groups, Esc clears — the same two actions the selection bar offers,
  // for hands that stay on the keyboard.
  useEffect(() => {
    function onKeyDown(e: globalThis.KeyboardEvent) {
      if (!selection) return;
      if (e.key === "Escape") { onClearSelection(); return; }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "g") {
        e.preventDefault();
        onGroup();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selection, onClearSelection, onGroup]);

  // Whether the row being dragged may land on a given target. The same guard
  // runs again server-side; this one is what stops the drop line appearing over
  // somewhere the row can't go.
  const accepts = useMemo(() => (target: DropData): boolean => {
    if (!drag || target.kind !== drag.kind) return false;
    const check = target.type === "gap"
      ? canMove(drag.id, target.parentId, treeItems, target.notebookId)
      : canMove(drag.id, target.id, treeItems, target.notebookId);
    return check.ok;
  }, [drag, treeItems]);

  function onDragStart(e: DragStartEvent) {
    setDrag((e.active.data.current as DragData | undefined) ?? null);
  }

  function onDragEnd(e: DragEndEvent) {
    const active = e.active.data.current as DragData | undefined;
    const target = e.over?.data.current as DropData | undefined;
    setDrag(null);
    if (!active || !target || !target.type) return;
    if (target.kind !== active.kind) return;

    if (target.type === "gap") {
      if (!canMove(active.id, target.parentId, treeItems, target.notebookId).ok) return;
      onMove(active.kind, active.id, target.parentId, target.index, target.notebookId);
    } else {
      if (!canMove(active.id, target.id, treeItems, target.notebookId).ok) return;
      // Dropping onto a folder appends inside it; a large index is clamped.
      onMove(active.kind, active.id, target.id, Number.MAX_SAFE_INTEGER, target.notebookId);
      // Open the folder it went into — dropping something into a closed folder
      // otherwise looks exactly like losing it.
      onExpand(target.id);
    }
  }

  const isSelected = (kind: TreeKind, id: string) =>
    selection?.kind === kind && selection.ids.includes(id);

  const ctx: RowContext = {
    expanded, toggle: onToggleExpand, isSelected, selectedNoteId, pendingRenameId,
    dragging: drag, accepts,
    onSelectNote, onToggleSelect, onDissolve, onClearPendingRename, onBag,
    onRenameNotebook, onRemoveNotebook, onAddNote, onRenameNote, onRemoveNote,
  };

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r border-slate-800 bg-[#0B1120]">
      <header className="flex shrink-0 items-center justify-between px-3 py-3">
        <span className="text-xs font-semibold uppercase tracking-widest text-slate-500">Notebooks</span>
        <button
          type="button"
          onClick={onAddNotebook}
          title="New notebook"
          className="rounded-md p-1 text-slate-400 transition-colors hover:bg-slate-800 hover:text-sky-400"
        >
          <FolderPlus size={16} />
        </button>
      </header>

      <DndContext
        sensors={sensors}
        collisionDetection={pointerWithin}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragCancel={() => setDrag(null)}
      >
        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
          {loading && tree.roots.length === 0 ? (
            <p className="px-2 py-4 text-xs text-slate-600">Loading…</p>
          ) : tree.roots.length === 0 ? (
            <button
              type="button"
              onClick={onAddNotebook}
              className="mt-2 flex w-full items-center gap-2 rounded-lg border border-dashed border-slate-700 px-3 py-3 text-xs text-slate-500 transition-colors hover:border-sky-600 hover:text-sky-400"
            >
              {/* Everything could be in the Bag rather than genuinely absent —
                  offering to create the "first" notebook would be wrong. */}
              <Plus size={14} />
              {tree.bagged.length > 0 ? "New notebook" : "Create your first notebook"}
            </button>
          ) : (
            <NotebookList nodes={tree.roots} parentId={null} ctx={ctx} />
          )}
        </div>

        {/* A pill that follows the cursor, so it's obvious what's in hand. */}
        <DragOverlay dropAnimation={null}>
          {drag && (
            <span className="rounded-md bg-sky-600 px-2 py-1 text-xs font-medium text-white shadow-lg">
              {drag.title}
            </span>
          )}
        </DragOverlay>
      </DndContext>

      {selection && (
        <SelectionBar
          count={selection.ids.length}
          kind={selection.kind}
          check={groupCheck}
          onGroup={onGroup}
          onBag={onBagSelection}
          onCancel={onClearSelection}
        />
      )}

      <BagDrawer items={tree.bagged} onUnbag={onUnbag} />
    </aside>
  );
}

// What every row in the tree needs from the top-level component.
interface RowContext {
  expanded:             Set<string>;
  toggle:               (id: string) => void;
  isSelected:           (kind: TreeKind, id: string) => boolean;
  selectedNoteId:       string | null;
  pendingRenameId:      string | null;
  dragging:             DragData | null;
  accepts:              (target: DropData) => boolean;
  onSelectNote:         (id: string) => void;
  onToggleSelect:       (kind: TreeKind, id: string) => void;
  onDissolve:           (kind: TreeKind, id: string) => void;
  onClearPendingRename: () => void;
  onBag:                (kind: TreeKind, id: string) => void;
  onRenameNotebook:     (id: string, title: string) => void;
  onRemoveNotebook:     (id: string) => void;
  onAddNote:            (notebookId: string) => void;
  onRenameNote:         (id: string, title: string) => void;
  onRemoveNote:         (id: string) => void;
}

// The line between two rows. Explicit drop zones rather than working out
// before/after from the pointer's offset inside a row: with a tree this is the
// difference between a drop that lands where the line showed and one that
// doesn't.
function DropGap({ data, ctx }: { data: Extract<DropData, { type: "gap" }>; ctx: RowContext }) {
  const id = `gap:${data.kind}:${data.parentId ?? "root"}:${data.notebookId ?? "-"}:${data.index}`;
  const { setNodeRef, isOver } = useDroppable({ id, data });
  const live = !!ctx.dragging && ctx.accepts(data);

  return (
    <div ref={setNodeRef} className="relative h-1.5">
      {live && isOver && (
        <span
          style={{ left: indent(0) }}
          className="absolute right-1 top-1/2 h-0.5 -translate-y-1/2 rounded-full bg-sky-400"
        />
      )}
    </div>
  );
}

function NotebookList({
  nodes, parentId, ctx,
}: { nodes: NotebookNode[]; parentId: string | null; ctx: RowContext }) {
  return (
    <>
      {nodes.map((node, i) => (
        <Fragment key={node.id}>
          <DropGap data={{ type: "gap", kind: "notebook", parentId, index: i }} ctx={ctx} />
          <NotebookRow node={node} ctx={ctx} />
        </Fragment>
      ))}
      <DropGap data={{ type: "gap", kind: "notebook", parentId, index: nodes.length }} ctx={ctx} />
    </>
  );
}

function NoteList({
  nodes, parentId, notebookId, notebookDepth, ctx,
}: {
  nodes: NoteNode[]; parentId: string | null; notebookId: string; notebookDepth: number; ctx: RowContext;
}) {
  return (
    <>
      {nodes.map((node, i) => (
        <Fragment key={node.id}>
          <DropGap data={{ type: "gap", kind: "note", parentId, index: i, notebookId }} ctx={ctx} />
          <NoteRow node={node} notebookId={notebookId} notebookDepth={notebookDepth} ctx={ctx} />
        </Fragment>
      ))}
      <DropGap
        data={{ type: "gap", kind: "note", parentId, index: nodes.length, notebookId }}
        ctx={ctx}
      />
    </>
  );
}

// A notebook or a folder of notebooks. A folder holds notebooks and other
// folders; a notebook holds pages. Neither holds both.
function NotebookRow({ node, ctx }: { node: NotebookNode; ctx: RowContext }) {
  const open = ctx.expanded.has(node.id);
  const selected = ctx.isSelected("notebook", node.id);
  const hasChildren = node.children.length > 0 || node.notes.length > 0 || !node.is_group;

  const { attributes, listeners, setNodeRef: dragRef, isDragging } = useDraggable({
    id:   `notebook:${node.id}`,
    data: { kind: "notebook", id: node.id, title: node.title } satisfies DragData,
  });

  // Only folders take a drop *inside* them.
  const intoData: Extract<DropData, { type: "into" }> = { type: "into", kind: "notebook", id: node.id };
  const { setNodeRef: dropRef, isOver } = useDroppable({
    id: `into:notebook:${node.id}`, data: intoData, disabled: !node.is_group,
  });
  const acceptsDrop = node.is_group && !!ctx.dragging && ctx.accepts(intoData);

  function onRowClick(e: MouseEvent) {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      ctx.onToggleSelect("notebook", node.id);
      return;
    }
    ctx.toggle(node.id);
  }

  return (
    <div className={isDragging ? "opacity-40" : undefined}>
      <div
        ref={dropRef}
        onClick={onRowClick}
        style={{ paddingLeft: indent(node.depth) }}
        className={`group flex cursor-pointer items-center gap-1 rounded-md py-1 pr-1
          ${selected ? "bg-sky-500/20 ring-1 ring-inset ring-sky-500/60"
            : acceptsDrop && isOver ? "bg-sky-500/10 ring-1 ring-inset ring-sky-400"
            : "hover:bg-slate-800/60"}`}
      >
        <span
          ref={dragRef}
          {...listeners}
          {...attributes}
          onClick={(e) => e.stopPropagation()}
          title="Drag to reorder or move into a folder"
          className="shrink-0 cursor-grab text-slate-700 opacity-0 transition-opacity hover:text-slate-400 group-hover:opacity-100 active:cursor-grabbing"
        >
          <GripVertical size={12} />
        </span>

        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); ctx.toggle(node.id); }}
          className="shrink-0 text-slate-500 hover:text-slate-300"
        >
          {hasChildren
            ? (open ? <ChevronDown size={14} /> : <ChevronRight size={14} />)
            : <span className="inline-block w-[14px]" />}
        </button>

        {node.is_group && (
          open
            ? <FolderOpen size={13} className="shrink-0 text-amber-500/70" />
            : <Folder size={13} className="shrink-0 text-amber-500/70" />
        )}

        <EditableLabel
          value={node.title}
          onCommit={(v) => ctx.onRenameNotebook(node.id, v)}
          autoEdit={ctx.pendingRenameId === node.id}
          onAutoEditDone={ctx.onClearPendingRename}
          className={`flex-1 truncate text-sm ${node.is_group ? "font-semibold text-amber-100/90" : "font-medium text-slate-200"}`}
        />

        {/* Folders hold notebooks, not pages, so there's nothing to add to one. */}
        {!node.is_group && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); ctx.onAddNote(node.id); }}
            title="New page"
            className="shrink-0 rounded p-0.5 text-slate-500 opacity-0 transition-opacity hover:text-sky-400 group-hover:opacity-100"
          >
            <Plus size={14} />
          </button>
        )}

        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); ctx.onBag("notebook", node.id); }}
          title="Tuck away into the Bag — nothing is deleted"
          className="shrink-0 rounded p-0.5 text-slate-600 opacity-0 transition-opacity hover:text-sky-400 group-hover:opacity-100"
        >
          <Briefcase size={12} />
        </button>

        {node.is_group ? (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); ctx.onDissolve("notebook", node.id); }}
            title="Ungroup — keeps everything inside, removes only the folder"
            className="shrink-0 rounded p-0.5 text-slate-600 opacity-0 transition-opacity hover:text-amber-400 group-hover:opacity-100"
          >
            <Ungroup size={13} />
          </button>
        ) : (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (confirm(`Delete "${node.title}" and all its pages?`)) ctx.onRemoveNotebook(node.id);
            }}
            title="Delete notebook"
            className="shrink-0 rounded p-0.5 text-slate-600 opacity-0 transition-opacity hover:text-red-400 group-hover:opacity-100"
          >
            <Trash2 size={13} />
          </button>
        )}
      </div>

      {open && (
        <>
          {node.is_group && <NotebookList nodes={node.children} parentId={node.id} ctx={ctx} />}
          {!node.is_group && (
            node.notes.length === 0 ? (
              <>
                <button
                  type="button"
                  onClick={() => ctx.onAddNote(node.id)}
                  style={{ paddingLeft: indent(node.depth + 1) + 14 }}
                  className="my-0.5 flex w-full items-center gap-1.5 rounded py-1 text-xs text-slate-600 hover:text-sky-400"
                >
                  <Plus size={12} /> Add a page
                </button>
                {/* Still a drop target: this is how a page joins an empty notebook. */}
                <DropGap
                  data={{ type: "gap", kind: "note", parentId: null, index: 0, notebookId: node.id }}
                  ctx={ctx}
                />
              </>
            ) : (
              <NoteList
                nodes={node.notes}
                parentId={null}
                notebookId={node.id}
                notebookDepth={node.depth}
                ctx={ctx}
              />
            )
          )}
        </>
      )}
    </div>
  );
}

// A page, or a folder of pages. Page folders live wholly inside one notebook —
// a page can never be grouped with, or moved to, anything outside it.
function NoteRow({
  node, notebookId, notebookDepth, ctx,
}: { node: NoteNode; notebookId: string; notebookDepth: number; ctx: RowContext }) {
  const open = ctx.expanded.has(node.id);
  const selected = ctx.isSelected("note", node.id);
  const isOpenNote = node.id === ctx.selectedNoteId;
  // Pages sit one level in from their notebook, plus their own nesting.
  const depth = notebookDepth + 1 + node.depth;

  const { attributes, listeners, setNodeRef: dragRef, isDragging } = useDraggable({
    id:   `note:${node.id}`,
    data: { kind: "note", id: node.id, title: node.title } satisfies DragData,
  });

  const intoData: Extract<DropData, { type: "into" }> = {
    type: "into", kind: "note", id: node.id, notebookId,
  };
  const { setNodeRef: dropRef, isOver } = useDroppable({
    id: `into:note:${node.id}`, data: intoData, disabled: !node.is_group,
  });
  const acceptsDrop = node.is_group && !!ctx.dragging && ctx.accepts(intoData);

  function onRowClick(e: MouseEvent) {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      ctx.onToggleSelect("note", node.id);
      return;
    }
    if (node.is_group) ctx.toggle(node.id);
    else ctx.onSelectNote(node.id);
  }

  return (
    <div className={isDragging ? "opacity-40" : undefined}>
      <div
        ref={dropRef}
        onClick={onRowClick}
        style={{ paddingLeft: indent(depth) }}
        className={`group flex cursor-pointer items-center gap-1.5 rounded-md py-1 pr-1 text-sm
          ${selected ? "bg-sky-500/20 ring-1 ring-inset ring-sky-500/60"
            : acceptsDrop && isOver ? "bg-sky-500/10 ring-1 ring-inset ring-sky-400"
            : isOpenNote ? "bg-sky-600/20 text-sky-200"
            : "text-slate-300 hover:bg-slate-800/60"}`}
      >
        <span
          ref={dragRef}
          {...listeners}
          {...attributes}
          onClick={(e) => e.stopPropagation()}
          title="Drag to reorder or move into a folder"
          className="shrink-0 cursor-grab text-slate-700 opacity-0 transition-opacity hover:text-slate-400 group-hover:opacity-100 active:cursor-grabbing"
        >
          <GripVertical size={12} />
        </span>

        {node.is_group ? (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); ctx.toggle(node.id); }}
            className="shrink-0 text-slate-500 hover:text-slate-300"
          >
            {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          </button>
        ) : (
          <FileText size={13} className="shrink-0 text-slate-500" />
        )}

        <EditableLabel
          value={node.title}
          onCommit={(v) => ctx.onRenameNote(node.id, v)}
          autoEdit={ctx.pendingRenameId === node.id}
          onAutoEditDone={ctx.onClearPendingRename}
          className={`flex-1 truncate ${node.is_group ? "font-semibold text-amber-100/80" : ""}`}
        />

        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); ctx.onBag("note", node.id); }}
          title="Tuck away into the Bag — nothing is deleted"
          className="shrink-0 rounded p-0.5 text-slate-600 opacity-0 transition-opacity hover:text-sky-400 group-hover:opacity-100"
        >
          <Briefcase size={11} />
        </button>

        {node.is_group ? (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); ctx.onDissolve("note", node.id); }}
            title="Ungroup — keeps the pages, removes only the folder"
            className="shrink-0 rounded p-0.5 text-slate-600 opacity-0 transition-opacity hover:text-amber-400 group-hover:opacity-100"
          >
            <Ungroup size={12} />
          </button>
        ) : (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (confirm(`Delete "${node.title}"?`)) ctx.onRemoveNote(node.id);
            }}
            title="Delete page"
            className="shrink-0 rounded p-0.5 text-slate-600 opacity-0 transition-opacity hover:text-red-400 group-hover:opacity-100"
          >
            <Trash2 size={12} />
          </button>
        )}
      </div>

      {open && node.is_group && (
        <NoteList
          nodes={node.children}
          parentId={node.id}
          notebookId={notebookId}
          notebookDepth={notebookDepth}
          ctx={ctx}
        />
      )}
    </div>
  );
}
