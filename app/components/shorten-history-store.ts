export type ShortenHistoryItem = {
  id: string;
  shortPath: string;
  originalUrl: string;
  createdAt: number;
};

export type ShortenHistorySnapshot = ShortenHistoryItem[] | null;

const SHORTEN_HISTORY_STORAGE_KEY_V1 = "short-url:history:v1";
const SHORTEN_HISTORY_STORAGE_KEY_V2 = "short-url:history:v2";
const MAX_HISTORY_ITEMS = 20;

export const SHORTEN_HISTORY_UPDATED_EVENT = "short-url:history-updated";

let cachedHistoryKey: string | null | undefined;
let cachedHistorySnapshot: ShortenHistoryItem[] = [];

function normalizeShortPath(value: string): string | null {
  if (!value) return null;
  if (value.startsWith("/")) return value;
  try {
    const url = new URL(value);
    const path = url.pathname || "/";
    return path.startsWith("/") ? path : `/${path}`;
  } catch {
    return null;
  }
}

export function loadShortenHistory(): ShortenHistoryItem[] {
  if (typeof window === "undefined") return [];
  try {
    const rawV2 = window.localStorage.getItem(SHORTEN_HISTORY_STORAGE_KEY_V2);
    const rawV1 = window.localStorage.getItem(SHORTEN_HISTORY_STORAGE_KEY_V1);
    const raw = rawV2 ?? rawV1;
    if (!raw) return [];

    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    const mapped = parsed
      .map((item): ShortenHistoryItem | null => {
        if (!item || typeof item !== "object") return null;
        const maybe = item as Partial<
          ShortenHistoryItem & { shortUrl?: string }
        >;

        const id = typeof maybe.id === "string" ? maybe.id : null;
        const createdAt =
          typeof maybe.createdAt === "number" ? maybe.createdAt : null;
        const originalUrl =
          typeof maybe.originalUrl === "string" ? maybe.originalUrl : "";

        const shortPath =
          typeof maybe.shortPath === "string"
            ? normalizeShortPath(maybe.shortPath)
            : typeof maybe.shortUrl === "string"
              ? normalizeShortPath(maybe.shortUrl)
              : null;

        if (!id || createdAt === null || !shortPath) return null;
        return { id, shortPath, originalUrl, createdAt };
      })
      .filter((v): v is ShortenHistoryItem => v !== null)
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, MAX_HISTORY_ITEMS);

    if (!rawV2 && mapped.length > 0) {
      saveShortenHistory(mapped);
    }

    return mapped;
  } catch {
    return [];
  }
}

export function saveShortenHistory(items: ShortenHistoryItem[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      SHORTEN_HISTORY_STORAGE_KEY_V2,
      JSON.stringify(items)
    );
  } catch {
    // ignore
  }
}

export function notifyShortenHistoryUpdated() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(SHORTEN_HISTORY_UPDATED_EVENT));
}

export function addShortenHistoryItem(item: ShortenHistoryItem) {
  const current = loadShortenHistory();
  const next = [item, ...current.filter((x) => x.id !== item.id)]
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, MAX_HISTORY_ITEMS);
  saveShortenHistory(next);
  notifyShortenHistoryUpdated();
}

export function removeShortenHistoryItem(id: string) {
  const current = loadShortenHistory();
  const next = current.filter((x) => x.id !== id);
  saveShortenHistory(next);
  notifyShortenHistoryUpdated();
}

export function clearShortenHistory() {
  saveShortenHistory([]);
  notifyShortenHistoryUpdated();
}

export function isShortenHistoryStorageKey(key: string | null) {
  return (
    key === SHORTEN_HISTORY_STORAGE_KEY_V1 ||
    key === SHORTEN_HISTORY_STORAGE_KEY_V2
  );
}

export function getShortenHistorySnapshot(): ShortenHistorySnapshot {
  if (typeof window === "undefined") return null;

  const rawV2 = window.localStorage.getItem(SHORTEN_HISTORY_STORAGE_KEY_V2);
  const rawV1 = rawV2
    ? null
    : window.localStorage.getItem(SHORTEN_HISTORY_STORAGE_KEY_V1);
  const raw = rawV2 ?? rawV1;

  const key = rawV2 ? `v2:${rawV2}` : raw ? `v1:${raw}` : null;

  if (key === cachedHistoryKey) {
    return cachedHistorySnapshot;
  }

  cachedHistoryKey = key;
  cachedHistorySnapshot = loadShortenHistory();

  const migratedRawV2 = window.localStorage.getItem(
    SHORTEN_HISTORY_STORAGE_KEY_V2
  );
  if (migratedRawV2) {
    cachedHistoryKey = `v2:${migratedRawV2}`;
  }

  return cachedHistorySnapshot;
}

export function getShortenHistoryServerSnapshot(): ShortenHistorySnapshot {
  return null;
}

export function subscribeShortenHistory(onStoreChange: () => void): () => void {
  if (typeof window === "undefined") return () => {};

  const onStorage = (e: StorageEvent) => {
    if (isShortenHistoryStorageKey(e.key)) onStoreChange();
  };

  window.addEventListener(SHORTEN_HISTORY_UPDATED_EVENT, onStoreChange);
  window.addEventListener("storage", onStorage);

  return () => {
    window.removeEventListener(SHORTEN_HISTORY_UPDATED_EVENT, onStoreChange);
    window.removeEventListener("storage", onStorage);
  };
}
