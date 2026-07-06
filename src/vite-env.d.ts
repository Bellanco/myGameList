/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_FIREBASE_API_KEY: string;
  readonly VITE_FIREBASE_AUTH_DOMAIN: string;
  readonly VITE_FIREBASE_PROJECT_ID: string;
  readonly VITE_FIREBASE_STORAGE_BUCKET: string;
  readonly VITE_FIREBASE_MESSAGING_SENDER_ID: string;
  readonly VITE_FIREBASE_APP_ID: string;
  readonly VITE_FIREBASE_MEASUREMENT_ID?: string;
  readonly VITE_ENABLE_ANALYTICS?: string;
  // Client ID (público) de la GitHub OAuth App. Si está vacío, el botón "Conectar con GitHub" no aparece
  // y solo queda el flujo manual de token (PAT). El client_secret NUNCA vive aquí: va en la Function de Cloudflare.
  readonly VITE_GITHUB_CLIENT_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// Versión de la app inyectada por Vite (`define`) en build. Etiqueta errores y eventos de telemetría.
declare const __APP_VERSION__: string;
