---
agent: agent
description: "Crear un nuevo componente React para Mis Listas"
---

# Nuevo componente: ${input:component_name}

## Contexto
Lee `.github/copilot-instructions.md` (§3 estructura, §7 capa de vista) y `.github/instructions/view.instructions.md`.

## Requisitos del componente
${input:requirements}

## Plantilla base

Seguir este patrón consistente con el resto del proyecto (sustituye `Nombre` por el nombre del componente y
`nombre-kebab` por su clase):

```tsx
import { memo } from 'react';
// imports necesarios...

interface NombreProps {
  // props tipadas, sin `any`
}

export const Nombre = memo(function Nombre({ ...props }: NombreProps) {
  // lógica del componente
  return (
    <div className="nombre-kebab">
      {/* contenido */}
    </div>
  );
});
```

## Reglas
- **Memo por defecto** para componentes que reciben props de listas
- **SCSS**: en la hoja del área (`src/styles/<area>.scss`, importada por el componente si es de una pantalla
  perezosa) o en un parcial de `index.scss`; con fichas (`var(--…)`), sin colores ni tamaños literales. El carácter
  propio de un tema va en `src/styles/themes/<id>/<id>.scss`. Ver `.github/instructions/styles.instructions.md`
- **Textos** en español, desde `src/core/constants/*Labels.ts`, no literales en el JSX
- **Sin lógica de datos**: usa hooks de `src/viewmodel/` o recibe datos por props
- **Responsive**: probar a 360px, 768px, 1024px, 1440px, en claro y oscuro
- **Hub social**: si es una pantalla o vista nueva del hub, añádela también a `docs/maquetas/social.html`
- **Accesibilidad**: ARIA labels, roles semánticos, navegación por teclado
- **Icons**: usar `<Icon name="..." />` del componente existente `Icon.tsx`
- **Pesado**: si es una sección o modal grande, cárgalo con `React.lazy()` como en `App.tsx`

## Verificación
```bash
npm run typecheck
npm run validate
```
