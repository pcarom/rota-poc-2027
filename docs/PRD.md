# Documento de Requisitos de Producto: Aplicación de Asignación de Guardias Médicas

**Versión:** 1.0
**Fecha:** 2026-03-12
**Estado:** Borrador - Alcance PoC
**Fuente:** REQUIREMENTS.md

---

## 1. Descripción del Producto

La aplicación de asignación de guardias médicas automatiza la planificación de servicios de guardia para médicos. El sistema calcula las asignaciones anuales de guardia garantizando equidad y cumplimiento de los límites de horas, y proporciona una interfaz visual para visualizar y gestionar el calendario.

Se trata de una **Prueba de Concepto (PoC)** — la autenticación, autorización y los aspectos de seguridad en producción quedan explícitamente fuera del alcance.

---

## 2. Glosario

| Término | Definición |
|---------|-----------|
| **Atención Continuada (AC)** | Guardia principal del día. Grupo de médicos separado. Mínimo 1.620 horas/año (135h/mes de media) por médico. |
| **Atención Primaria (AP)** | Grupo de médicos separado que cubre cada día la **guardia AP** y los **refuerzos**. Máximo 425 horas/año por médico. |
| **Rota** | El calendario de guardias del año de un tipo de servicio (AC o AP). Los dos se generan juntos con una sola acción. |
| **Pool** | El conjunto de médicos disponibles para la asignación de guardias en un año determinado. AC y AP tienen grupos **separados** — un médico pertenece a un solo grupo. |
| **Festivo** | Un día festivo público (nacional, autonómico o local) para la ciudad del hospital en España. |
| **Cobertura diaria** | Cada día: **1 guardia AC, 1 guardia AP y 1 refuerzo**. Hay **2 refuerzos** en los festivos especiales de sanidad, en el segundo de dos festivos consecutivos y, desde 2027, en todos los sábados (RN-7). El refuerzo lo cubre AP, salvo que un AC necesite horas ese mes (RN-12). `doctors_per_day` vale siempre 1. |

---

## 3. Funcionalidades

### 3.1 — Generación de Rota

**Descripción:** Dado un grupo de médicos y un año objetivo, el sistema calcula un calendario de guardias completo para todo el año que satisface todas las restricciones.

#### Reglas de Negocio

- RN-1: Cada médico de AC debe tener asignadas **al menos 1.620 horas/año** (135h/mes de media durante 12 meses) de Atención Continuada. Es una **restricción blanda** — si no se cumple, el cuadrante se genera con un aviso y las estadísticas muestran las horas faltantes.
- RN-2: Cada médico de AP debe tener asignadas **como máximo 425 horas/año** de Atención Primaria. Es una **restricción blanda** — si no se cumple, el cuadrante se genera con un aviso y las estadísticas muestran las horas que sobran.
- RN-3: La duración de los turnos depende de la rota, del tipo de día y del año.

  **Hasta 2026** (sin cambios): la guardia ya era idéntica en AC y AP; el refuerzo (de AP o de AC) tiene su propio horario, distinto del de la guardia:

  | Rol | Lunes–Viernes | Sábado | Domingo / Festivo |
  |------------|---------------|--------|--------------------|
  | Guardia (AC y AP) | 17 h (15:00 → 08:00+1) | 18 h (15:00 → 09:00+1) | 23 h (09:00 → 08:00+1) |
  | Refuerzo (de AP o de AC) | 7 h (15:00 → 22:00) | 7 h (15:00 → 22:00) | 12 h (10:00 → 22:00) |

  **Desde 2027**: la guardia es idéntica en AC y AP; el refuerzo (de AP o de AC) tiene su propio horario, distinto del de la guardia:

  | Rol | Lunes–Jueves | Viernes | Sábado (festivo o no) | Domingo / Festivo entre semana |
  |-----|--------------|---------|------------------------|----------------------------------|
  | Guardia (AC y AP) | 17 h (15:00 → 08:00+1) | 18 h (15:00 → 09:00+1) | 24 h (09:00 → 09:00+1) | 23 h (09:00 → 08:00+1) |
  | Refuerzo (de AP o de AC) | 7 h (15:00 → 22:00) | 7 h (15:00 → 22:00) | 12 h (10:00 → 22:00) | 12 h (10:00 → 22:00) |

  Sin migración de datos: un cuadrante generado antes de un cambio de horario conserva las horas con las que se generó hasta que se regenera.
