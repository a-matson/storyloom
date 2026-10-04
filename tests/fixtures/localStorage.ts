/** node has no localStorage, and the pending-save marker needs a synchronous store. */
export function fakeLocalStorage(): Map<string, string> {
  const items = new Map<string, string>();
  globalThis.localStorage = {
    getItem: (k) => items.get(k) ?? null,
    setItem: (k, v) => void items.set(k, v),
    removeItem: (k) => void items.delete(k),
    clear: () => items.clear(),
    key: (i) => [...items.keys()][i] ?? null,
    get length() {
      return items.size;
    },
  };
  return items;
}
