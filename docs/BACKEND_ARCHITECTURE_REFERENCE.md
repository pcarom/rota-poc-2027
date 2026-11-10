# Referencia de Arquitectura del Backend

Este documento resume el backend NestJS actual ahora que la implementación en Python ha sido retirada.

## Forma del Sistema

- `backend/src/main.ts` arranca una aplicación Nest basada en Fastify, aplica `/api/v1` como prefijo global, habilita CORS y registra la validación.
- `backend/src/app.module.ts` compone los módulos de config, database, holidays, rota y health.
- TypeORM es la capa de persistencia para MySQL 8.4 en producción y `sql.js` en pruebas.
- La planificación y la clasificación de festivos permanecen en servicios de dominio puros para mantener la capa HTTP delgada.

## Flujo de Solicitudes

1. Un controlador recibe la solicitud HTTP y valida los DTOs de entrada con el `ValidationPipe` global.
2. El servicio relevante carga festivos/config y ejecuta la lógica de planificación cuando es necesario.
3. TypeORM persiste `rotas`, `rota_doctors`, `rota_assignments` y `holidays` en caché.
4. `RotaResponseMapper` reconstruye la forma de respuesta de la API, incluyendo estadísticas y vistas de rota filtradas.
5. `RotaExportService` (`src/rota/rota-export.service.ts`) recibe las `RotaResponse` que devuelve `RotaService.getByYear` y genera con `exceljs` el libro de Excel (`buildWorkbook`); no accede a la base de datos ni recalcula estadísticas. El controlador devuelve el resultado como `StreamableFile`.

## Módulos

- `src/config/` expone la configuración de la aplicación como `CITY`.
- `src/database/` gestiona la configuración de TypeORM y las migraciones.
- `src/holidays/` obtiene los festivos españoles, los filtra por ciudad/región y los almacena en caché.
- `src/scheduling/` contiene el algoritmo de rota y el cálculo de estadísticas. `src/scheduling/strategies/` agrupa los métodos de asignación intercambiables (patrón Strategy): `wheels`, `single-wheel` y el registro `ASSIGNMENT_STRATEGIES` (`balanced` está retirada).
- `src/rota/` gestiona la generación, recuperación, sustitución, exportación a Excel, entidades y mapeo de respuestas.
- `src/teams/` gestiona los equipos (entidad `TeamEntity`, CRUD y lista de médicos). `TeamsService.resolveTeamId` traduce el `team_id` opcional de las rutas `/rota` (por defecto, el equipo principal) y `team-id.pipe.ts` valida el parámetro con mensajes en español.
- `src/health/` proporciona el endpoint de liveness `/health`.

## Superficie de API

- `GET /health`
- `GET /api/v1/config`
- `GET /api/v1/holidays/:year` — lista todos los festivos del año (API + manuales + los especiales de sanidad, con `special: true`)
- `POST /api/v1/holidays/:year` — marca una fecha como festivo manual
- `DELETE /api/v1/holidays/:year/:date` — desmarca un festivo manual (solo si `source = 'manual'` y no es especial)
- `GET /api/v1/teams` · `POST /api/v1/teams` · `PATCH /api/v1/teams/:teamId` · `PUT /api/v1/teams/:teamId/doctors` · `DELETE /api/v1/teams/:teamId`
- `POST /api/v1/rota/generate` — genera AC y AP a la vez (`{ year, ac_pool, ap_pool, strategy?, team_id? }` → `[AC, AP]`). Todas las rutas `/rota` admiten `?team_id=` (por defecto, el equipo principal)
- `GET /api/v1/rota/:year/:rotaType`
- `GET /api/v1/rota/:year`
- `GET /api/v1/rota/:year/export`
- `DELETE /api/v1/rota/:year`
- `PATCH /api/v1/rota/:year/:rotaType/replace`
- `POST /api/v1/rota/:year/:rotaType/add`

## Modelo de Datos

- `teams`: equipos con nombre único y su lista de médicos (`doctors` JSON con `rota_type`).
- `rotas`: una rota persistida por `(equipo, año, tipo_rota)` más la instantánea del grupo original (`pool`), guardada en el orden con que se generó el cuadrante (barajado o continuado): el año siguiente lo lee para continuarlo.
- `rota_doctors`: miembros del grupo normalizados para una rota.
- `rota_assignments`: una fila por asignación. En AP, un festivo precedido de otro festivo (o, desde 2027, cualquier sábado) tiene dos filas por fecha (segundo refuerzo), cada una con distinto `doctor_id`. La columna `duration_hours` de la guardia es la misma en AC y AP para la misma fecha (duración del día calendario, en todos los años); sólo el refuerzo usa su propio horario (7h o 12h, `scheduling/shifts.ts`), que nunca coincide con el de la guardia del día.
- `holidays`: filas de festivos en caché indexadas por `(año, ciudad, fecha)`. Contiene una columna `source ('api' | 'manual')` para distinguir los festivos obtenidos de la API externa de los creados por el usuario.

Restricciones importantes:

- `rotas(team_id, año, tipo_rota)` es único.
- `teams(name)` es único. Al borrar un equipo se borran sus rotas, médicos y asignaciones.
- `rota_doctors(rota_id, doctor_id)` es único.
- `rota_assignments(rota_id, fecha, doctor_id)` es único.
- Las filas hijas se eliminan en cascada al borrar una rota.

## Forma de las Pruebas

- `backend/test/unit/assignment.spec.ts` cubre las reglas de generación de rota e invariantes.
- `backend/test/unit/holidays.spec.ts` cubre el comportamiento de filtrado y caché de festivos.
- `backend/test/e2e/app.e2e-spec.ts` cubre el contrato HTTP contra una base de datos `sql.js` en memoria.
- `backend/test/e2e/teams.e2e-spec.ts` cubre los equipos: CRUD, validación en español y aislamiento de los cuadrantes por equipo.

## Notas Operativas

- Producción y Docker usan migraciones MySQL mediante `npm run migration:run` o `npm run migration:run:dist`.
- La respuesta de la API preserva el formato de turno nocturno con `+1` sólo cuando el turno realmente cruza medianoche (`formatShiftEnd`). Los refuerzos (15:00–22:00 y 10:00–22:00) se devuelven sin sufijo `+1`; la guardia (AC y AP) comparte siempre el mismo horario (`scheduling/shifts.ts`) y, según el tipo de día, sí puede llevar `+1`.
- El backend no expone Swagger actualmente; el contrato estable está documentado en código y pruebas.