- RN-4: El calendario debe ser **equitativo** — los médicos deben tener el mismo número (o lo más cercano posible) de guardias y de horas totales. El reparto por tipo de día depende del método (RN-14): con «Ruedas» cada tipo de día se reparte con ±1; con «Rueda única» (predeterminado) se iguala el número de guardias, pero los sábados, domingos y festivos caen donde caigan en la rueda.
- RN-5: AC y AP tienen **grupos de médicos separados**. Un médico pertenece a un solo grupo. Los dos cuadrantes se generan **juntos, con una sola acción**: AC primero y después AP, porque los refuerzos que hace un AC se descuentan de los de AP.
- RN-6: Los domingos que también son festivos cuentan como un único turno Domingo/Festivo (sin doble conteo).
- RN-7: La cobertura diaria es fija: **1 guardia AC, 1 guardia AP y 1 refuerzo**, o **2 refuerzos** en un festivo especial de sanidad (RN-13), en un festivo precedido de otro festivo (los domingos cuentan como festivo) o, desde 2027, en cualquier sábado (sea festivo o no); un festivo especial que además sigue a otro festivo sigue teniendo 2. Si el pool AC es demasiado grande para que todos alcancen su mínimo (o el pool AP demasiado pequeño para respetar su máximo de 425h) con esa cobertura, el cuadrante se genera igualmente y la respuesta incluye el aviso "El grupo … es demasiado grande …" (AC) o "El grupo … es demasiado pequeño …" (AP) con el número de médicos que incumplen y las horas que faltan o sobran en total.
- RN-8: **Día de descanso post-guardia** — un médico que está de guardia o de refuerzo el día D **no está disponible** para asignación el día D+1 dentro de su grupo, y nadie hace guardia y refuerzo el mismo día. Los descansos de AC no afectan a AP y viceversa. La excepción es el refuerzo de un AC (RN-12), que se coloca a propósito el día anterior a su guardia. Restricción blanda para grupos muy pequeños.
- RN-9: Las asignaciones de guardia deben tener **máxima variación de grupo** — el algoritmo baraja el orden del grupo (salvo que continúe el cuadrante del año anterior del mismo tipo, caso en que conserva su orden) y recorre ruedas (por tipo de día o una única rueda de guardias, según la estrategia) para evitar que el mismo subconjunto de médicos sea asignado siempre junto.
- RN-10: Si un festivo cae en sábado, se clasifica como **festivo**, no como sábado (hasta 2026 esto también fija las horas: turno de guardia de 23h para AC y AP, y de 12h para el refuerzo, no el de sábado; desde 2027 las horas de guardia de cualquier sábado son 24h sea festivo o no, RN-3). La clasificación de festivo siempre tiene prioridad a efectos de estadísticas y de la regla del segundo festivo consecutivo (RN-7).
- RN-11: **Guardia AP y refuerzos**: la guardia AP comparte siempre horario con la de AC (RN-3), en los dos regímenes; el refuerzo (de AP o de AC) tiene siempre su propio horario, distinto del de la guardia del día. En los dos regímenes, guardias y refuerzos se reparten por separado para que cada médico AP haga un número parecido de cada uno.
- RN-12: **Refuerzo de un AC por horas mensuales**: si un médico AC no llega a **135 h en un mes**, cubre refuerzos (con el horario de refuerzo del día, RN-3) el **día anterior a alguna de sus guardias de ese mes**, tantos como necesite para llegar a 135 h y mientras haya hueco: el día anterior debe estar en el mismo mes, no ser su día de descanso y tener aún un refuerzo libre. Cada refuerzo AC sustituye a un refuerzo AP de ese día. Si no hay hueco suficiente, el cuadrante se genera con el aviso «No hay hueco para más refuerzos y algunos médicos AC quedan por debajo de 135h en el mes: …».
- RN-13: **Festivos especiales de sanidad**: el 24, 25 y 31 de diciembre y el 1 y 6 de enero se añaden siempre al obtener los festivos del año, se marcan como especiales (`special: true`) y no se pueden desmarcar. Cuentan como festivo a todos los efectos (hasta 2026: la guardia, AC y AP, 23 h desde las 09:00, y el refuerzo 12 h; desde 2027: la guardia, AC y AP, sigue las horas de RN-3 según caiga en sábado o no, y el refuerzo 12 h) y llevan siempre 2 refuerzos.
- RN-14: **Métodos de asignación**: el usuario elige con qué método se generan los cuadrantes. **«Rueda única»** (`single-wheel`, predeterminado): todas las guardias recorren una sola rueda en el orden del grupo, sea laborable, sábado, domingo, festivo o festivo especial; los refuerzos se reparten con una rueda por tipo de día. **«Ruedas»** (`wheels`): guardias y refuerzos tienen cada uno una rueda por tipo de día (laborables, sábados, domingos y festivos). En los dos, a quien le toca y no ha descansado se le salta y conserva el turno. El antiguo método «Equilibrado» (`balanced`) está retirado: no se puede elegir, y los cuadrantes ya generados con él se conservan y se muestran como «Equilibrado (retirado)».
#### Criterios de Aceptación

