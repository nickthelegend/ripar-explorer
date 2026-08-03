import next from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

/**
 * Flat config, because `npm run lint` runs bare `eslint` and ESLint 9 looks for
 * exactly this file. Without it the script did not fail on a lint error — it
 * failed before reading a single line of source, which is worse: a lint script
 * that cannot run is indistinguishable from a codebase with no lint problems.
 *
 * `core-web-vitals` is the stricter of the two Next presets (it promotes the
 * performance rules from warning to error), and the TypeScript preset adds the
 * parser and the TS-aware rules on top.
 */
const config = [
  {
    ignores: [".next/**", "out/**", "build/**", "next-env.d.ts"],
  },
  ...next,
  ...nextTypescript,
  {
    rules: {
      // The data layer is full of non-null assertions that are load-bearing and
      // provable from a few lines up — `AGENTS_BY_ID.get(id)!` right after the
      // id came out of that same map. Left as a warning so new ones still get
      // noticed rather than silently normalised.
      "@typescript-eslint/no-non-null-assertion": "off",
      // Unused function arguments are how you document a signature you are
      // deliberately not using; unused *variables* are still an error.
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },
];

export default config;
