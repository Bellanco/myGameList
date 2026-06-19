---
mode: agent
description: "Crear un nuevo componente React para Mi Lista"
---

# Nuevo componente: {{component_name}}

## Contexto
Lee `.github/copilot-instructions.md` (§3 estructura, §7 capa de vista) y `.github/instructions/view.instructions.md`.

## Requisitos del componente
{{requirements}}

## Plantilla base

Seguir este patrón consistente con el resto del proyecto:

```tsx
import { memo } from 'react';
// imports necesarios...

interface {{component_name}}Props {
  // props tipadas, sin `any`
}

function {{component_name}}Raw({ ...props }: {{component_name}}Props) {
  // lógica del componente
  return (
    <div className="{{kebab-name}}">
      {/* contenido */}
    </div>
  );
}

export const {{component_name}} = memo({{component_name}}Raw);
```

## Reglas
- **Memo por defecto** para componentes que reciben props de listas
- **SCSS**: estilos en `src/styles/_{{feature}}.scss`, importar en `index.scss`
- **Sin lógica de datos**: usa hooks de `src/viewmodel/` o recibe datos por props
- **Responsive**: probar a 360px, 768px, 1024px
- **Accesibilidad**: ARIA labels, roles semánticos, navegación por teclado
- **Icons**: usar `<Icon name="..." />` del componente existente `Icon.tsx`

## Verificación
```bash
npx tsc --noEmit
npm run validate
```