| ID | Criterio |
|----|---------|
| CA-3.1.1 | **Dados** los grupos AC y AP y un año objetivo, **cuando** se llama una sola vez al endpoint de generación, **entonces** se devuelven los dos cuadrantes completos de 365/366 días: cada día con 1 guardia AC, 1 guardia AP y sus refuerzos, cada médico con su papel (`guardia` o `refuerzo`). |
| CA-3.1.2 | **Dada** una rota AC generada, **cuando** se suman las horas individuales de cada médico, **entonces** todos los médicos tienen >= 1.620 horas/año si el pool es factible; si no, la rota se genera con un aviso y las horas faltantes en las estadísticas. |
| CA-3.1.3 | **Dada** una rota AP generada, **cuando** se suman las horas individuales de cada médico, **entonces** ningún médico supera 425 horas/año si el pool es factible; si no, la rota se genera con un aviso y las horas que sobran en las estadísticas. |
| CA-3.1.4 | **Dada** una rota generada, **cuando** se comparan las horas totales entre médicos, **entonces** la diferencia entre el médico con más horas y el médico con menos horas se minimiza (objetivo: <= 1 turno de diferencia por tipo de día). |
| CA-3.1.5 | **Dada** una rota generada, **cuando** se inspeccionan los festivos entre semana y los domingos (no los sábados, ver CA-3.1.12), **entonces** usan la duración de turno de 23 horas (09:00→08:00+1), en los dos regímenes de horario (RN-3). |
| CA-3.1.6 | **Dada** una rota generada, **cuando** se inspeccionan los sábados, **entonces** usan la duración de turno de 18 horas (15:00→09:00+1) hasta 2026; desde 2027, 24 horas (09:00→09:00+1), sea festivo o no (RN-3). |
| CA-3.1.7 | **Dada** una rota generada, **cuando** se inspeccionan los días laborables (Lun-Vie, no festivos), **entonces** usan la duración de turno de 17 horas (15:00→08:00+1) hasta 2026; desde 2027, 17 horas de lunes a jueves y 18 horas (15:00→09:00+1) el viernes (RN-3). |
| CA-3.1.8 | **Dado** un año, **cuando** se genera la rota, **entonces** el sistema obtiene y clasifica correctamente los festivos públicos para la ciudad configurada. |
| CA-3.1.9 | **Dados** grupos separados de AC y AP, **entonces** los médicos pertenecen a un solo grupo (un médico en los dos grupos se rechaza con 400) y los dos cuadrantes se generan en la misma petición. |
| CA-3.1.10 | **Dado** que un médico está de guardia el día D, **entonces** ese médico no tiene asignación el día D+1 dentro del mismo tipo de rota (día de descanso solo por tipo). |
| CA-3.1.11 | **Dada** una rota generada, **cuando** se examinan qué médicos son asignados juntos en diferentes días, **entonces** el algoritmo varía las agrupaciones (ningún grupo fijo de médicos es siempre asignado junto). |
| CA-3.1.12 | **Dado** un festivo que cae en sábado, **entonces** ese día se clasifica como festivo (hasta 2026, turno de 23h, no como sábado de 18h); desde 2027 sigue clasificándose como festivo a efectos de estadísticas, pero su turno es el de sábado, de 24h (RN-3, RN-10). |
| CA-3.1.13 | **Dado** un grupo de médicos, **cuando** el algoritmo se ejecuta, **entonces** la cobertura primary base es exactamente 1 médico/día. Si el pool excede la capacidad anual de cobertura, la rota se genera igualmente y la respuesta incluye un aviso en `warnings`. |
| CA-3.1.14 | **Dados** los cuadrantes generados, **cuando** se inspeccionan los festivos, **entonces** en los dos regímenes la guardia AP usa el turno de guardia del día (23h, igual que la AC, RN-3) y el refuerzo se mantiene en 12 h (10:00→22:00). En los dos regímenes, los festivos especiales, los festivos precedidos de otro festivo y, desde 2027, los sábados (CA-3.1.6) tienen **2 refuerzos**; el resto de festivos tiene 1. |
| CA-3.1.15 | **Dados** los cuadrantes generados, **cuando** se inspeccionan los laborables y sábados, **entonces** en los dos regímenes cada día tiene 1 guardia AP y 1 refuerzo: hasta 2026 la guardia AP es de 17h laborable y 18h sábado (igual que la AC) y el refuerzo de 7h (15:00→22:00); desde 2027 la guardia AP sigue el turno de guardia del día (17h L-J, 18h viernes, 24h sábado, RN-3) y el refuerzo es de 7h de lunes a viernes y de 12h el sábado.
| CA-3.1.16 | **Dado** un médico AC con menos de 135 h en un mes, **entonces** hace refuerzos con su propio horario de refuerzo (RN-3) el día anterior a alguna de sus guardias de ese mes hasta llegar a 135 h, y esos refuerzos se descuentan de los de AP; si no hay hueco, el cuadrante incluye un aviso. |
| CA-3.1.17 | **Dado** cualquier año, **cuando** se obtienen sus festivos, **entonces** incluyen el 24, 25 y 31 de diciembre y el 1 y 6 de enero marcados como especiales, y eliminar uno devuelve 400 «Los festivos especiales de sanidad no se pueden eliminar». |
| CA-3.1.18 | **Dada** una petición de generación sin `strategy`, **entonces** los cuadrantes se generan con «Rueda única» (`single-wheel`) y lo indican en `strategy`; con `strategy: "wheels"` se generan con «Ruedas». Cualquier otro valor, incluido `balanced`, responde 400 «el método de asignación debe ser single-wheel o wheels». |
| CA-3.1.19 | **Dado** un cuadrante generado con «Rueda única», **cuando** no hay choques de descanso (p. ej. la guardia AC), **entonces** la guardia del día *i* del año la hace el médico *i mod N* del grupo (ya barajado; sin cuadrante del año anterior, que si existe se continúa), sin distinguir el tipo de día; los refuerzos siguen una rueda por tipo de día. |

