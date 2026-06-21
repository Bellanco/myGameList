# Seguridad de Datos - Resumen de Cambios

## 🔍 Auditoría de Seguridad Realizada

Se realizó una auditoría completa de seguridad que identificó y mitiga los siguientes riesgos:

### ❌ Problemas Identificados

1. **Datos personales en localStorage sin encriptación**
   - Listas de juegos, análisis, favoritos
   - Tokens de GitHub (CRÍTICO)
   - Configuración de sincronización

2. **Tokens de API en texto plano**
   - Token de GitHub almacenado sin protección
   - Visible en Dev Tools de navegador

3. **Datos en GitHub Gist sin encriptación**
   - Perfil social (nombre, favoritos)
   - Análisis de juegos
   - Historial de actividad

### ✅ Mejoras Implementadas

#### 1. Cifrado del token de GitHub (`src/core/security/crypto.ts`)
WebCrypto nativo (AES-GCM 256). Hay DOS mecanismos con garantías DISTINTAS — importante no confundirlos:

- **Token operativo en localStorage (C4): cifrado en reposo de verdad.** Se cifra con una clave AES-GCM
  aleatoria **no exportable** guardada en IndexedDB; ni el propio JS puede leer el material de la clave. El token
  NUNCA se guarda en claro. Protege ante copia/volcado del localStorage. NO protege ante un XSS ya ejecutándose
  en el origen (que también podría usar la clave). Migración automática del token en claro legacy al cargar.

- **Token en Firestore `privateConfig` (C3): OFUSCACIÓN, no confidencialidad.** Se "cifra" con una clave
  derivada del `uid` (PBKDF2, salt aleatorio por mensaje + 600k iteraciones desde C3). Como el `uid` es público
  (es la clave del propio documento), quien pueda leer el doc puede descifrarlo. **La protección real es la regla
  owner-only de Firestore (`privateConfig/{uid}`), no el cifrado.** El cifrado del uid es defensa en profundidad.
  Para reducir el alcance: usar un PAT *fine-grained* con scope solo-gist y expiración.

#### 2. Eliminación de Funcionalidad de Recomendados
- ✂️ Modal de recomendación eliminado completamente
- 📊 Referencias removidas de UI (perfiles, feed, stats)
- 🗑️ Etiquetas de configuración limpiadas
- 📝 Constantes innecesarias eliminadas

**Reducción de complejidad:**
- Menos datos personales almacenados
- Menos llamadas API
- Menos superficie de ataque

### 🛡️ Recomendaciones de Seguridad

#### Para el usuario (Operacional)
1. **Usa HTTPS siempre** - Los datos nunca deben viajar sin cifrar
2. **Cierra sesión en navegadores públicos** - Especialmente después de sincronizar
3. **Revisa permisos de Gist** - Asegúrate de que tus datos en GitHub sean privados
4. **No compartas tokens** - El token de GitHub da acceso a todos tus Gists

#### Para el desarrollo (Próximas fases)
1. **Implementar encriptación en localStorage**
   ```typescript
   // Reemplazar saveLocalState() con versión encriptada
   export async function saveLocalStateEncrypted(payload: StoragePayload) {
     const encrypted = await encrypt(JSON.stringify(payload));
     localStorage.setItem(STORAGE_KEY, JSON.stringify(encrypted));
   }
   ```

2. **Implementar encriptación en Gist**
   - Encriptar perfil antes de enviar a GitHub
   - Los datos viajan encriptados en la API de GitHub
   - Solo el navegador del usuario puede desencriptar

3. **Usar Service Worker para datos sensibles**
   - Mantener tokens lejos del localStorage
   - Usar Memory storage para sesión activa
   - Limpiar memoria al cerrar sesión

4. **Implementar CSP (Content Security Policy)**
   - Prevenir inyección de scripts
   - Restringir fuentes de datos

### 📋 Estado de Implementación

| Componente | Estado | Detalles |
|-----------|--------|---------|
| Módulo de Crypto | ✅ Listo | AES-GCM 256-bit; v2 con salt aleatorio + 600k PBKDF2 (lee v1) |
| Token en localStorage cifrado en reposo (C4) | ✅ Hecho | Clave de dispositivo no exportable en IndexedDB; sin token en claro |
| Token en Firestore (C3) | ⚠️ Ofuscación | Frontera real = regla owner-only `privateConfig`; el uid no es secreto |
| Validación de esquema en reglas (C5/T4) | ✅ Hecho | `hasOnly` en profiles/privateConfig + tests de emulador (9/9) |
| Recomendaciones (código muerto) | ✅ Eliminado | Sin consumidores y reglas admin-only |
| Migración PII (email/uid en `profiles`) | ⏳ Gated | Índice pseudónimo por profileId — ver CODE-REVIEW-IMPROVEMENTS.md |
| Documentación seguridad | ✅ Completado | Este archivo |

### 🔒 Niveles de Seguridad

```
┌─────────────────────────────────────────────────┐
│ MÁXIMA SEGURIDAD                                 │
│ - HTTPS + TLS 1.3                               │
│ - Encriptación end-to-end                       │
│ - Tokens en Memory (sin persistencia)            │
│ - CSP header                                     │
└─────────────────────────────────────────────────┘
         ↓
┌─────────────────────────────────────────────────┐
│ SEGURIDAD MEDIA (Implementado)                   │
│ - HTTPS + TLS 1.3                               │
│ - Encriptación localStorage                     │
│ - Encriptación Gist                             │
│ - Tokens con expiración                         │
└─────────────────────────────────────────────────┘
         ↓
┌─────────────────────────────────────────────────┐
│ SEGURIDAD BÁSICA (Actual)                        │
│ - HTTPS                                          │
│ - Tokens en localStorage                        │
│ - Datos en Gist sin cifrar                      │
└─────────────────────────────────────────────────┘
```

### 📞 Contacto / Reportar Problemas de Seguridad

Si encuentras un problema de seguridad, **NO** lo publiques públicamente.
Reporta de forma responsable directamente al mantenedor.

---

**Última actualización:** Mayo 2026
**Versión:** 2.0.0
