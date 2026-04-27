import { vi, describe, it, expect } from "vitest";

// ─── Mock THREE.WebGLRenderer so jsdom doesn't need a real WebGL context ─────

vi.mock("three", async (importOriginal) => {
  const THREE = await importOriginal<typeof import("three")>();
  return {
    ...THREE,
    WebGLRenderer: class MockWebGLRenderer {
      domElement: HTMLCanvasElement = document.createElement("canvas");
      setSize(_w: number, _h: number): void {}
      render(_scene: unknown, _camera: unknown): void {}
    },
  };
});

import { Renderer } from "../../src/render/Renderer.js";

describe("Renderer", () => {
  it("constructs without throwing (smoke test)", () => {
    expect(() => new Renderer()).not.toThrow();
  });

  it("exposes a domElement after construction", () => {
    const r = new Renderer();
    expect(r.domElement).toBeInstanceOf(HTMLCanvasElement);
  });

  it("resize does not throw", () => {
    const r = new Renderer();
    expect(() => r.resize(800, 600)).not.toThrow();
  });

  it("render does not throw with a mock scene and camera", async () => {
    const THREE = await import("three");
    const r = new Renderer();
    const scene = new THREE.Scene();
    const cam = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 100);
    expect(() => r.render(scene, cam)).not.toThrow();
  });
});
