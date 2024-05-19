import globals from "globals";
import pluginJs from "@eslint/js";
import tseslint from "typescript-eslint";
import js from "@eslint/js";

export default [
  js.configs.recommended,
  {
    rules: {
      "no-unused-vars": "error",
      "no-undef": "error"
    },
    languageOptions: { globals: globals.node }
  },
  pluginJs.configs.recommended,
  ...tseslint.configs.recommended,
];