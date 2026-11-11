import { defineConfig } from "vite-plus";

export default defineConfig({
  fmt: {
    ignorePatterns: ["**/worker-configuration.d.ts", "docs/**", "CHANGELOG.md"],
    sortImports: true,
  },
  lint: {
    ignorePatterns: ["**/worker-configuration.d.ts"],
    plugins: ["typescript", "unicorn", "oxc", "promise", "vitest"],
    jsPlugins: [{ name: "vite-plus", specifier: "vite-plus/oxlint-plugin" }],
    rules: {
      "vite-plus/prefer-vite-plus-imports": "error",
      curly: ["error", "all"],
      "no-else-return": ["error", { allowElseIf: false }],
      "no-lonely-if": "error",
      "no-nested-ternary": "error",
      "promise/prefer-await-to-then": ["error", { strict: true }],
      "typescript/consistent-type-assertions": ["error", { assertionStyle: "never" }],
      "typescript/no-non-null-assertion": "error",
      "typescript/no-floating-promises": "error",
      "typescript/return-await": ["error", "in-try-catch"],
      "typescript/switch-exhaustiveness-check": "error",
      "vitest/require-top-level-describe": "error",
      "vitest/valid-title": [
        "error",
        { mustMatch: { describe: "^given ", test: "^when .+, then .+" } },
      ],
    },
    options: { typeAware: true, typeCheck: true },
  },
  run: {
    cache: true,
  },
  staged: {
    "*": "vp check --fix",
  },
});
