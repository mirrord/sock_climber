import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@core": resolve(__dirname, "src/core"),
      "@input": resolve(__dirname, "src/input"),
      "@physics": resolve(__dirname, "src/physics"),
      "@entities": resolve(__dirname, "src/entities"),
      "@systems": resolve(__dirname, "src/systems"),
      "@level": resolve(__dirname, "src/level"),
      "@render": resolve(__dirname, "src/render"),
      "@ui": resolve(__dirname, "src/ui"),
      "@audio": resolve(__dirname, "src/audio"),
    },
  },
  test: {
    environment: "jsdom",
    globals: false,
    include: ["tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
    },
  },
});
