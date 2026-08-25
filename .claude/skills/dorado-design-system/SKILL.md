---
name: dorado-design-system
description: 'Router y adaptador del stack de diseño Apple HIG para Dorado Lounge. Úsalo SIEMPRE al crear o rediseñar cualquier UI de este repositorio (KDS, almacén, pedidos, admin, QR de pasajeros): fija el orden de precedencia entre las skills apple-design-*, resuelve sus conflictos y traduce sus reglas nativas (SwiftUI, SF Symbols, UIKit) al stack real del proyecto — Next.js 15, React, Tailwind, shadcn/ui, lucide-react, next-intl. Keywords: rediseño, diseño, UI, interfaz, HIG, Apple, liquid glass, KDS, pantalla, componente, estilos, tailwind, shadcn, accesibilidad, Dorado Prefer.'
---

# Sistema de diseño — Dorado Lounge

Adaptador entre las skills `apple-design-*` / `apple-hig-designer` (que hablan de
iOS y SwiftUI) y este repositorio, que es **una aplicación web**. Sin esta
traducción, esas skills producen código que aquí no compila ni se puede
licenciar.

## 1. Orden de precedencia

Cuando dos skills se contradigan, gana la de arriba:

| #   | Fuente                                          | Manda sobre                                                 |
| --- | ----------------------------------------------- | ----------------------------------------------------------- |
| 1   | `apple-hig-designer` + `apple-design` (hub)     | Principios HIG: claridad, deferencia, profundidad           |
| 2   | `apple-design-materials`                        | Liquid Glass, vibrancy, materiales, iconografía             |
| 3   | `apple-design-web` + `apple-design-foundations` | Color, tipografía, retícula, layout web                     |
| 4   | `apple-design-os`                               | Reglas por plataforma — **solo como referencia conceptual** |
| —   | **Este documento**                              | **Gana sobre todas.** Es el contrato con el stack real      |

`apple-design-os` describe `UINavigationBar`, `presentationDetents`, etc. Aquí
son analogías, nunca código a copiar.

## 2. Traducción obligatoria

| La skill dice                              | Aquí se implementa como                                                                                                                                                                                                                                                           |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SF Symbols                                 | **`lucide-react`** (ya instalado). SF Symbols es una fuente con licencia Apple: **no se puede embeber en una web**. Prohibido descargarla                                                                                                                                         |
| San Francisco / SF Pro                     | Stack del sistema: `-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif`. En iPad se resuelve a SF de forma nativa y legal                                                                                                                                       |
| SwiftUI / UIKit                            | React + Tailwind + `components/ui/*` (shadcn). Extender el componente existente antes que crear uno nuevo                                                                                                                                                                         |
| `Color.label`, `systemBackground`          | Variables HSL ya definidas en `globals.css`: `--foreground`, `--background`, `--primary`… **Nunca un hex suelto**                                                                                                                                                                 |
| Colores de severidad (aviso, error, éxito) | `senal-aviso`, `senal-curso`, `senal-ok`, `senal-critico`. Son para **texto, bordes y tintes**: van oscurecidos en tema claro para cumplir AA. Sobre un relleno sólido de señal el texto va en `text-background`, que se invierte con el tema — `text-white` desaparece en oscuro |
| Dynamic Type                               | `rem` + `clamp()`. Nada de `px` en tipografía. Debe sobrevivir al zoom del navegador al 200 %                                                                                                                                                                                     |
| `.ultraThinMaterial`, glassEffect          | `backdrop-blur-* bg-background/70` + borde `border-white/10`. Ver §3                                                                                                                                                                                                              |
| Touch target 44 pt                         | `min-h-11 min-w-11` (44 px). En KDS, §4 sube el mínimo                                                                                                                                                                                                                            |
| VoiceOver                                  | ARIA + HTML semántico: `aria-label`, `role`, `aria-live` para colas que cambian solas                                                                                                                                                                                             |
| Reduce Motion                              | `motion-safe:` / `motion-reduce:` de Tailwind, o `@media (prefers-reduced-motion: reduce)`                                                                                                                                                                                        |
| Espaciado 8 pt                             | Escala de Tailwind (`gap-2` = 8 px, `gap-4` = 16 px). No inventar valores sueltos                                                                                                                                                                                                 |
| Strings de UI                              | **Siempre `next-intl`**. Ninguna cadena visible se escribe en el JSX (regla 7 de CLAUDE.md)                                                                                                                                                                                       |

## 3. Liquid Glass en este proyecto

Se usa **solo** en superficies flotantes sobre contenido: cabeceras pegajosas,
diálogos, hojas laterales, barras de filtro.

```tsx
// Correcto: material sobre contenido desplazable
<header className="sticky top-0 z-10 border-b border-border/50
                   bg-background/80 backdrop-blur-xl
                   supports-[backdrop-filter]:bg-background/60">
```

Reglas duras:

- **Nunca** cristal detrás de texto largo ni de datos operativos (cantidades,
  lotes, temporizadores). El contraste manda sobre el efecto.
- Siempre un fallback opaco vía `supports-[backdrop-filter]:`.
- Respetar `prefers-reduced-transparency`: sustituir por color sólido.
- El `backdrop-filter` es caro. En listas de KDS que se repintan por Socket.io,
  aplicarlo al contenedor, jamás a cada tarjeta.

## 4. Realidad operativa — no negociable

Este software se usa en la cocina de una sala VIP, 24/7:

- **Guantes, prisa y vapor.** El 44 pt de Apple asume un dedo desnudo y sin
  urgencia. Aquí la regla tiene tres escalones:

  | Superficie                              | Acción principal       | Icono o control secundario |
  | --------------------------------------- | ---------------------- | -------------------------- |
  | KDS y almacén (con guantes)             | **56 px** (`min-h-14`) | 44 px (`size-11`)          |
  | Pedidos, admin, analítica (sin guantes) | 44 px (`min-h-11`)     | 44 px                      |

  Por debajo de 44 px no baja nada, en ninguna pantalla.

- **Reflejos y brillo alto.** El contraste mínimo es **WCAG AA 4.5:1**, y en
  estados críticos (demora AMEX/Prefer, stock bajo, vencimiento) se apunta a AAA.
- **El color nunca es el único canal.** Un estado se comunica además con icono y
  texto: hay cocineros daltónicos y pantallas mal calibradas.
- **Lectura a distancia.** El texto de una tarjeta de KDS se lee a un brazo de
  distancia: mínimo 16 px, y los temporizadores mucho mayores.
- **Modo oscuro real.** Turnos nocturnos: ambos temas se diseñan a la vez, nunca
  el oscuro como parche.

## 5. Antes de dar por buena una pantalla

- [ ] Sin strings hardcodeados — todo en `messages/es.json` y `en.json`
- [ ] Objetivos táctiles ≥ 44 px (≥ 56 px en KDS/almacén)
- [ ] Navegable con teclado y con foco visible (`focus-visible:`)
- [ ] Legible con zoom al 200 % sin scroll horizontal
- [ ] Animaciones anuladas bajo `prefers-reduced-motion`
- [ ] Contraste AA verificado en tema claro **y** oscuro
- [ ] Colores desde las variables de `globals.css`, ningún hex suelto
- [ ] Iconos de `lucide-react`, con `aria-hidden` si son decorativos
