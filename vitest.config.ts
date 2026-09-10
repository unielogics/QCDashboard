// Unit tests for the pure worksheet modules (src/components/sheet/*.ts):
// TSV parsing, keyboard navigation, money parsing and the recompute adapter.
// Nothing here touches the DOM, so the runner is node and Playwright's
// `tests/*.spec.ts` are deliberately outside `include`.
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["src/**/__tests__/**/*.test.ts"],
  },
});
