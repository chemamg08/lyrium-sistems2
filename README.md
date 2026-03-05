# Lyrium Systems

Sistema de gestión legal integral con frontend React y backend Node.js/Express.

## Estructura del Proyecto

```
lyrium-systems/
├── frontend/          # Aplicación React + Vite
├── backend/           # API REST con Express + TypeScript
├── package.json       # Scripts principales
└── README.md
```

## Requisitos

- Node.js v18+ y npm
- Puerto 8080 (frontend) y 3000 (backend) disponibles

## Instalación

```sh
# Instalar todas las dependencias
npm run install:all
```

## Desarrollo

### Iniciar ambos servicios simultáneamente:
```sh
npm run dev
```

### Iniciar servicios por separado:

```sh
# Solo frontend (puerto 8080)
npm run dev:frontend

# Solo backend (puerto 3000)
npm run dev:backend
```

## Tecnologías

### Frontend
- React 18
- TypeScript
- Vite
- Tailwind CSS
- shadcn/ui
- React Router
- TanStack Query

### Backend
- Node.js
- Express
- TypeScript
- CORS habilitado

## Build

```sh
# Build completo
npm run build

# Build individual
npm run build:frontend
npm run build:backend
```

## Endpoints API

- `GET /api/health` - Health check del servidor

