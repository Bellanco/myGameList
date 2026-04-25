const tsParser = require('@typescript-eslint/parser');

module.exports = [
  {
    files: ["public/ts/**/*.ts", "!public/ts/**/*.test.ts"],
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
        ecmaFeatures: { jsx: false }
      }
    },
    rules: {
      "no-console": "off"
    }
  },
  {
    files: ["public/ts/**/*.test.ts"],
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
        ecmaFeatures: { jsx: false }
      }
    },
    rules: {
      "no-console": "off"
    }
  }
];
