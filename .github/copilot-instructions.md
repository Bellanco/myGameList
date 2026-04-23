# Instrucciones para Copilot

## Visión del proyecto
Este repositorio implementa una **web que lista videojuegos** con frontend en **HTML y CSS** y backend en **Java**. La aplicación mantiene un archivo JSON con la lista de juegos y **sincroniza** ese JSON usando **GitHub Gists** (crear, actualizar, eliminar). El frontend permite **crear, editar y borrar** entradas desde la interfaz.

## Stack y requisitos
- **Backend**: Java (JDK 17+), build con Maven o Gradle.
- **Frontend**: HTML5 semántico; CSS modular (BEM o similar).
- **Persistencia remota**: GitHub Gist REST API para crear/actualizar/eliminar el JSON; autenticación con token con scope `gist`. 

## Convenciones de Java
- **Estructura**: paquetes por capa: `controller`, `service`, `model`, `repository`, `util`.
- **Estilo**: Java conventions; usar `final` para variables inmutables; evitar `null` cuando sea posible; usar `Optional` para retornos opcionales.
- **APIs**: Exponer endpoints REST claros: `GET /games`, `POST /games`, `PUT /games/{id}`, `DELETE /games/{id}`.
- **Errores**: manejar excepciones con respuestas JSON estandarizadas `{error, message, code}`.
- **Tests**: unitarios con JUnit; tests de integración para endpoints que interactúan con Gist (mockear la API en CI).

## Convenciones de HTML y CSS
- **HTML**: usar elementos semánticos (`main`, `section`, `article`, `form`); atributos `data-` para hooks JS.
- **CSS**: metodología BEM; variables CSS para colores y espaciados; accesibilidad: contraste y `aria-*` donde aplique.
- **JS mínimo**: mantener lógica de UI separada del modelo; validar formularios en cliente y servidor.

## Integración con Gist
- **Operaciones soportadas**: crear gist con el JSON inicial; actualizar gist (PATCH) para sincronizar cambios; eliminar fichero dentro del gist o el gist completo para borrar. Para actualizar archivos en un gist usar la estructura `files: { "games.json": { "content": "..." } }` y para borrar un archivo enviar su clave con `null`. 
- **Seguridad**: no hardcodear tokens; usar variables de entorno en CI; registrar solo eventos no sensibles.
- **Resiliencia**: reintentos exponenciales en fallos de red; validar respuesta de la API y manejar `truncated` si el contenido supera límites. 

## Reglas para sugerencias de Copilot
- Priorizar **claridad y seguridad** sobre brevedad.
- Generar código que **incluya validación de entrada** y manejo de errores.
- Para cambios que toquen la sincronización con Gist, **sugerir tests unitarios y de integración**.
- Evitar usar dependencias innecesarias; preferir soluciones estándar del ecosistema Java.

## Documentación y pruebas
- Añadir README con endpoints y flujo de sincronización.
- Incluir ejemplos de payloads JSON y comandos `curl` para crear/actualizar gist.
- CI debe ejecutar linters, tests unitarios y mocks de la API de Gist.

