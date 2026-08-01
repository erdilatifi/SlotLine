import js from "@eslint/js";
import boundaries from "eslint-plugin-boundaries";
import prettier from "eslint-config-prettier";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["**/dist/**", "**/node_modules/**", "**/generated/**", "**/coverage/**"],
  },
  js.configs.recommended,
  tseslint.configs.recommended,
  // Module-boundary enforcement, configured on day one so it never needs
  // retrofitting (handbook Ch. 3.1). A feature module under src/modules/*
  // may only be reached through its own index.ts barrel, and may only
  // depend on infrastructure leaves or other modules' barrels — never
  // another module's internals.
  {
    files: ["src/**/*.ts"],
    plugins: { boundaries },
    settings: {
      "import/resolver": {
        node: { extensions: [".js", ".ts"] },
      },
      "boundaries/elements": [
        {
          type: "module",
          pattern: "src/modules/*",
          capture: ["elementName"],
        },
        {
          type: "infra",
          pattern: "src/{config,platform}/**",
        },
      ],
    },
    rules: {
      "boundaries/dependencies": [
        "error",
        {
          default: "allow",
          policies: [
            {
              from: { element: { type: "module" } },
              disallow: { element: { type: "module" } },
              message:
                "Reach another module only through its index.ts barrel, never its internals.",
            },
            {
              from: { element: { type: "module" } },
              allow: { element: { type: "module", fileInternalPath: "index.ts" } },
            },
            {
              from: { element: { type: "infra" } },
              disallow: { element: { type: "module" } },
              message: "Infrastructure leaves must not depend on feature modules.",
            },
          ],
        },
      ],
    },
  },
  // Prettier owns formatting; turn off any ESLint rule that would fight it.
  prettier,
);
