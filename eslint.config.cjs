const tsParser = require('@typescript-eslint/parser');
const jsxA11yPlugin = require('eslint-plugin-jsx-a11y');
const reactPlugin = require('eslint-plugin-react');

module.exports = [
  {
    ignores: ['dist/', 'node_modules/', 'coverage/']
  },
  {
    files: ["src/**/*.{ts,tsx}", "tests/**/*.{ts,tsx}"],
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
        Event: "readonly",
        indexedDB: "readonly",
        IDBDatabase: "readonly",
        IDBObjectStore: "readonly",
        describe: "readonly",
        it: "readonly",
        expect: "readonly",
        beforeEach: "readonly",
        afterEach: "readonly",
        vi: "readonly"
      },
      parserOptions: {
        ecmaFeatures: { jsx: true }
      }
    },
    plugins: {
      react: reactPlugin,
      'jsx-a11y': jsxA11yPlugin
    },
    settings: {
      react: {
        version: 'detect'
      }
    },
    rules: {
      // Core rules
      "no-console": ["warn", { allow: ["warn", "error"] }],
      "no-var": "error",
      "prefer-const": "error",
      "eqeqeq": ["error", "always"],
      "no-restricted-globals": ["error", "isNaN", "isFinite"],
      
      // React rules
      "react/jsx-uses-react": "off",
      "react/react-in-jsx-scope": "off",
      
      // Accesibilidad. Estaban en "warn" para adopción gradual; ya no hay ninguna violación, así que pasan a
      // "error": la adopción gradual solo sirve mientras queda algo que arreglar, y a partir de ahí un `warn` es
      // una regla que no impide la regresión (nadie falla el build por un aviso).
      "jsx-a11y/click-events-have-key-events": "error",
      "jsx-a11y/no-static-element-interactions": "error",
      "jsx-a11y/interactive-supports-focus": "error",
      "jsx-a11y/label-has-associated-control": "error",
      "jsx-a11y/anchor-is-valid": "error",
      "jsx-a11y/no-noninteractive-element-to-interactive-role": "error",
      // Reglas añadidas: cubren las clases de error que este repaso encontró a mano (ARIA sobre elementos que no
      // la exponen, roles sin sus propiedades obligatorias, alternativas textuales ausentes) para que no vuelvan.
      "jsx-a11y/alt-text": "error",
      "jsx-a11y/aria-props": "error",
      "jsx-a11y/aria-proptypes": "error",
      "jsx-a11y/aria-role": "error",
      "jsx-a11y/aria-unsupported-elements": "error",
      "jsx-a11y/heading-has-content": "error",
      "jsx-a11y/html-has-lang": "error",
      "jsx-a11y/iframe-has-title": "error",
      "jsx-a11y/no-autofocus": "error",
      "jsx-a11y/no-redundant-roles": "error",
      "jsx-a11y/role-has-required-aria-props": "error",
      "jsx-a11y/role-supports-aria-props": "error",
      "jsx-a11y/scope": "error",
      "jsx-a11y/tabindex-no-positive": "error"
    }
  }
];
