import { describe, it, expect, beforeEach, vi } from "vitest";
import { LevelSelect } from "../../src/ui/LevelSelect.js";

function makeContainer(): HTMLElement {
  const div = document.createElement("div");
  document.body.appendChild(div);
  return div;
}

describe("LevelSelect", () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = makeContainer();
  });

  it("is hidden on construction", () => {
    const ls = new LevelSelect(vi.fn(), vi.fn(), container);
    const overlay = container.querySelector("#level-select");
    expect(overlay?.classList.contains("hidden")).toBe(true);
    ls.destroy();
  });

  it("show() reveals the overlay and hide() hides it", () => {
    const ls = new LevelSelect(vi.fn(), vi.fn(), container);
    ls.show();
    const overlay = container.querySelector("#level-select");
    expect(overlay?.classList.contains("hidden")).toBe(false);
    ls.hide();
    expect(overlay?.classList.contains("hidden")).toBe(true);
    ls.destroy();
  });

  it("renders four level buttons plus a back button", () => {
    const ls = new LevelSelect(vi.fn(), vi.fn(), container);
    expect(container.querySelector("#level-select-1")).not.toBeNull();
    expect(container.querySelector("#level-select-2")).not.toBeNull();
    expect(container.querySelector("#level-select-3")).not.toBeNull();
    expect(container.querySelector("#level-select-4")).not.toBeNull();
    expect(container.querySelector("#level-select-back")).not.toBeNull();
    ls.destroy();
  });

  it("levels 3-4 are disabled placeholders", () => {
    const ls = new LevelSelect(vi.fn(), vi.fn(), container);
    for (const id of [3, 4]) {
      const btn = container.querySelector<HTMLButtonElement>(`#level-select-${id}`);
      expect(btn).not.toBeNull();
      expect(btn?.disabled).toBe(true);
      expect(btn?.classList.contains("level-btn-disabled")).toBe(true);
    }
    ls.destroy();
  });

  it("level 2 is enabled and clickable", () => {
    const onLevelSelected = vi.fn();
    const ls = new LevelSelect(onLevelSelected, vi.fn(), container);
    ls.show();
    const btn = container.querySelector<HTMLButtonElement>("#level-select-2");
    expect(btn?.disabled).toBe(false);
    btn?.click();
    expect(onLevelSelected).toHaveBeenCalledWith(2);
    ls.destroy();
  });

  it("clicking Level 1 calls onLevelSelected(1) and hides the overlay", () => {
    const onLevelSelected = vi.fn();
    const ls = new LevelSelect(onLevelSelected, vi.fn(), container);
    ls.show();

    container.querySelector<HTMLButtonElement>("#level-select-1")?.click();

    expect(onLevelSelected).toHaveBeenCalledOnce();
    expect(onLevelSelected).toHaveBeenCalledWith(1);
    expect(container.querySelector("#level-select")?.classList.contains("hidden")).toBe(true);
    ls.destroy();
  });

  it("clicking a disabled placeholder does NOT fire onLevelSelected", () => {
    const onLevelSelected = vi.fn();
    const ls = new LevelSelect(onLevelSelected, vi.fn(), container);
    ls.show();

    // Force a click despite the disabled attribute (jsdom honours `disabled`
    // by default and silently swallows the event, which is itself the
    // behaviour we want to assert).
    container.querySelector<HTMLButtonElement>("#level-select-3")?.click();
    container.querySelector<HTMLButtonElement>("#level-select-4")?.click();

    expect(onLevelSelected).not.toHaveBeenCalled();
    expect(container.querySelector("#level-select")?.classList.contains("hidden")).toBe(false);
    ls.destroy();
  });

  it("clicking Back calls onBack and hides the overlay", () => {
    const onBack = vi.fn();
    const ls = new LevelSelect(vi.fn(), onBack, container);
    ls.show();

    container.querySelector<HTMLButtonElement>("#level-select-back")?.click();

    expect(onBack).toHaveBeenCalledOnce();
    expect(container.querySelector("#level-select")?.classList.contains("hidden")).toBe(true);
    ls.destroy();
  });
});
