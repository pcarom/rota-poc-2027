# Diseño Técnico

## Visión General

El sistema es un monorepo pequeño con:

- `backend/`: API NestJS, motor de planificación, resolución de festivos y persistencia en MySQL 8.4
- `frontend/`: Interfaz Angular para grupos de médicos, generación de rota, visualización de calendario y flujos de sustitución
- `docker-compose.yml`: MySQL local más contenedores de backend y frontend

## Arquitectura en Tiempo de Ejecución

```text
Frontend Angular  <->  API NestJS (/api/v1)  <->  MySQL
                                |
                                +-> API de Festivos (date.nager.at)
```

## Diseño del Backend

### Elecciones de Framework

- NestJS 11 sobre Fastify para una capa HTTP ligera
- TypeORM para entidades y migraciones
- `class-validator` y `class-transformer` para validación de solicitudes
- Servicios TypeScript puros para la lógica de planificación y estadísticas

### Límites de Módulos

- `config`: sirve configuración en tiempo de ejecución al frontend
- `holidays`: resuelve y cachea datos de festivos por ciudad
- `rota`: generar, leer, listar y reemplazar asignaciones de rota
- `teams`: equipos (nombre y lista de médicos); cada cuadrante pertenece a un equipo
- `scheduling`: reglas de planificación puras y estadísticas
- `database`: opciones de TypeORM y migraciones
- `health`: endpoint de liveness

### Contrato de API

- `GET /health` devuelve `{ status: "ok" }`
- `GET /api/v1/config` devuelve la ciudad configurada
- `GET /api/v1/holidays/:year` devuelve los festivos cacheados u obtenidos para la ciudad configurada
- `GET /api/v1/teams` lista los equipos por orden de creación: `[{ id, name, doctors }]`, donde cada médico es `{ id, name, department, rota_type }`. Siempre hay al menos uno: si la tabla está vacía, el backend crea el «Equipo principal» al arrancar
- `POST /api/v1/teams` crea un equipo `{ name }` sin médicos (201); `PATCH /api/v1/teams/:teamId` lo renombra. El nombre se recorta, no puede estar vacío ni superar 100 caracteres y es único (400 «Ya existe un equipo llamado «…».»)
- `PUT /api/v1/teams/:teamId/doctors` sustituye la lista de médicos `{ doctors: [...] }` (no vacía, `rota_type` AC o AP, ids sin repetir). No toca los cuadrantes ya generados: guardan su propio grupo (`rotas.pool`)
- `DELETE /api/v1/teams/:teamId` borra el equipo con todos sus cuadrantes (204); el último equipo no se puede borrar (400). Un equipo inexistente responde 404 «No se ha encontrado el equipo N.»
- **Equipo de los cuadrantes**: todas las rutas `/rota` admiten `?team_id=` (y `team_id` en el cuerpo de `generate`). Si se omite se usa el equipo principal (el de menor id), así que los clientes anteriores a los equipos siguen funcionando. Un `team_id` no numérico responde 400 «el equipo debe ser un número entero». `RotaResponse` incluye `team_id`
- `POST /api/v1/rota/generate` genera y persiste **los dos cuadrantes del año** del equipo en una transacción. Cuerpo `{ year, ac_pool, ap_pool, strategy?, team_id? }`; responde `[RotaResponse AC, RotaResponse AP]`, cada uno con sus `warnings`. Un médico presente en los dos grupos responde 400. `strategy` es opcional (`single-wheel` por defecto, o `wheels`) y un valor distinto, incluido el retirado `balanced`, responde 400 con «el método de asignación debe ser single-wheel o wheels». Los cuadrantes guardados con `balanced` se siguen leyendo y devuelven `strategy: 'balanced'`. La respuesta (`RotaResponse`) incluye `strategy`, igual que `GET /rota/:year/:rotaType` y `GET /rota/:year`; sustituir o añadir un médico no la cambia. Cada médico de `schedule[].doctors` lleva `role` (`guardia` o `refuerzo`) y las estadísticas, `shifts_refuerzo` cuenta sus turnos de refuerzo; `guardia_hours` y `refuerzo_hours` desglosan `total_hours` en horas de guardia y de refuerzo (`guardia_hours + refuerzo_hours === total_hours` siempre)
- `GET /api/v1/rota/:year/:rotaType` devuelve una rota almacenada, opcionalmente filtrada por `doctor_id`
- `GET /api/v1/rota/:year` devuelve todas las rotas de un año
- `GET /api/v1/rota/:year/export` descarga un libro de Excel del equipo (`cuadrante-guardias-<año>.xlsx`; la interfaz lo guarda como `cuadrante-guardias-<equipo>-<año>.xlsx`, `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`) con las hojas `Cuadrante` (una fila por día, AC y AP combinados) y `Estadísticas AC` / `Estadísticas AP` (sólo si existe ese cuadrante). Devuelve 404 en español si el año no tiene cuadrantes. Exporta sólo datos persistidos: no consulta la API externa de festivos. Se declara antes de `:year/:rotaType` para que `export` no se interprete como tipo de rota
- `DELETE /api/v1/rota/:year` borra en una transacción los cuadrantes AC y AP del año con sus médicos y asignaciones (también las sustituciones y adiciones manuales) y responde 204 sin cuerpo. Los festivos, también los manuales, se conservan. Devuelve 404 en español si el año no tiene cuadrantes. En la interfaz lo lanza el botón «Borrar cuadrantes» de la cabecera, tras un diálogo de confirmación
- `PATCH /api/v1/rota/:year/:rotaType/replace` intercambia una sola asignación; cuerpo `{ date, old_doctor_id, new_doctor_id, old_rota_type? }`. Con `old_rota_type` del otro grupo sólo se admite un refuerzo (si no, 400): la fila sale del cuadrante de origen y entra como refuerzo, con su propio horario de refuerzo, en el de `:rotaType`, que es el que se devuelve
- `POST /api/v1/rota/:year/:rotaType/add` añade un médico como refuerzo de un día (en AC y en AP) sin quitar a los ya asignados; cuerpo `{ date, doctor_id }`, responde 200 con la rota completa. La fila nueva copia el tipo de día y usa el horario de refuerzo del día (`refuerzoShiftDetails`, `scheduling/shifts.ts`; hasta 2026: 7h L-S, 12h festivo; desde 2027: 7h L-V, 12h sábado/domingo/festivo); es una corrección manual sin validar día de descanso ni `doctors_per_day`