---

### 3.2 — Persistencia y Consulta de Rota

**Descripción:** Las rotas generadas se almacenan y pueden consultarse para un año determinado.

#### Criterios de Aceptación

| ID | Criterio |
|----|---------|
| CA-3.2.1 | **Dada** una rota generada para el año Y y tipo T, **cuando** se llama al endpoint de consulta con año Y y tipo T, **entonces** se devuelve la rota almacenada. |
| CA-3.2.2 | **Dada** la ausencia de rota para el año Y y tipo T, **cuando** se llama al endpoint de consulta, **entonces** se devuelve una respuesta 404 o vacía indicando que no existe rota. |
| CA-3.2.3 | **Dada** una rota almacenada, **cuando** se consulta con un filtro de médico, **entonces** solo se devuelven las asignaciones de ese médico. |
| CA-3.2.4 | **Dada** una rota re-generada para un año/tipo que ya tiene una, **entonces** la rota anterior para ese tipo se reemplaza completamente. |

---

### 3.3 — Sustitución de Médico

**Descripción:** Un médico específico en una rota existente puede ser reemplazado por otro médico para una asignación concreta.

#### Criterios de Aceptación

| ID | Criterio |
|----|---------|
| CA-3.3.1 | **Dada** una rota almacenada y una solicitud de sustitución válida (fecha, médico antiguo, médico nuevo), **cuando** se realiza la sustitución, **entonces** la asignación para esa fecha refleja el nuevo médico. |
| CA-3.3.2 | **Dada** una sustitución, **cuando** se recalculan las estadísticas de la rota, **entonces** los totales de horas reflejan el cambio. |
| CA-3.3.3 | **Dado** un día con guardia AP y refuerzos, **cuando** se sustituye un refuerzo, **entonces** la guardia AP permanece y el nuevo médico aparece como refuerzo (sustituir conserva el papel). |

