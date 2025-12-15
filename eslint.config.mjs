/* eslint-disable import/no-default-export */

import hatenaconfig from "@hatena/eslint-config-hatena/flat";
import { globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = hatenaconfig(
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  [
    {
      rules: {
        "no-console": 0, // TODO: remove
        "@typescript-eslint/no-misused-promises": 0,
      },
    },
  ]
);

export default eslintConfig;