## Diseño de Persistencia

El backend almacena cinco tablas:

- `teams` (`name` único, `doctors` JSON)
- `rotas` (único por `team_id, year, rota_type`)
- `rota_doctors`
- `rota_assignments`
- `holidays`

Las migraciones residen en `backend/src/database/migrations/` y se ejecutan mediante la CLI de TypeORM.

Particularidades de MySQL 8.4:

- **Colación `utf8mb4_0900_as_cs`**: la de por defecto (`utf8mb4_0900_ai_ci`) no distingue mayúsculas ni acentos, y `a1`/`A1` chocarían en las claves únicas de `doctor_id` y `city`. Se fija en el servidor (`docker-compose.yml`) y en cada `CREATE TABLE`.
- **`generated_at`** es `DATETIME(3)` y se guarda en UTC (`timezone: 'Z'` en el driver); las columnas `DATE` llegan como cadenas `AAAA-MM-DD` (`dateStrings: ['DATE']`). **`pool`** es `JSON`. **`rotas.strategy`** es `VARCHAR(20) NOT NULL` e indica el método de asignación usado. La migración 006 la creó con `DEFAULT 'balanced'` (las rotas anteriores quedaron como `balanced`) y la 009 cambia el valor por defecto a `single-wheel` al retirar ese método, sin tocar las filas existentes.
- **Migración 008 (equipos)**: crea `teams` con el «Equipo principal» (sin médicos: el cliente le carga `assets/doctors.json` la primera vez), añade `rotas.team_id` asignando las rotas existentes a ese equipo y cambia la clave única `uq_rotas_year_rota_type` por `uq_rotas_team_year_rota_type`. El `down` conserva sólo los cuadrantes del equipo principal.
- **DDL no transaccional**: cada sentencia DDL hace commit implícito, así que una migración fallida puede dejar el esquema a medias. Por eso las migraciones son idempotentes y comprueban el estado con `src/database/migration-helpers.ts`.
- **Orden real de ejecución**: la migración 004 tiene el timestamp en segundos y TypeORM la ordena la primera; en una base vacía el orden es 004, 001, 002, 003, 005. Ni el timestamp ni los nombres se tocan.
- Las FK se declaran a nivel de tabla (MySQL ignora `REFERENCES` en línea) y, como InnoDB exige un índice que empiece por `rota_id` para la FK de `rota_assignments`, los índices nuevos se crean antes de borrar los viejos.

## Diseño del Algoritmo de Planificación

El algoritmo de rota se mantiene deliberadamente fuera de los decoradores NestJS y las preocupaciones de transporte.

- La clasificación de días se deriva de los domingos más la caché de festivos. El `DayInfo` resultante representa la duración de la **guardia del día**, común a AC y AP en todos los años.
- `doctorsPerDay` vale siempre 1. La cobertura diaria la fija `refuerzosForDay(day, previousDay)`: 1 refuerzo, o 2 en un festivo especial de sanidad, en un festivo cuyo día anterior también es festivo o, desde 2027, en cualquier sábado. AC tiene 1 guardia/día; AP, 1 guardia + los refuerzos que no haya reservado un AC.
- AC y AP se generan juntos (`generateRotas`): AC, después los refuerzos AC por déficit mensual (`planAcRefuerzos`) y por último AP. `scheduling/shifts.ts` separa la duración de la **guardia** (`guardiaShiftDetails`, común a AC y AP en todos los años) de la del **refuerzo** (`refuerzoShiftDetails`, el de AP y el que cubre un AC, que nunca comparte horario con la guardia del día), ambas según la fecha y el tipo de día (`usesShifts2027` marca el corte en `SHIFTS_2027_FROM_YEAR`). Hasta 2026, la guardia dura 17h laborable, 18h sábado y 23h festivo, y el refuerzo 7h en laborable/sábado y 12h en festivo; desde 2027, la guardia tiene sus propias horas por tipo de día (ver [ALGORITHM.md](./ALGORITHM.md)) y el refuerzo dura 7h de lunes a viernes y 12h en sábado, domingo o festivo. Las horas se persisten en `RotaAssignmentEntity.durationHours`; el papel va en `RotaAssignmentEntity.role`. El refuerzo AC se guarda en el cuadrante AC con su propio horario de refuerzo.
- `holidays.is_special` marca los festivos especiales de sanidad (24, 25 y 31 dic, 1 y 6 ene). `HolidaysService` los añade siempre al obtener los festivos de un año (también en cachés anteriores a la regla) y no deja eliminarlos. La migración 007 añade `rota_assignments.role` (las filas AP existentes pasan a `refuerzo`) y `holidays.is_special`.
- En el segundo festivo consecutivo AP se persisten **dos filas** para la misma fecha, con distinto `doctor_id`.
- Las estadísticas se recalculan a partir de las asignaciones persistidas para garantizar la consistencia de la respuesta.

