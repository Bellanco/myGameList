const tsParser = require('@typescript-eslint/parser');
const tsPlugin = require('@typescript-eslint/eslint-plugin');
const jsxA11yPlugin = require('eslint-plugin-jsx-a11y');
const reactPlugin = require('eslint-plugin-react');
const reactHooksPlugin = require('eslint-plugin-react-hooks');

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
      'jsx-a11y': jsxA11yPlugin,
      'react-hooks': reactHooksPlugin
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

      // Hooks. Con 158 `useCallback`, 72 `useEffect` y 47 `useMemo` escritos a mano, NADA comprobaba las listas
      // de dependencias, y esa es justo la clase de fallo que más caro ha salido aquí: el bug del hub social que
      // llevaba a Ajustes con un 401 era un `useMemo` con dependencias `[]` leyendo una configuración que se
      // resuelve de forma asíncrona. `rules-of-hooks` va en "error" (un hook llamado bajo condición es siempre un
      // fallo); `exhaustive-deps` en "warn" porque hay omisiones deliberadas —efectos de arranque, suscripciones
      // de una sola vez— que se revisan una a una y no deben tumbar el build mientras tanto.
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      
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
  },

  /**
   * CAPA TIPADA — solo `src/model` y `src/viewmodel`.
   *
   * Qué añade: hasta aquí había parser de TypeScript pero NINGUNA regla de TypeScript, así que ESLint entendía
   * la sintaxis y no comprobaba nada del sistema de tipos. Las cuatro reglas de abajo son las que de verdad
   * importan en este código, y todas van del mismo fallo: una promesa que nadie espera. En la capa de datos eso
   * no da un error visible —da un dato viejo, un guardado que no llegó o un merge contra un estado que ya
   * cambió—, que es exactamente la familia de bugs de sincronización que más caro ha salido en este proyecto.
   *
   * `void promesa` SIGUE SIENDO VÁLIDO: `no-floating-promises` acepta el operador `void` como marca explícita de
   * "esto es best-effort a propósito", que es justo el patrón que ya usa el código. Lo que caza es la llamada
   * async que alguien olvidó marcar de una forma o de otra.
   *
   * Por qué NO se aplica a todo `src/`: el análisis con tipos obliga a ESLint a construir el programa entero y
   * el lint pasa de segundos a decenas de segundos. Estas dos carpetas son donde vive el riesgo (el resto es
   * vista y constantes), así que el reparto coste/beneficio está aquí.
   */
  {
    files: ["src/model/**/*.ts", "src/viewmodel/**/*.{ts,tsx}"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: __dirname
      }
    },
    plugins: {
      '@typescript-eslint': tsPlugin
    },
    rules: {
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
      "@typescript-eslint/await-thenable": "error",
      "@typescript-eslint/require-await": "error"
    }
  }
];
