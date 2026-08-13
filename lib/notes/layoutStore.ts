import {
  DEFAULT_LAYOUT, LAYOUT_STORAGE_KEY, parseLayout, serializeLayout, type NotesLayout,
} from "./layout";

// The workspace layout lives in localStorage, which is an external store rather
// than React state — so it is read through `useSyncExternalStore` instead of
// being copied into state in a mount effect. That keeps the server render and
// the first client render agreeing on the default, and lets the real layout
// arrive on the next render without a cascade.
//
// Writes are debounced: a divider drag updates on every pointer move, and none
// of those intermediate widths are worth a synchronous write.

const PERSIST_DEBOUNCE_MS = 150;

let cached: NotesLayout | null = null;
let pending: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();

function readStored(): NotesLayout {
  if (typeof window === "undefined") return DEFAULT_LAYOUT;
  try {
    return parseLayout(window.localStorage.getItem(LAYOUT_STORAGE_KEY));
  } catch {
    // Storage can be unavailable (private mode, blocked cookies). Not
    // remembering the layout is a fine outcome; failing to render is not.
    return DEFAULT_LAYOUT;
  }
}

function persist(layout: NotesLayout): void {
  if (pending) clearTimeout(pending);
  pending = setTimeout(() => {
    pending = null;
    try {
      window.localStorage.setItem(LAYOUT_STORAGE_KEY, serializeLayout(layout));
    } catch {
      // Same as above.
    }
  }, PERSIST_DEBOUNCE_MS);
}

// The snapshot must be referentially stable between updates, or
// `useSyncExternalStore` will loop — hence the cache rather than parsing on
// every read.
export function getLayoutSnapshot(): NotesLayout {
  if (cached === null) cached = readStored();
  return cached;
}

export function getServerLayoutSnapshot(): NotesLayout {
  return DEFAULT_LAYOUT;
}

export function subscribeLayout(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => { listeners.delete(onChange); };
}

export function updateLayout(next: (prev: NotesLayout) => NotesLayout): void {
  const value = next(getLayoutSnapshot());
  if (value === cached) return;
  cached = value;
  for (const listener of listeners) listener();
  persist(value);
}
