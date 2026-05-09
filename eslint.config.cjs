const tsParser = require('@typescript-eslint/parser');

module.exports = [
  {
    files: ["src/**/*.{ts,tsx}", "!src/**/*.test.ts", "!src/**/*.test.tsx"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      parser: tsParser,
      globals: {
        window: "readonly",
        document: "readonly",
        localStorage: "readonly",
        fetch: "readonly",
        navigator: "readonly",
        Event: "readonly"
      },
      parserOptions: {
        ecmaFeatures: { jsx: true }
      }
    },
    rules: {
      "no-console": "off"
    }
  },
  {
    files: ["tests/**/*.{ts,tsx}", "src/**/*.test.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      parser: tsParser,
      globals: {
        describe: "readonly",
        it: "readonly",
        expect: "readonly",
        beforeEach: "readonly",
        afterEach: "readonly"
      },
      parserOptions: {
        ecmaFeatures: { jsx: true }
      }
    },
    rules: {
      "no-console": "off"
    }
  }
];
