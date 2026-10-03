/**
 * Globe focus bus.
 * Voice tools dispatch `orbitwatch:focus` on window. The globe (or any later
 * component) can subscribe without importing the voice panel.
 */
export const FOCUS_EVENT = "orbitwatch:focus";

export interface FocusDetail {
  id: string;
}

export function dispatchFocusEncounter(id: string): void {
  if (typeof window === "undefined" || !id) return;
  window.dispatchEvent(new CustomEvent<FocusDetail>(FOCUS_EVENT, { detail: { id } }));
}

export function subscribeFocusEncounter(listener: (id: string) => void): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = (event: Event) => {
    const id = (event as CustomEvent<FocusDetail>).detail?.id;
    if (typeof id === "string" && id) listener(id);
  };
  window.addEventListener(FOCUS_EVENT, handler);
  return () => window.removeEventListener(FOCUS_EVENT, handler);
}
