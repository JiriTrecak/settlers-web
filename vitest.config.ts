import {fileURLToPath} from 'node:url';
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve:{alias:{"@":fileURLToPath(new URL("./src",import.meta.url))}},
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // Scenario proofs advance thousands of fixed ticks while the live editor may be rendering.
    // Bound worker contention; wall-clock test deadlines are not simulation performance budgets.
    maxWorkers: 2,
    testTimeout: 20_000,
  },
});
