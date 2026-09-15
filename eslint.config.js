const browserGlobals = {
  PREPARAKEY_CONFIG: "readonly",
  alert: "readonly",
  caches: "readonly",
  clearInterval: "readonly",
  confirm: "readonly",
  document: "readonly",
  fetch: "readonly",
  innerWidth: "readonly",
  localStorage: "readonly",
  location: "readonly",
  navigator: "readonly",
  self: "readonly",
  setInterval: "readonly",
  setTimeout: "readonly",
  window: "readonly"
};

export default [
  {
    ignores: ["dist/**", "node_modules/**"]
  },
  {
    files: ["js/**/*.js", "sw.js"],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: "script",
      globals: browserGlobals
    },
    rules: {
      eqeqeq: "error",
      "no-constant-condition": "error",
      "no-undef": "error",
      "no-unreachable": "error",
      "no-unused-vars": ["error", { "argsIgnorePattern": "^_" }]
    }
  },
  {
    files: ["eslint.config.js", "scripts/**/*.mjs", "tests/**/*.mjs"],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: "module",
      globals: {
        console: "readonly"
      }
    },
    rules: {
      eqeqeq: "error",
      "no-constant-condition": "error",
      "no-undef": "error",
      "no-unreachable": "error",
      "no-unused-vars": "error"
    }
  }
];
