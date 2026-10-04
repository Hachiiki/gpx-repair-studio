import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";
import { dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const eslintConfig = [...nextCoreWebVitals, ...nextTypescript, {
  rules: {
    // TypeScript rules
    "@typescript-eslint/no-explicit-any": "off",
    "@typescript-eslint/no-unused-vars": "off",
    "@typescript-eslint/no-non-null-assertion": "off",
    "@typescript-eslint/ban-ts-comment": "off",
    "@typescript-eslint/prefer-as-const": "off",
    "@typescript-eslint/no-unused-disable-directive": "off",

    // React rules
    "react-hooks/exhaustive-deps": "off",
    "react-hooks/purity": "off",
    "react/no-unescaped-entities": "off",
    "react/display-name": "off",
    "react/prop-types": "off",
    "react-compiler/react-compiler": "off",

    // Next.js rules
    "@next/next/no-img-element": "off",
    "@next/next/no-html-link-for-pages": "off",

    // General JavaScript rules
    "prefer-const": "off",
    "no-unused-vars": "off",
    "no-console": "off",
    "no-debugger": "off",
    "no-empty": "off",
    "no-irregular-whitespace": "off",
    "no-case-declarations": "off",
    "no-fallthrough": "off",
    "no-mixed-spaces-and-tabs": "off",
    "no-redeclare": "off",
    "no-undef": "off",
    "no-unreachable": "off",
    "no-useless-escape": "off",
  },
},
// ---------------------------------------------------------------------------
// GPX Repair Studio — architecture boundary rules (docs/MASTER_PLAN.md §F).
// These guards are intentionally defined now, in Phase 0, so that later
// phases cannot accidentally violate layering. Most are dormant until the
// directories they protect (features/, lib/map/, lib/geo/, …) exist.
// ---------------------------------------------------------------------------

// 1) MapLibre isolation: `maplibre-gl` may only be imported by the map
//    controller adapter in src/lib/map/** (added in Phase 3).
{
  files: ["src/**/*.{ts,tsx}"],
  ignores: ["src/lib/map/**"],
  rules: {
    "no-restricted-imports": ["error", {
      patterns: [{
        group: ["maplibre-gl", "maplibre-gl/*"],
        message:
          "MapLibre must only be imported inside src/lib/map/** (map controller isolation). Components use hooks/useMapController instead.",
      }],
    }],
  },
},

// 2) Presentation layer: components must not reach into feature internals or
//    the map controller; they receive data via props/hooks and dispatch intent.
{
  files: ["src/components/**/*.{ts,tsx}"],
  rules: {
    "no-restricted-imports": ["error", {
      patterns: [
        {
          group: ["@/features", "@/features/*"],
          message:
            "Components must not import feature internals — use hooks/, state/, or types/ instead.",
        },
        {
          group: ["@/lib/map", "@/lib/map/*"],
          message:
            "Components must not use the map controller directly — use hooks/useMapController.",
        },
      ],
    }],
  },
},

// 3) Domain purity: features/** and lib/geo/** are pure TypeScript — no
//    framework imports, no DOM access, no global fetch (inject it instead).
{
  files: ["src/features/**/*.{ts,tsx}", "src/lib/geo/**/*.ts"],
  rules: {
    "no-restricted-imports": ["error", {
      patterns: [
        {
          group: ["react", "react-dom", "react-dom/*", "next/*"],
          message: "Domain modules must stay pure — no framework imports.",
        },
        {
          group: ["@/components", "@/components/*", "@/hooks", "@/hooks/*", "@/state", "@/state/*", "@/app", "@/app/*"],
          message:
            "Domain modules must not depend on presentation or application layers.",
        },
      ],
    }],
    "no-restricted-globals": ["error",
      { name: "window", message: "Domain modules must not access the DOM." },
      { name: "document", message: "Domain modules must not access the DOM." },
      {
        name: "fetch",
        message:
          "Domain modules must not use global fetch — accept an injected fetch implementation (see features/elevation providers, Phase 6).",
      },
    ],
  },
},


// ---------------------------------------------------------------------------
// Phase 21 — no hard-coded UI strings (docs/MASTER_PLAN.md §EE 21.1).
// JSX text and text-bearing props must flow through the i18n runtime
// (useI18n().t / translateNow / translateLabel), never ship as raw
// literals. Scope: the app's own surfaces — components (minus the
// dormant shadcn boilerplate in ui/, never rendered), hooks, state,
// and the app shell. esquery selectors keep this dependency-free.
//
// Legitimate non-copy (machine values, single letters like the
// compass "N", punctuation-only nodes) never matches. Genuinely
// untranslatable text (artifact vocabulary shown as an example) may
// carry an inline eslint-disable with a reason — reviewable diffs.
{
  files: ["src/components/**/*.{ts,tsx}", "src/hooks/**/*.{ts,tsx}", "src/state/**/*.{ts,tsx}", "src/app/**/*.{ts,tsx}"],
  ignores: ["src/components/ui/**"],
  rules: {
    "no-restricted-syntax": ["error",
      {
        selector: "JSXText[value=/[A-Za-z]{2,}/]",
        message:
          "Hard-coded UI text — move it to the dictionary and render t('your.key') (Phase 21 §EE 21.1).",
      },
      {
        selector: "JSXAttribute[name.name=/^(label|title|placeholder|alt|aria-label|aria-description|description|kicker|blurb|heading|summary|message|text|caption|hint|prompt)$/] > Literal[value=/[A-Za-z]{2,}/]",
        message:
          "Text-bearing prop with a hard-coded string — pass a dictionary key and resolve it through t() at render (Phase 21 §EE 21.1).",
      },
    ],
  },
},

// 4) Composition rule: app/page.tsx composes layout components and hooks only.
{
  files: ["src/app/page.tsx"],
  rules: {
    "no-restricted-imports": ["error", {
      patterns: [
        {
          group: ["@/features", "@/features/*"],
          message:
            "app/page.tsx is a composition layer — business logic belongs in features/, exposed via hooks.",
        },
        {
          group: ["@/lib", "@/lib/*"],
          message:
            "app/page.tsx is a composition layer — use components and hooks.",
        },
      ],
    }],
  },
},
{
  ignores: [
    "node_modules/**",
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "examples/**",
    "skills",
    ".zscripts/**",
    ".build-verify/**",
    "coverage/**",
    "playwright-report/**",
    "test-results/**",
    // Vendored MapLibre worker assets (minified, synced from node_modules by
    // scripts/sync-maplibre-worker.mjs — not project source).
    "public/vendor/**",
  ],
}];

export default eslintConfig;