Consulta [ALGORITHM.md](./ALGORITHM.md) para el conjunto de reglas detallado.

### Método de asignación (patrón Strategy)

`generateRotas(año, grupoAC, grupoAP, días, díaAnterior?, strategyId = 'single-wheel', random?, previousYear?)` (`previousYear` es un `PreviousYear`, definido en `scheduling/continuation.ts`: los días de Y-1 y, por tipo, el grupo persistido y los turnos del cuadrante anterior; `RotaService.loadPreviousYearRotas` lo carga de la base de datos y, si lo hay, el año continúa el anterior en vez de barajar, vía `StrategyInput.continuation`) conserva todo lo común (duraciones efectivas, `refuerzosForDay`, refuerzos AC, viabilidad, estadísticas y avisos) y delega sólo la selección en una `AssignmentStrategy` (`backend/src/scheduling/strategies/`): `assign({ pool, days, requiredByDay, refuerzosByDay? }) => DoctorInput[][]`, donde cada día devuelve primero las guardias y después los refuerzos. Estrategias registradas: `wheels` (ruedas por tipo de día, con un juego por papel) y `single-wheel` (una única rueda de guardias para todos los días y ruedas por tipo de día sólo para los refuerzos). `balanced` está retirada. `DayInfo.publicHoliday` distingue un festivo oficial de un domingo, que comparten `dayType: 'holiday'`; `DayInfo.specialHoliday` marca los festivos especiales.

## Integración con el Frontend

El frontend Angular llama al backend a través de `/api/v1/*` y espera:

- campos de respuesta estables en snake_case
- cargas de rota AC y AP separadas
- un único flujo de sustitución de asignaciones
- la ciudad configurada a través de `/api/v1/config`
- los equipos a través de `/api/v1/teams`; el equipo activo (`TeamsService.selectedTeamId`, recordado en `localStorage`) se manda como `team_id` en todas las llamadas de cuadrantes

### Equipos y lista de médicos

- `TeamSelectorComponent` (`features/teams/`) se proyecta en la cabecera de `DoctorPoolComponent` (`<ng-content select="[poolHeader]">`): desplegable del equipo y diálogos de crear, renombrar y borrar. Emite `teamSelected` y `App.onTeamSelected` carga la lista y los cuadrantes del equipo.
- `DoctorPoolService.loadTeam` muestra la lista del equipo; si está vacía, carga `assets/doctors.json` y la guarda con `PUT /teams/:id/doctors`. Añadir un médico y cargar un fichero también guardan la lista.
- «Cargar lista» lee el fichero en el navegador con `parseDoctorFile` (`core/parsers/doctor-file.parser.ts`): JSON o CSV, columnas en español o inglés sin distinguir tildes ni mayúsculas, ids generados (`doc-NNN`) si faltan. El formato completo, con los nombres de columna admitidos y los mensajes de error, está en [`samples/README.md`](./samples/README.md). Los errores llegan como notificación y no se envía nada; si es válido, `App` pide confirmación antes del `PUT`.

### Renderizado del calendario

- **Sección AC** muestra el médico AC del día.
- La celda tiene tres bloques: **AC** (guardia AC), **AP** (guardia AP) y **REFUERZO**, con cada refuerzo prefijado `R:` (pseudo-elemento `::before`); el bloque es naranja y cada refuerzo lleva el color de su grupo (verde AP, azul AC, que además lleva el sufijo `(AC)`). Un festivo especial lleva la clase `day-holiday-special` (estrella y borde morado), y su menú contextual no permite desmarcarlo.

## Desarrollo Local

### Backend

```bash
cd backend
npm install
npm run migration:run
npm run start:dev
```

### Frontend

```bash
cd frontend
npm install
npx ng serve --port 4200 --proxy-config src/proxy.conf.json
```

### Docker

```bash
docker compose up --build
```

## Estrategia de Pruebas

- `backend`: pruebas unitarias y e2e con Jest
- `frontend`: pruebas de componentes y servicios con Angular CLI
- La suite e2e del backend usa `sql.js` y respuestas simuladas de la API de festivos para validar el contrato HTTP público
