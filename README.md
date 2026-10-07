# S2616 - UrbanFix

Marketplace de oficios que conecta clientes con técnicos independientes (plomeros, electricistas, etc.) para gestionar solicitudes de servicio de forma estructurada, evitando la contratación informal por WhatsApp.

<details>
<summary>📖 Datos del proyecto</summary>

## Problema
La contratación de oficios independientes suele ser un caos informal: acuerdos por WhatsApp, poca trazabilidad y falta de organización.

## Solución (MVP)
Plataforma web tipo SPA que permite:
- Registro y login con 3 roles: **cliente**, **técnico** y **administrador**.
- Clientes: crear y gestionar solicitudes de servicio.
- Técnicos: aceptar o rechazar trabajos.
- Administrador: panel básico de gestión.
- Consumo de API REST.
- Despliegue en producción.

## Fuera de alcance
- Pagos integrados.
- Chat en tiempo real.

## Objetivo técnico
Demostrar una SPA completa con autenticación, manejo de múltiples roles, consumo de API REST y despliegue en producción, como evidencia de perfil junior full-stack.

## Equipo y roles

| ROL | INTEGRANTE/S | CONTACTO |
|-----|--------------|----------|
| DATA ANALYST | Matías | matias.h.a.hernandez@gmail.com |
| BACKEND | Gonzalo, Julián | gonzalocarrillo877@gmail.com, falconjulian2000@gmail.com |
| FRONTEND | Erika | hevieri.dev@gmail.com |
| UX/UI | Carina | caricariluna@gmail.com |
| TESTER QA | Lorena | lorenadelgado.ba@gmail.com |
| PM | Stefanía | stefania.sanudo@gmail.com |

## Documentación
Información detallada del proyecto en Confluence: [CUF - Wiki del proyecto](https://stefaniasanudo.atlassian.net/wiki/spaces/CUF/overview)

</details>

<details>
<summary>⚙️ Cómo configurar el proyecto</summary>

## Estructura

```
S2616-UrbanFix/
├── frontend/   # SPA React (Vite + pnpm)
├── backend/    # API REST
├── qa/         # Pruebas y QA
└── data/       # Datos del proyecto
```

## Requisitos
- [Node.js](https://nodejs.org/) (LTS)
- [pnpm](https://pnpm.io/) (`npm install -g pnpm`)

## Instalación

```bash
# Frontend
cd frontend
pnpm install
pnpm dev        # http://localhost:5173
```

## Backend

> ⚠️ Sección pendiente: el integrante de BACKEND deberá completar aquí la documentación del backend (tecnología, instalación, variables de entorno y cómo levantar la API).

</details>