---

### 3.4 — Resolución de Festivos

**Descripción:** El sistema obtiene los festivos públicos para la ciudad configurada del hospital en España para clasificar correctamente los tipos de día. La ciudad es una **configuración a nivel de aplicación** establecida antes de ejecutar la aplicación, compartida por el backend y el frontend.

#### Criterios de Aceptación

| ID | Criterio |
|----|---------|
| CA-3.4.1 | **Dada** la ciudad configurada y un año objetivo, **cuando** se obtienen los festivos, **entonces** se incluyen los festivos nacionales, autonómicos y locales. |
| CA-3.4.2 | **Dados** los festivos obtenidos, **cuando** se genera la rota, **entonces** las fechas festivas se clasifican como tipo de día Domingo/Festivo, con turnos de 23 horas salvo que, desde 2027, también caigan en sábado, en cuyo caso el turno es el de sábado de 24 horas (RN-3, RN-10). |
| CA-3.4.3 | **Dado** que la fuente externa de festivos no está disponible, **cuando** se genera la rota, **entonces** el sistema devuelve un error apropiado en lugar de generar un calendario incorrecto. |
| CA-3.4.4 | **Dado** un sábado que también es festivo, **entonces** se clasifica como festivo, no como sábado; hasta 2026 su turno es el de festivo (23h), no el de sábado (18h). Desde 2027 la clasificación de festivo se mantiene (estadísticas, RN-7), pero el turno es el de sábado, de 24h (RN-3). |

---

### 3.5 — Estadísticas de Rota

**Descripción:** El sistema devuelve estadísticas por médico junto con la rota.

#### Criterios de Aceptación

| ID | Criterio |
|----|---------|
| CA-3.5.1 | **Dada** una rota generada o almacenada, **cuando** se solicitan estadísticas, **entonces** la respuesta incluye por médico: horas totales desglosadas en horas de guardia (`guardia_hours`) y horas de refuerzo (`refuerzo_hours`), desglose mensual de horas, recuento de turnos por tipo de día (laborable/sábado/domingo-festivo). |
| CA-3.5.3 | **Dado** un médico por debajo de su objetivo anual, **cuando** se muestran las estadísticas, **entonces** aparecen sus horas faltantes («Faltan») y el resumen incluye el total de «Horas faltantes». |
| CA-3.5.2 | **Dadas** las estadísticas, **cuando** se revisa la equidad, **entonces** las estadísticas muestran claramente cualquier desequilibrio entre médicos. |

---

### 3.6 — Interfaz de Usuario: Vista de Calendario

**Descripción:** Una interfaz web muestra la rota en un diseño de dos columnas con vista de calendario.

#### Criterios de Aceptación

| ID | Criterio |
|----|---------|
| CA-3.6.1 | **Dada** la carga de la interfaz, **cuando** existe una rota para el año seleccionado, **entonces** el calendario muestra todas las asignaciones para cada día de cada mes. |
| CA-3.6.2 | **Dada** la carga de la interfaz, **cuando** no existe cuadrante para el año seleccionado, **entonces** el calendario está vacío y el único botón de generar muestra "Generar cuadrante" en las dos pestañas. |
| CA-3.6.3 | **Dado** un cuadrante existente, **entonces** el botón de generar muestra "Regenerar cuadrante". |
| CA-3.6.4 | **Dado** que el usuario hace clic en "Regenerar cuadrante", **entonces** aparece un diálogo de confirmación advirtiendo que los cuadrantes AC y AP actuales serán reemplazados antes de continuar. |
| CA-3.6.5 | **Dada** la interfaz, **entonces** hay un selector de año visible que por defecto muestra el año actual. |
| CA-3.6.6 | **Dado** que el usuario cambia el año, **entonces** el calendario recarga los datos del año seleccionado. |
| CA-3.6.7 | **Dada** la carga de la interfaz, **entonces** el nombre de la ciudad configurada se muestra en la interfaz. |
| CA-3.6.9 | **Dada** una celda de calendario, **entonces** muestra tres bloques: `AC` (guardia AC), `AP` (guardia AP) y `REFUERZO`, con cada refuerzo prefijado con `R:`; el refuerzo de un médico AC aparece con el sufijo `(AC)`. |
| CA-3.6.10 | **Dado** un día con 2 refuerzos, **entonces** la celda muestra ambos en el bloque `REFUERZO`, cada uno con prefijo `R:`. Un festivo especial de sanidad se distingue con un estilo propio y una estrella, y su menú contextual indica que no se puede desmarcar. |
| CA-3.6.11 | **Dada** la interfaz, **entonces** junto al botón de generar hay un selector «Método de asignación» con «Rueda única (predeterminado)», seleccionado por defecto, y «Ruedas (orden estricto)»; con un cuadrante cargado se muestra «Generado con: …» con el método usado (los cuadrantes antiguos sin método o con `balanced`, como «Equilibrado (retirado)»). |

