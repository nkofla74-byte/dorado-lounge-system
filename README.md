# Dorado Lounge System

SaaS multi-tenant para gestión de sala VIP aeroportuaria (Dorado Lounge, El Dorado, Bogotá). Cubre recepción de bodega, 4 KDS por área (cocina caliente, cocina fría, pastelería, AMEX), trazabilidad por ítem y administración.

## Quick Start

```bash
corepack enable && corepack prepare pnpm@latest --activate
pnpm install
cp apps/web/.env.example apps/web/.env.local   # completar con tus keys de Supabase
cp apps/socket-server/.env.example apps/socket-server/.env
pnpm dev                                        # web :3000 + socket :3001
```

## Commands

```bash
pnpm dev              # dev servers (web + socket) en paralelo
pnpm lint             # ESLint
pnpm typecheck        # TypeScript strict
pnpm test             # Vitest
```

## Stack

Next.js 15 (App Router) | Supabase (Postgres + Auth + Storage) | Socket.io | Tailwind + shadcn/ui | Zod | next-intl (es/en/fr/pt) | Vitest + Playwright

## Architecture

Monorepo con pnpm workspaces. Módulos hexagonales (`domain -> application -> infrastructure -> actions.ts`). Multi-tenant con RLS en Postgres. Inventario FEFO atómico vía RPC. Optimistic locking en pedidos. Estado por ítem en KDS con log append-only.

Detalles en `CLAUDE.md` y `ARCHITECTURE.md`.
