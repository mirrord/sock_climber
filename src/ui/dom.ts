/**
 * Lightweight DOM helpers for the UI module.
 *
 * All elements are pre-created at construction time; these utilities
 * are never called inside the per-frame update path.
 */

/**
 * Create an HTML element, assign CSS classes, and optionally set attributes.
 *
 * @param tag    - Tag name (e.g. `"div"`).
 * @param classes - CSS class names to add.
 * @param attrs   - Optional key/value attribute map.
 */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  classes: string[] = [],
  attrs: Record<string, string> = {},
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (classes.length > 0) element.classList.add(...classes);
  for (const [k, v] of Object.entries(attrs)) {
    element.setAttribute(k, v);
  }
  return element;
}

/**
 * Set an element's `textContent` without touching the DOM if the value has
 * not changed (avoids unnecessary reflows).
 */
export function setText(element: HTMLElement, text: string): void {
  if (element.textContent !== text) {
    element.textContent = text;
  }
}

/**
 * Show or hide an element by toggling the `hidden` CSS class.
 * `true` = visible (remove `hidden`), `false` = invisible (add `hidden`).
 */
export function setVisible(element: HTMLElement, visible: boolean): void {
  element.classList.toggle("hidden", !visible);
}
