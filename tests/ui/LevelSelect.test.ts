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

  it("level 4 is enabled (boss arena unlocked)", () => {
    const ls = new LevelSelect(vi.fn(), vi.fn(), container);
    const btn = container.querySelector<HTMLButtonElement>(`#level-select-4`);
    expect(btn).not.toBeNull();
    expect(btn?.disabled).toBe(false);
    expect(btn?.classList.contains("level-btn-disabled")).toBe(false);
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

  // (disabled-placeholder behaviour removed once level 4 was unlocked.)
  it("clicking Level 4 fires onLevelSelected(4) and hides the overlay", () => {
    const onLevelSelected = vi.fn();
    const ls = new LevelSelect(onLevelSelected, vi.fn(), container);
    ls.show();

    container.querySelector<HTMLButtonElement>("#level-select-4")?.click();

    expect(onLevelSelected).toHaveBeenCalledOnce();
    expect(onLevelSelected).toHaveBeenCalledWith(4);
    expect(container.querySelector("#level-select")?.classList.contains("hidden")).toBe(true);
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

  describe("record display", () => {
    it("renders no record badges when no records source is supplied", () => {
      const ls = new LevelSelect(vi.fn(), vi.fn(), container);
      expect(container.querySelectorAll(".level-best").length).toBe(0);
      ls.destroy();
    });

    it("renders a record badge on levels 1-3 only when records source supplied", () => {
      const records = { getBest: vi.fn().mockReturnValue(0) };
      const ls = new LevelSelect(vi.fn(), vi.fn(), container, records);
      const lvl1 = container.querySelector("#level-select-1 .level-best");
      const lvl2 = container.querySelector("#level-select-2 .level-best");
      const lvl3 = container.querySelector("#level-select-3 .level-best");
      const lvl4 = container.querySelector("#level-select-4 .level-best");
      expect(lvl1).not.toBeNull();
      expect(lvl2).not.toBeNull();
      expect(lvl3).not.toBeNull();
      expect(lvl4).toBeNull();
      ls.destroy();
    });

    it("displays the best distance with metres when > 0", () => {
      const records = {
        getBest: vi.fn((lvl: 1 | 2 | 3): number => (lvl === 2 ? 42 : 0)),
      };
      const ls = new LevelSelect(vi.fn(), vi.fn(), container, records);
      const lvl2 = container.querySelector("#level-select-2 .level-best");
      expect(lvl2?.textContent).toContain("42");
      expect(lvl2?.textContent).toContain("m");
      const lvl1 = container.querySelector("#level-select-1 .level-best");
      // Zero record renders the placeholder em-dash, not "0 m".
      expect(lvl1?.textContent).not.toContain("0 m");
      ls.destroy();
    });

    it("show() refreshes record labels from the live records source", () => {
      let best = 0;
      const records = { getBest: vi.fn(() => best) };
      const ls = new LevelSelect(vi.fn(), vi.fn(), container, records);
      const badge = container.querySelector("#level-select-1 .level-best");
      const initial = badge?.textContent ?? "";

      best = 99;
      ls.show();
      expect(badge?.textContent).toContain("99");
      expect(badge?.textContent).not.toBe(initial);
      ls.destroy();
    });
  });
});
