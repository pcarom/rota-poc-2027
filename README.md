# Aplicación de Asignación de Guardias Médicas

Aplicación full-stack para la planificación automática de guardias médicas en hospitales españoles. El sistema genera asignaciones anuales garantizando equidad, cumplimiento de los límites de horas y la regla del día de descanso.

**Estado:** Prueba de Concepto (PoC).

## Arranque rápido

### Docker (recomendado)

```bash
docker compose up --build
```

- Frontend: http://localhost:4200
- API del backend: http://localhost:8000

### Desarrollo local

**Requisitos previos:** Node 22+, MySQL 8.4+.

**Backend (NestJS):**
```bash
cd backend
npm install
cp .env.example .env   # misma configuración que el servicio backend de Docker
# Levanta MySQL (o usa: docker compose up -d db)
npm run migration:run
npm run start:dev
```

`backend/.env.example` reproduce la configuración de `docker-compose.yml` cambiando el host de la base de datos a `localhost`. La aplicación y las migraciones leen `backend/.env`; las variables de la shell tienen prioridad.

**Frontend:**
```bash
cd frontend
npm install
npx ng serve --port 4200 --proxy-config src/proxy.conf.json
```

La configuración del proxy redirige las peticiones `/api/*` al backend en `localhost:8000`.

## Configuración

La ciudad del hospital se configura mediante la variable de entorno `CITY` del backend (por defecto `Alicante`, que toma los festivos nacionales y los de la Comunitat Valenciana). Determina la resolución de festivos y se muestra en la interfaz.

| Variable | Valor por defecto | Descripción |
|----------|-------------------|-------------|
| `DATABASE_URL` | `mysql://rota_user:rota_pass@localhost:3306/rota` | Cadena de conexión a MySQL |
| `HOLIDAY_API_URL` | `https://date.nager.at/api/v3` | API de festivos españoles |
| `CITY` | `Alicante` | Ciudad del hospital para la resolución de festivos (Alicante → Comunitat Valenciana, `ES-VC`) |

## Ejecutar los tests

**Backend (NestJS):**
```bash
cd backend
npm test
```

**Frontend:**
```bash
cd frontend
npx ng test --watch=false
```

## Estructura del proyecto

```
rota-poc/
├── backend/           # Backend NestJS y motor de planificación
├── frontend/          # UI Angular 19+ del calendario
├── docs/              # Documentación de producto y técnica
│   ├── PRD.md         # Requisitos de producto y criterios de aceptación
│   ├── TECHNICAL_DESIGN.md  # Arquitectura y diseño de API
│   └── IMPLEMENTATION.md    # Detalles de implementación y guía para desarrolladores
├── docker-compose.yml
└── REQUIREMENTS.md    # Definición funcional del producto
```

## Documentación

| Documento | Descripción |
|-----------|-------------|
| [REQUIREMENTS.md](REQUIREMENTS.md) | Definición funcional del producto |
| [docs/PRD.md](docs/PRD.md) | Requisitos de producto con criterios de aceptación |
| [docs/TECHNICAL_DESIGN.md](docs/TECHNICAL_DESIGN.md) | Arquitectura, contratos de API, esquema de BD y diseño del algoritmo |
| [docs/IMPLEMENTATION.md](docs/IMPLEMENTATION.md) | Detalles de implementación, guía para desarrolladores y estrategia de pruebas |
| [docs/BACKEND_ARCHITECTURE_REFERENCE.md](docs/BACKEND_ARCHITECTURE_REFERENCE.md) | Referencia de módulos NestJS y flujos de petición |
| [docs/ALGORITHM.md](docs/ALGORITHM.md) | Diseño del algoritmo de asignación, restricciones y compromisos |
| [docs/visualizations/ruedas.html](docs/visualizations/ruedas.html) | Visualización interactiva del método de asignación «Rueda única» |
| [docs/samples/README.md](docs/samples/README.md) | Formato de los ficheros JSON y CSV para cargar la lista de médicos de un equipo |

## Stack tecnológico

| Capa | Tecnología |
|------|-----------|
| Backend | NestJS 11, TypeScript, TypeORM |
| Frontend | Angular 19+, TypeScript, Angular CDK (drag-and-drop) |
| Base de datos | MySQL 8.4 |
| Tests | Jest (backend), vitest (frontend) |
| Infraestructura | Docker Compose, Nginx |
