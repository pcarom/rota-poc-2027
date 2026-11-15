# Guía de Implementación

## Estructura del Repositorio

```text
rota-poc/
├── backend/
│   ├── src/
│   │   ├── config/
│   │   ├── database/
│   │   ├── health/
│   │   ├── holidays/
│   │   ├── rota/
│   │   └── scheduling/
│   └── test/
├── frontend/
└── docs/
```

## Flujo de Trabajo del Backend

### Instalación y Ejecución

```bash
cd backend
npm install
cp .env.example .env   # misma configuración que el servicio backend de Docker
npm run migration:run
npm run start:dev
```

`backend/.env` lo leen la aplicación (`ConfigModule.forRoot`) y el CLI de migraciones (`src/database/data-source.ts`, con `process.loadEnvFile`). Las variables ya definidas en el entorno tienen prioridad.

### Ejecutar Pruebas

```bash
cd backend
npm test
npm run build
```

### Inicio en Producción

La imagen Docker compila TypeScript, ejecuta `npm run migration:run:dist` e inicia `node dist/src/main.js`.

## Convenciones del Backend

- Los controladores son pequeños y delegan en servicios
- Los DTOs definen los contratos de solicitud
- Las entidades representan únicamente filas persistidas
- La adaptación de la forma de respuesta pertenece a `RotaResponseMapper`
- Las reglas de planificación residen en `src/scheduling/`
- El comportamiento de obtención y caché de festivos reside en `src/holidays/`

## Base de Datos y Migraciones

- La configuración de TypeORM reside en `src/database/typeorm.config.ts`
- La fuente de datos de la CLI reside en `src/database/data-source.ts`
- MySQL 8.4 es la base de datos por defecto en tiempo de ejecución
- `sql.js` se usa únicamente para el aislamiento de pruebas
- `src/database/migration-helpers.ts` contiene los helpers idempotentes de las migraciones (`addColumnIfMissing`, `addUniqueIfMissing`, `dropIndexIfExists`, ...): MySQL no admite `IF NOT EXISTS` en el DDL de columnas ni de índices

Comandos de migración:

```bash
cd backend
npm run migration:show
npm run migration:run
npm run migration:revert
```

## Notas de Pruebas

- Las pruebas unitarias cubren la lógica de festivos y los invariantes de planificación
- Las pruebas E2E cubren el contrato HTTP público
- La aplicación de prueba usa la misma forma de bootstrap de Nest que en producción, con `sql.js` en lugar de MySQL
- Las llamadas a la API externa de festivos están simuladas (mocked) en las pruebas

## Expectativas del Frontend

El frontend espera:

- `/api/v1/teams` para el desplegable de equipos, y `PUT /api/v1/teams/:id/doctors` para guardar la lista de médicos (lista inicial, alta manual o fichero subido). Todas las llamadas de cuadrantes llevan `team_id` del equipo activo
- `/api/v1/config` para el banner de ciudad
- `/api/v1/rota/:year` para precargar los calendarios AC y AP juntos
- `/api/v1/rota/generate` para generar y persistir a la vez los cuadrantes AC y AP (`[AC, AP]`) con un único botón
- `/api/v1/rota/:year/:rotaType/replace` para devolver la rota actualizada tras la sustitución
- `DELETE /api/v1/rota/:year` para borrar los dos cuadrantes del año (botón «Borrar cuadrantes», con confirmación; tras el 204 `App` vacía el calendario y las estadísticas)
- `/api/v1/rota/:year/export` para descargar el libro de Excel del año (respuesta binaria; el cuerpo de los errores también llega como `Blob` y se decodifica en `App.onExportRota`)
- `/api/v1/rota/:year/:rotaType/add` para devolver la rota actualizada tras añadir un médico a una guardia

## Restricciones Operativas Actuales

- Sin autenticación
- Una única ciudad configurada por instancia de backend
- Sin soporte de deshacer
- Sin Swagger/OpenAPI UI todavía
- Docker Compose es el flujo de trabajo principal local para el stack completo

## 4.4 Trazabilidad de Criterios de Aceptación

| Criterio | Pruebas |
|----------|---------|
| CA-3.1.1, CA-3.1.9, CA-3.1.14–3.1.16 | `backend/test/unit/assignment.spec.ts` (`generateRotas`, `refuerzosForDay`, guardia AP y refuerzos), `backend/test/e2e/app.e2e-spec.ts` (generación conjunta, papeles, médico en los dos grupos, validación) |
| CA-3.1.17 | `backend/test/unit/holidays.spec.ts` (festivos especiales, caché antigua, borrado), `backend/test/e2e/app.e2e-spec.ts`, `backend/test/e2e/holidays-upsert.e2e-spec.ts` |
| CA-3.1.18, CA-3.1.19 | `backend/test/e2e/app.e2e-spec.ts` («método de asignación (strategy)»: predeterminado, `null`, `wheels`, `single-wheel`, 400 con `balanced`), `backend/test/unit/single-wheel-strategy.spec.ts` (rueda única de guardias, ruedas de refuerzo, saltos con deuda, integración en `generateRotas`), `backend/test/unit/wheels-strategy.spec.ts`, `backend/test/unit/continuation.spec.ts` (`buildWheelContinuation`), `assignment.spec.ts` («generateRotas — orden del grupo», «Continuidad con el año anterior») y los `describe` de continuación del año anterior en `single-wheel-strategy.spec.ts`, `wheels-strategy.spec.ts` y `app.e2e-spec.ts` |
| CA-3.6.11 | `frontend/src/app/features/doctor-pool/doctor-pool.component.spec.ts` (opciones, valor por defecto, «Generado con»), `frontend/src/app/app.spec.ts` («método de asignación»), `frontend/src/app/core/services/rota.service.spec.ts` |
| CA-3.6.2–3.6.4, CA-3.6.9, CA-3.6.10 | `frontend/src/app/app.spec.ts` (botón único, confirmación, notificaciones), `frontend/src/app/features/calendar/day-cell.component.spec.ts` (bloques AC/AP/REFUERZO, `(AC)`, festivo especial) |
| CA-3.11.1–3.11.6 | `backend/test/e2e/teams.e2e-spec.ts`, `frontend/src/app/core/parsers/doctor-file.parser.spec.ts`, `frontend/src/app/core/services/teams.service.spec.ts`, `frontend/src/app/core/services/doctor-pool.service.spec.ts`, `frontend/src/app/features/doctor-pool/doctor-pool.component.spec.ts` (cargar lista), `frontend/src/app/app.spec.ts` (`describe('equipos')`) |
| CA-3.9.1 | `backend/test/e2e/rota-export.e2e-spec.ts` (contrato HTTP, hojas, filas, refuerzos y «(AC)», sustitución), `frontend/src/app/core/services/rota.service.spec.ts` (`exportRotas`), `frontend/src/app/app.spec.ts` (botón, descarga, errores en español) |