---

### 3.7 — Interfaz de Usuario: Panel de Grupo de Médicos

**Descripción:** El panel izquierdo muestra el grupo de médicos disponibles para asignación.

#### Criterios de Aceptación

| ID | Criterio |
|----|---------|
| CA-3.7.1 | **Dada** la carga de la interfaz, **entonces** el panel izquierdo muestra las tarjetas de médicos del equipo seleccionado. Un equipo sin médicos (también el «Equipo principal» recién migrado) empieza con la lista inicial del archivo de configuración estático, que se guarda como lista del equipo. |
| CA-3.7.2 | **Dada** una tarjeta de médico, **entonces** muestra el nombre y el departamento del médico. |
| CA-3.7.3 | **Dado** que el usuario hace clic en "Añadir médico", **entonces** puede añadir un nuevo médico al grupo (nombre, departamento), que se guarda en la lista del equipo. |
| CA-3.7.4 | **Dadas** las tarjetas de médico, **entonces** se pueden arrastrar y soltar en las celdas del calendario con guardia; al soltar se abre un diálogo con tres acciones, iguales para AC y AP: **sustituir al médico de la guardia** de su grupo (AC o AP), **sustituir a cualquiera de los refuerzos** del día (también los de otro grupo: el refuerzo pasa a su cuadrante) y **añadir al refuerzo**. Si el médico ya tiene guardia o refuerzo ese día se muestra un aviso y no se abre el diálogo. |
| CA-3.7.5 | **Dado** el fondo del panel izquierdo, **entonces** los botones de "Añadir médico", "Cargar lista" y "Generar cuadrante" / "Regenerar cuadrante" son visibles. |

---

### 3.8 — Interfaz de Usuario: Panel de Estadísticas

**Descripción:** Un panel lateral oculto muestra las estadísticas de rota por médico.

#### Criterios de Aceptación

| ID | Criterio |
|----|---------|
| CA-3.8.1 | **Dada** una rota cargada, **cuando** el usuario abre el panel de estadísticas, **entonces** se muestran los desgloses de horas por médico. |
| CA-3.8.2 | **Dado** el panel de estadísticas, **entonces** muestra las horas totales desglosadas en horas de guardia y de refuerzo, el desglose mensual de horas y los recuentos de turnos por tipo de día para cada médico; el resumen del panel desglosa igual el total de todos los médicos. El panel de estadísticas tiene un selector AC/AP para mostrar las estadísticas del tipo activo. |
| CA-3.8.3 | **Dado** que el panel de estadísticas está cerrado por defecto, **entonces** se puede alternar entre abierto y cerrado. |

---

### 3.9 — Exportación a Excel

**Descripción:** El usuario puede descargar los cuadrantes del año seleccionado (AC y AP juntos) como un libro de Excel.

#### Criterios de Aceptación

| ID | Criterio |
|----|---------|
| CA-3.9.1 | **Dado** un año con cuadrantes generados, **cuando** el usuario pulsa «Exportar a Excel», **entonces** se descarga `cuadrante-guardias-<equipo>-<año>.xlsx` con los cuadrantes del equipo seleccionado: una hoja `Cuadrante` (una fila por día, con médico, horario y horas de la guardia AC, de la guardia AP y de los refuerzos, marcando con «(AC)» los que cubre un médico AC); una hoja `Horarios` con los turnos reales (guardia y refuerzo) agrupados por horario y horas, con sus turnos en AC y en AP; una hoja `Totales` con un bloque por grupo (guardias, refuerzos y horas por médico, más la suma `Total AC + AP`); una hoja de estadísticas por tipo (`Estadísticas AC`, `Estadísticas AP`) con las columnas `Horas guardia` y `Horas refuerzo`, además de `Refuerzos`; y, por tipo, una hoja `Días` (una fila por asignación, con semana, mes y horario), una hoja `Semanas` (horas por médico y semana del año, de lunes a domingo) y una hoja `Meses` (horas por médico y mes), con todos los médicos del grupo en todas las semanas y meses aunque no trabajen ese periodo, para poder comprobar a mano las horas de cualquier médico por día, semana o mes. Si no hay ningún cuadrante, el botón está deshabilitado y el endpoint devuelve 404 con un mensaje en español. |

