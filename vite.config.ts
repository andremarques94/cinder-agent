import { defineConfig } from "vite-plus";

export default defineConfig({
  fmt: {
    ignorePatterns: ["**/worker-configuration.d.ts", "PLAN.md", "CHANGELOG.md"],
    sortImports: true,
  },
  lint: {
    ignorePatterns: ["**/worker-configuration.d.ts"],
    jsPlugins: [{ name: "vite-plus", specifier: "vite-plus/oxlint-plugin" }],
    rules: {
      "vite-plus/prefer-vite-plus-imports": "error",
      curly: ["error", "all"],
      "typescript/consistent-type-assertions": ["error", { assertionStyle: "never" }],
      "typescript/no-non-null-assertion": "error",
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