---

### 3.10 — Borrado de los cuadrantes

**Descripción:** El usuario puede borrar los cuadrantes del año seleccionado (AC y AP juntos) para empezar de cero, sin generar otros nuevos.

#### Criterios de Aceptación

| ID | Criterio |
|----|---------|
| CA-3.10.1 | **Dado** un año con cuadrantes generados, **cuando** el usuario pulsa «Borrar cuadrantes» y confirma, **entonces** se borran los cuadrantes AC y AP del año con todas sus guardias, refuerzos y cambios manuales, el calendario y las estadísticas quedan vacíos y aparece «Cuadrantes AC y AP de <año> del equipo «<equipo>» borrados». Sólo se borran los del equipo seleccionado. Los festivos, también los manuales, se conservan. Si cancela, no cambia nada. |
| CA-3.10.2 | **Dado** un año sin cuadrantes, el botón «Borrar cuadrantes» está deshabilitado y `DELETE /api/v1/rota/:year` devuelve 404 con un mensaje en español. |

---

### 3.11 — Equipos y carga de la lista de médicos

**Descripción:** Un hospital puede tener varios equipos. Cada equipo tiene un nombre, su propia lista de médicos (AC y AP) y sus propios cuadrantes AC y AP por año. La lista de un equipo se puede sustituir subiendo un fichero.

#### Criterios de Aceptación

| ID | Criterio |
|----|---------|
| CA-3.11.1 | **Dada** la interfaz, **entonces** encima de la lista de médicos hay un desplegable «Equipo» con los equipos por orden de creación y las acciones «+ Nuevo», «Renombrar» y «Borrar». Siempre existe al menos un equipo: el «Equipo principal», al que pasan los cuadrantes anteriores a los equipos. Al abrir la aplicación se selecciona el último equipo usado en ese navegador, o el primero. |
| CA-3.11.2 | **Dado** que el usuario cambia de equipo, **entonces** se muestran la lista de médicos y los cuadrantes del año de ese equipo; generar, regenerar, sustituir, añadir, borrar cuadrantes y exportar actúan sólo sobre ellos. |
| CA-3.11.3 | **Dado** que el usuario crea un equipo, **entonces** indica su nombre (único, no vacío, máx. 100 caracteres), el equipo empieza con la lista inicial de médicos y pasa a ser el seleccionado. Un nombre repetido muestra el error en el propio diálogo. |
| CA-3.11.4 | **Dado** que el usuario borra un equipo y confirma, **entonces** se borran su lista y todos sus cuadrantes de todos los años y se selecciona el primer equipo. El único equipo que queda no se puede borrar (botón deshabilitado; la API responde 400). |
| CA-3.11.5 | **Dado** que el usuario pulsa «Cargar lista» y elige un fichero JSON (la forma de `assets/doctors.json`) o CSV (cabecera con `nombre` y `grupo` obligatorias, `departamento` e `id` opcionales; separador `;`, `,` o tabulador), **entonces** se pide confirmación indicando cuántos médicos AC y AP trae y, al confirmar, la lista del equipo se sustituye por la del fichero. Los cuadrantes ya generados conservan sus médicos hasta que se regeneren. Formato completo y ficheros de ejemplo en `docs/samples/README.md`. |
| CA-3.11.6 | **Dado** un fichero no válido (sin médicos, sin la columna de nombre o de grupo, un grupo distinto de AC/AP, un identificador repetido), **entonces** no se cambia nada y se muestra un error en español que indica la línea o el médico. |

---

## 4. Fuera de Alcance (PoC)

Lo siguiente queda explícitamente **fuera del alcance** de esta PoC:

- Autenticación y autorización de usuarios
- Control de acceso basado en roles
- Registro de auditoría
- Soporte multi-hospital / multi-ubicación
- Preferencias o restricciones de disponibilidad del médico (p. ej., vacaciones, conflictos)
- Deshacer/rehacer cambios de rota
- Sistema de notificaciones (email/SMS)
- Diseño adaptable para móviles (solo escritorio es aceptable)
- Despliegue en producción (solo entornos locales y basados en Docker). Sí hay integración continua: build y tests de backend y frontend en cada PR (`.github/workflows/ci.yml`)

---

## 5. Supuestos

1. Los médicos pertenecen al grupo AC o al grupo AP, no a ambos. Los grupos se gestionan por separado.
2. La cobertura diaria es fija: 1 guardia AC, 1 guardia AP y 1 refuerzo (2 en festivos especiales, en el segundo de dos festivos consecutivos y, desde 2027, en todos los sábados). No se calcula automáticamente.
3. La ciudad del hospital para la resolución de festivos es **configurable a nivel de aplicación** (configuración estática establecida antes de ejecutar la aplicación), compartida por el backend y el frontend.
4. El archivo de configuración estático de médicos es un archivo JSON simple incluido con el frontend, donde cada médico especifica su `rota_type` (AC o AP). Es la lista inicial de cualquier equipo sin médicos; la lista de cada equipo se guarda en la base de datos.
5. "Equitativo" significa minimizar la diferencia máxima en horas totales y en recuento por tipo de día entre todos los médicos dentro de un tipo de rota.
6. Un médico de guardia o refuerzo el día D tiene un día de descanso en D+1 dentro de su grupo. Los descansos de AC no afectan a AP y viceversa; el refuerzo de un AC se coloca el día anterior a su guardia.
7. Los límites de horas son **restricciones blandas**: los médicos de AC deben alcanzar 135h cada mes (1.620h/año), completándolas con refuerzos si hace falta, y los médicos de AP no pueden superar 425h/año; si no se cumplen, el cuadrante se genera con un aviso.

---

## 6. Decisiones Resueltas

Estas eran inicialmente preguntas abiertas, ahora resueltas con aportaciones de las partes interesadas:

| # | Pregunta | Resolución |
|---|---------|------------|
| DR-1 | ¿Deben AC y AP compartir un único grupo de médicos? | **No.** AC y AP tienen grupos separados. Un médico pertenece a un solo grupo. Los dos cuadrantes se generan juntos. |
| DR-2 | ¿Para qué ciudad española específica se deben resolver los festivos? ¿Debe ser configurable? | **Configurable a nivel de aplicación.** La ciudad es una configuración estática a nivel de aplicación establecida antes de ejecutar la aplicación. Se aplica tanto al backend (resolución de festivos) como al frontend (mostrado en la interfaz). |
| DR-3 | ¿Hay un número máximo de días de guardia consecutivos para un médico? | **Implícito mediante la regla de día de descanso.** Un médico de guardia el día D descansa el D+1, por lo que las guardias consecutivas son imposibles. Además, las asignaciones deben ser lo más dispersas posible. |
| DR-4 | ¿Los festivos que caen en sábado deben usar horas de sábado o de festivo? | **El festivo tiene prioridad a efectos de clasificación** (estadísticas, segundo festivo consecutivo). Hasta 2026 esto también fijaba las horas: un sábado festivo usaba el turno de festivo de 23 horas, no el de sábado de 18 horas. Desde 2027 el turno de cualquier sábado es el de 24 horas, sea festivo o no (RN-3). |
| DR-5 | ¿AngularJS (1.x, EOL) vs Angular (v19+)? | **Angular v19+.** Se usará el framework moderno y mantenido activamente. |
| DR-6 | ¿Cuántos médicos por día? | **Cobertura fija:** 1 guardia AC, 1 guardia AP y 1 refuerzo; 2 refuerzos en festivos especiales de sanidad, en el segundo de dos festivos consecutivos y, desde 2027, en todos los sábados. No es un parámetro de usuario. |
| DR-7 | ¿Los límites de horas son restricciones blandas o duras? | **Restricciones blandas.** Si un médico de AC no alcanza el mínimo o uno de AP supera el máximo, el cuadrante se genera con un aviso y las estadísticas muestran la desviación. |
| DR-8 | ¿Las horas mínimas de AC son anuales o mensuales? | **Promedio mensual.** Los médicos de AC necesitan 135h/mes × 12 = 1.620h/año. El algoritmo valida el total anual. |
