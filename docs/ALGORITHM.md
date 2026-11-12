# Algoritmo de Asignación

**Fuente:** [`backend/src/scheduling/assignment.service.ts`](../backend/src/scheduling/assignment.service.ts)

El algoritmo de planificación genera de una vez los dos cuadrantes del año, **AC y AP**, con grupos de médicos separados (`generateRotas`). Cada día tiene:

- **1 guardia AC** (grupo AC) y **1 guardia AP** (grupo AP), siempre con el mismo horario (`guardiaShiftDetails`, `scheduling/shifts.ts`), hasta 2026 y desde 2027; sólo cambian las horas por tipo de día desde 2027 (`SHIFTS_2027_FROM_YEAR`).
- **1 refuerzo**, o **2** en un festivo especial de sanidad (24, 25 y 31 dic, 1 y 6 ene), en un festivo precedido de otro festivo o, desde 2027, en cualquier sábado (sea festivo o no). El refuerzo tiene su propio horario (`refuerzoShiftDetails`), distinto del de la guardia del día, y lo cubre el grupo AP, salvo los que necesita un AC para llegar a sus horas del mes.

Para **AC**, cada médico debe llegar a **135h cada mes** (1.620h/año). Para **AP**, cada médico tiene un **máximo de 425h/año**; con la guardia AP tan larga como la de AC, el aviso blando existente (paso 5) salta con pools realistas (ver el ejemplo del grupo real de 17 más abajo). Hasta 2026, la guardia (AC y AP) dura 17h laborable, 18h sábado y 23h festivo, y el refuerzo 7h (15:00–22:00) de lunes a sábado y 12h (10:00–22:00) en festivo; desde 2027, la guardia y el refuerzo tienen horas propias y distintas por tipo de día (ver «Tipos de Día y Duraciones»).

---

## Visión General

```
generar_rotas(año, grupo_AC, grupo_AP, clasificaciones_días):
  1. AC: asignar la guardia AC de cada día (1 plaza/día) con la estrategia elegida
  2. Refuerzos AC (planAcRefuerzos): para cada mes y cada AC por debajo de 135h,
     reservar refuerzos el día anterior a sus guardias de ese mes hasta llegar a 135h
  3. AP: asignar cada día 1 guardia AP + (refuerzosForDay(día) − refuerzos AC reservados ese día)
     con la estrategia elegida: primero la guardia y después los refuerzos, sin repetir médico
     y respetando el día de descanso (`wheels` o `single-wheel`, ver más abajo)
  4. Comprobar límites de horas (mínimo AC, máximo AP; si no se cumplen, aviso en `warnings`; no bloquea)
  5. Devolver los dos calendarios con estadísticas
```

`generateRota(año, tipo, …)` sigue disponible para un solo grupo sin interacción con el otro (AC sólo con su guardia, AP con su guardia y todos los refuerzos); se usa en análisis y pruebas.

---

## Paso a Paso

### 1. Calcular objetivos por médico

- **AP:** cada médico mantiene el tope plano de `425h/año` (**máximo**)
- **AC:** cada médico mantiene el objetivo plano de `1.620h/año` (135h/mes × 12); el mínimo mensual de 135h se completa con refuerzos (paso 3)

`buildTargetHours(rotaType, pool)` asigna el mismo objetivo a todos los médicos del pool según el tipo de rota; no hay objetivos personalizados por médico.

### 2. Cobertura diaria

La cobertura es fija y no crece con el tamaño del pool: 1 guardia AC, 1 guardia AP y `refuerzosForDay(día, día_anterior)` refuerzos:

- **2** si el día es un festivo especial de sanidad (`DayInfo.specialHoliday`), un festivo cuyo día anterior también es festivo o, desde 2027, cualquier sábado (sea festivo o no). Un festivo especial que además sigue a otro festivo (25 dic, 1 ene) sigue teniendo 2, no 3.
- **1** en el resto de días, incluidos los festivos aislados y el primero de una serie.

Los domingos cuentan como festivo. El 1 de enero no tiene día anterior en el año clasificado: `RotaService.generate` clasifica el 31 de diciembre anterior y lo pasa como `dayBeforeYear` (aunque, como el 31 de diciembre es siempre festivo especial, el 1 de enero lleva siempre 2).

Los festivos especiales (`backend/src/common/sanidad-holidays.ts`) son festivo a todos los efectos aunque la API no los traiga: `classifyDay` los marca como `holiday` con `publicHoliday` y `specialHoliday`.

El `minPool` se calcula con el pico anual de plazas del grupo: 2 en AC (1 × 2) y 6 en AP (guardia + 2 refuerzos, × 2 por el descanso).

Si el pool AC es demasiado grande para que cada médico llegue a su mínimo con esa cobertura, el algoritmo **no falla**: genera el cuadrante y añade a `warnings` un aviso ("El grupo de N médicos es demasiado grande para AC: el objetivo de Xh supera la capacidad anual de cobertura de Yh. K médicos quedan por debajo del mínimo de Mh; faltan Zh en total."). En AP ocurre al revés: si el pool es demasiado pequeño y la cobertura anual superaría el máximo de 425h por médico, también genera con aviso ("El grupo de N médicos es demasiado pequeño para AP: la cobertura anual de Yh supera el máximo de 425h por médico (se necesitan al menos M médicos). K médicos quedan por encima del máximo de 425h; sobran Zh en total."). Un pool AP grande es válido: cada médico simplemente hace menos horas.

### 3. Refuerzos AC por horas mensuales (`planAcRefuerzos`)

Tras asignar las guardias AC, para cada mes se ordenan los AC por horas que les faltan para 135h (de más a menos). Cada uno recorre sus guardias de ese mes en orden y toma un refuerzo el **día anterior** (D−1) si:

- D−1 está en el mismo mes (las horas cuentan para ese mes);
- no tiene ya una asignación ese día ni el anterior (no es su día de descanso);
- ese día aún queda un refuerzo libre (`refuerzosForDay`).

Cada refuerzo suma las horas de refuerzo del día (7 h o 12 h) y se guarda en el cuadrante AC con `role: 'refuerzo'` y su propio horario. Se repite hasta llegar a 135h. Si no hay hueco, se añade un único aviso: «No hay hueco para más refuerzos y algunos médicos AC quedan por debajo de 135h en el mes: Dr. X (febrero, faltan 5h); …». Los refuerzos reservados se descuentan de los que cubre AP ese día.

Con el grupo real de 4 AC salen unos 37 refuerzos AC en 2026; febrero y los meses de 30 días son los que más los necesitan.

#### Validación de capacidad

Tras calcular `doctors_per_day`, el algoritmo compara la capacidad anual de cobertura con el total de targets (AC: capacidad >= mínimos; AP: capacidad <= máximos):

```python
total_capacity = sum(horas de cada asignación del cuadrante)  # incluye los refuerzos AC
total_target = sum(target_por_médico for médico in grupo)
pool_AC_demasiado_grande = total_capacity < total_target
pool_AP_demasiado_pequeño = total_capacity > total_target
```

Si no se cumple (en AP, pools de < 7 médicos con la aritmética actual), la generación continúa y el aviso final indica que el grupo es demasiado grande (AC) o demasiado pequeño (AP).

Ejemplos:
- Grupo AC de 4 → capacidad ≈ 6.627h; target = 4×1620 = 6.480h → OK, 1 médico/día.
- Grupo AC de 5 → target = 8.100h > 6.627h → se genera **con aviso** (faltan horas).
- Grupo AP de 17 (el grupo real, `assets/doctors.json`) → con la guardia AP tan larga como la de AC, capacidad ≈ 9.408h; tope = 17×425 = 7.225h < 9.408h → se genera **con aviso** (pool demasiado pequeño; hacen falta al menos 23 médicos).

### 4. Elegir a los médicos: la estrategia

Quién hace cada plaza lo decide la estrategia elegida con `strategy` en `POST /rota/generate`:

- **`wheels`**: ruedas por tipo de día (laborables, sábados, domingos, festivos) para las guardias y otras cuatro para los refuerzos. Ver «Estrategia de ruedas (wheels)».
- **`single-wheel`** (predeterminada): una única rueda de guardias para todos los días del año y las cuatro ruedas por tipo de día sólo para los refuerzos. Ver «Estrategia de rueda única (single-wheel)».

Ambas cubren cada día primero las guardias y después los refuerzos, y nadie hace las dos cosas el mismo día. El día de descanso se resuelve con «saltar y conservar turno» y deuda contada.

La antigua estrategia `balanced` (round-robin equilibrado por recuento de turnos, horas y puntero deslizante) está **retirada**: `POST /rota/generate` la rechaza con 400. Los cuadrantes guardados con ella se conservan y la interfaz los muestra como «Equilibrado (retirado)».

**Barajado del grupo.** Antes de asignar, `generateRotas` baraja (Fisher–Yates, `scheduling/shuffle.ts`) el orden de cada grupo, AC y AP, por separado. Como ambas estrategias recorren el grupo en el orden de la lista (los orígenes de las ruedas), sin barajar el primer médico de la lista abriría la rotación todos los años sin cuadrante previo y heredaría siempre los mismos turnos. Si el equipo ya tiene el cuadrante del año anterior del mismo tipo y comparte algún médico con el grupo actual, no se baraja: se continúa (ver «Continuidad con el año anterior»). El barajado sólo cambia el orden que ve la estrategia: las estadísticas y el grupo persistido conservan el orden recibido. `RotaService` pasa `Math.random`; sin fuente aleatoria (`random` omitido) el resultado es determinista, que es lo que usan los tests y las comparaciones de estrategias.


### 5. Validación de límites de horas (aviso)

Después de que se genera el año completo, se verifican las horas totales de cada médico:
- **AC:** cada médico debe tener >= 1.620 horas/año
- **AP:** cada médico debe tener <= 425 horas/año (máximo)

Si algún médico incumple su límite (por debajo en AC, por encima en AP), la rota **se devuelve igualmente** con un único aviso agregado en `warnings` (cuántos médicos incumplen y cuántas horas faltan o sobran en total; si además la capacidad anual no encaja con el objetivo, el aviso empieza indicando que el grupo es demasiado grande o demasiado pequeño). La desviación de cada médico es su `hours_vs_target` (negativo = faltan horas; en AP, positivo = sobran horas). El aviso sólo se devuelve al generar; no se persiste.

---

## Restricciones

| ID | Regla | Aplicación |
|----|------|------------|
| RD-1 | Grupos AC/AP separados — un médico pertenece a un solo grupo | **Dura** — `RotaService.generate` rechaza con 400 un médico en los dos grupos |
| RD-2 | Día de descanso: asignado (guardia o refuerzo) en D → no disponible en D+1 dentro del grupo; nadie hace guardia y refuerzo el mismo día | **Dura** para grupos >= 2 × pico de plazas; **blanda** para grupos más pequeños. El refuerzo AC se coloca a propósito en D−1 de su guardia |
| RD-3 | Horas: mínimo 135h/mes y 1.620h/año AC, máximo 425h/año AP por médico | **Blanda** — si no se cumple, la rota se genera con un aviso y la desviación en las estadísticas |
| RD-4 | Cobertura: 1 guardia AC, 1 guardia AP y 1 refuerzo al día; 2 refuerzos en festivo especial, precedido de otro festivo o, desde 2027, en cualquier sábado | **Dura** — `refuerzosForDay` |
| RD-5 | Guardia (AC y AP) y refuerzos: horas de festivo | **Dura** — duración tomada de `guardiaShiftDetails` (guardia) y `refuerzoShiftDetails` (refuerzo), en todos los años; el refuerzo nunca comparte horario con la guardia del día |
| RD-6 | Guardia (AC y AP) y refuerzos: horas del resto de la semana | **Dura** — duración tomada de `guardiaShiftDetails` (guardia) y `refuerzoShiftDetails` (refuerzo); desde 2027 el sábado tiene su propio horario de guardia (24h) y de refuerzo (12h), distinto del resto de la semana |
| RD-7 | Refuerzo AC sólo en D−1 de una guardia suya del mismo mes y sólo si le faltan horas | **Dura** — `planAcRefuerzos` |

---

## Verificación de Factibilidad (pre-generación)

Antes de que se ejecute el bucle principal, el algoritmo valida el grupo:

- **El grupo debe tener al menos 2 × el pico de plazas diarias del grupo** (2 en AC; 6 en AP: guardia + 2 refuerzos), para que siempre haya médicos descansados. Si no, se lanza `InfeasiblePoolError`.
- Si la capacidad anual no encaja con el objetivo del grupo (AC demasiado grande, AP demasiado pequeño), la generación **no** se bloquea: se emite un aviso (ver paso 5).

---

## Acoplamiento entre AC y AP

Los grupos son separados y cada uno lleva su propio seguimiento de descansos, pero los cuadrantes ya no son independientes: los refuerzos que reserva un AC se descuentan de los de AP. Por eso se generan juntos, en orden (AC → refuerzos AC → AP) y en una única transacción.

---

## Objetivos de Optimización (orden de prioridad)

1. **Límites de horas** — cada médico de AC debe alcanzar 1.620h y ningún médico de AP debe superar 425h
2. **Equidad de tipo de día** — cada médico obtiene aproximadamente el mismo recuento (±1) de turnos laborables, de sábado y festivos
3. **Equidad de horas** — minimizar la diferencia máximo-mínimo de horas totales entre médicos
4. **Variación de grupo** — evitar que el mismo subconjunto de médicos sea siempre asignado junto (orden barajado y ruedas)

Los objetivos 2-4 los persiguen las ruedas: cada rueda reparte su tipo de turno con ±1 mientras no haya choques de descanso. Con `single-wheel` la guardia no distingue tipo de día, así que el objetivo 2 sólo se cumple de forma aproximada en las guardias (ver su apartado). El objetivo 1 se comprueba tras la generación y, si no se cumple, produce un aviso en lugar de un error.

---

## Tipos de Día y Duraciones

La clasificación del día (festivo / sábado / laborable) es común a AC y AP y no cambia con el año. **Precedencia:** Festivo > Sábado > Laborable; un sábado que también es festivo se clasifica como `festivo`, a efectos de estadísticas y de la regla del segundo festivo consecutivo. Las **duraciones de turno** sí dependen del año: hasta 2026 son las de siempre; desde 2027 (`SHIFTS_2027_FROM_YEAR`) cambian la guardia y el refuerzo. Las calcula `scheduling/shifts.ts`: `guardiaShiftDetails(fecha, tipoDía)` para la guardia, `refuerzoShiftDetails(fecha, tipoDía)` para el refuerzo, y `usesShifts2027(fecha)` marca qué régimen aplica.

### Hasta 2026

La guardia ya era idéntica en AC y AP (`guardiaShiftDetails`); el refuerzo, de AP o de AC, tiene su propio horario (`refuerzoShiftDetails`), distinto del de la guardia del día:

#### Guardia (AC y AP)

| Condición | Tipo de Día | Duración | Turno |
|-----------|------------|---------|-------|
| Domingo, o fecha en conjunto de festivos | `festivo` | 23h | 09:00 → 08:00+1 |
| Sábado (no festivo) | `sábado` | 18h | 15:00 → 09:00+1 |
| Todos los demás días | `laborable` | 17h | 15:00 → 08:00+1 |

#### Refuerzos (de AP o de AC)

| Tipo de Día | Refuerzos | Duración | Turno |
|-------------|-----------|---------|-------|
| festivo especial de sanidad | 2 | 12h | 10:00 → 22:00 |
| festivo precedido de otro festivo | 2 | 12h | 10:00 → 22:00 |
| festivo aislado o primero de una serie | 1 | 12h | 10:00 → 22:00 |
| laborable / sábado | 1 | 7h | 15:00 → 22:00 |

El refuerzo que hace un AC tiene este mismo horario.

### Desde 2027

La guardia sigue siendo idéntica en AC y AP (`guardiaShiftDetails`), ahora con horas propias por tipo de día; el refuerzo, de AP o de AC, mantiene su propio horario (`refuerzoShiftDetails`), distinto del de la guardia:

| Condición | Guardia (AC y AP) | Refuerzos | Duración refuerzo | Turno refuerzo |
|-----------|--------------------|-----------|--------------------|-----------------|
| Sábado (festivo o no) | 24h (09:00 → 09:00+1) | 2 | 12h | 10:00 → 22:00 |
| Domingo, o festivo entre semana | 23h (09:00 → 08:00+1) | 1 (2 si festivo especial o precedido de otro festivo) | 12h | 10:00 → 22:00 |
| Viernes laborable | 18h (15:00 → 09:00+1) | 1 | 7h | 15:00 → 22:00 |
| Lunes a jueves laborable | 17h (15:00 → 08:00+1) | 1 | 7h | 15:00 → 22:00 |

El refuerzo que hace un AC tiene este mismo horario de refuerzo.

---

## Estrategia de ruedas (wheels)

Visualización interactiva para presentarla (abrir en el navegador): [`docs/visualizations/ruedas.html`](visualizations/ruedas.html), pestaña «Ruedas» (`#ruedas`); la pestaña «Rueda única» explica la estrategia predeterminada. Simula el año 2027 con 4 y 5 médicos AC y un ejemplo AP con guardia y refuerzo.

Elegida con `strategy: "wheels"` en `POST /rota/generate`. Replica cómo se hacen hoy los cuadrantes a mano. Duraciones, `doctors_per_day`, verificación de factibilidad, estadísticas y avisos son los mismos; sólo cambia quién hace cada día. La predeterminada es `single-wheel` (ver más abajo).

**Ruedas.** Guardias y refuerzos tienen cada uno su juego de ruedas; las de refuerzo arrancan desplazadas ⌊N/2⌋ respecto a las de guardia y cada día se cubren primero las guardias. En cada juego hay cuatro ruedas independientes: laborables, sábados, domingos y festivos. Un día va a la rueda de festivos si su fecha es un festivo oficial (`publicHoliday`), aunque caiga en sábado o domingo; si no, a la de domingos si es domingo, a la de sábados si es sábado y a la de laborables en otro caso.

**Orden.** Cada rueda recorre el grupo en el orden de la lista recibida (ya barajada por `generateRotas`, ver «Barajado del grupo») con su propio puntero. Sin cuadrante del año anterior los punteros arrancan **escalonados**: laborables en el índice 0, sábados en ⌊N/4⌋, domingos en ⌊2N/4⌋ y festivos en ⌊3N/4⌋, con N el tamaño del grupo (`staggeredInitialPointers`). Con cuadrante previo cada rueda arranca tras el último médico que la usó el año anterior, turnos manuales incluidos (ver «Continuidad con el año anterior»); las ruedas de refuerzo continuadas no llevan el desplazamiento ⌊N/2⌋. Si todas las ruedas arrancaran desde el primer médico, la cabeza de la lista recibiría a la vez el primer turno de todas las ruedas y el +1 de cada una coincidiría sobre los mismos médicos; escalonar los orígenes reparte esa carga (ver `docs/STRATEGY_COMPARISON.md`). Cada asignación avanza el puntero de su rueda. Si un día requiere 2 (segundo refuerzo AP en festivo consecutivo) se toman los 2 siguientes de la rueda de festivos.

**Día de descanso: saltar y conservar turno.** Un médico no está descansado si hizo guardia el día anterior (en cualquier rueda del mismo tipo de rota) o ya ha sido elegido ese mismo día. Al llenar un día se consideran primero, en orden FIFO, los médicos pendientes de esa rueda y después la rueda desde su puntero. Al médico de la rueda que no está descansado se le salta, el puntero avanza y se anota una deuda en la cola de pendientes de esa rueda. Cada salto genera una deuda, aunque el médico ya tuviera otras: la cola admite al mismo médico varias veces (FIFO de turnos debidos). Elegir a un médico desde la cola consume UNA deuda, y un médico nunca sale dos veces el mismo día aunque acumule varias.

**Descanso blando.** Si en todo el grupo no hay suficientes descansados para cubrir el día, se completa con no descansados en el orden de la rueda (pendientes primero). Esos huecos no generan deuda nueva. Esta rama es inalcanzable desde `generateRota`: el tamaño mínimo del grupo (2 × pico de cobertura) garantiza siempre suficientes descansados, y sólo existe por robustez ante llamadas directas a la estrategia. Si aun así no hay suficientes médicos distintos se lanza `InfeasiblePoolError` («No hay suficientes médicos elegibles el …»).

**Compromisos.** El reparto por rueda es exacto (±1) mientras no haya choques; los choques se compensan con la cola de pendientes, pero no se optimiza el equilibrio global de horas, por lo que pueden aparecer avisos de horas que un método por recuento evitaría.

### Resonancia semanal y su corrección

Si la cadencia semanal coincide con el tamaño del grupo, la rueda de laborables da un número exacto de vueltas por semana y el mismo médico cae siempre en el mismo día de la semana. Con **5 médicos** y semanas de 5 laborables, la rueda da una vuelta exacta cada semana: el viernes lo hace siempre el mismo médico, que además nunca está descansado el sábado. Sin corrección, con AC de 5 médicos en 2026 (festivos de la Comunidad Valenciana) un médico hace **25 viernes, 15 de ellos seguidos**, frente a 2–8 del resto.

**Corrección** (`breakWeeklyResonance`, activada por defecto en `assignWithWheels`): si el grupo tiene **exactamente 5 médicos**, el **lunes de cada semana con 5 laborables** el puntero de la rueda de laborables avanza un puesto antes de asignar, en el juego de guardia y en el de refuerzo. Al médico saltado **no se le apunta deuda**: no es un conflicto de descanso sino un giro del orden, igual que hace a mano quien prepara el cuadrante. Se aplica todo el año, desde la primera semana completa.

- En una semana completa el saltado hace el viernes, así que nadie pierde guardias: el día de cada médico va rotando semana a semana.
- No se salta en semanas con un festivo entre semana (ya descolocan la rueda por sí solas y saltar quitaría una guardia al saltado) ni en semanas partidas por el fin de año (`startsFullWorkWeek`).
- Resultado en el mismo caso: viernes 9/10/11/10/8 por médico, como mucho 2 seguidos, y guardias totales 71–74 (antes 72–74).
- Con cualquier otro tamaño de grupo el cuadrante es idéntico al de antes.
- **Múltiplos de 5 (10, 15, 20).** La rueda de laborables da la vuelta en 2, 3 o 4 semanas y a cada médico le tocan casi siempre los mismos días laborables. Medido en 2026 y 2027 (sólo guardias), la mayor diferencia entre médicos en guardias de un mismo día de la semana es de 15–18 con 10 médicos y de 11–13 con 15, frente a 5–9 con 6, 9 u 11. No se corrige: un salto semanal quitaría guardias al saltado, y los sábados, domingos, festivos y horas no se ven afectados, porque cada tipo de día tiene su rueda.


## Estrategia de rueda única (single-wheel)

Visualización interactiva: [`docs/visualizations/ruedas.html`](visualizations/ruedas.html), pestaña «Rueda única» (la que abre por defecto), con el simulador, la comparación con «Ruedas» y el caso de los grupos de 7 médicos.

Es la estrategia predeterminada: se usa con `strategy: "single-wheel"` o sin `strategy` en `POST /rota/generate` (`scheduling/strategies/single-wheel.strategy.ts`). Usa la misma mecánica que `wheels` (`assignWithWheels` con `singleGuardiaWheel: true`); sólo cambia cómo se agrupan los días para las guardias.

- **Guardias: una sola rueda para todos los días.** Laborables, sábados, domingos, festivos y festivos especiales comparten un único puntero y una única cola de deuda. La rueda recorre el grupo (barajado) en orden y, sin cuadrante previo, arranca en el índice 0; con él arranca tras el último médico de guardia del año anterior (ver «Continuidad con el año anterior»). Sin choques de descanso y sin cuadrante previo, el día *i* del año lo hace el médico *i mod N*: es lo que pasa con la guardia AC, que no tiene refuerzos en la estrategia.
- **Refuerzos: las cuatro ruedas de `wheels`.** Laborables, sábados, domingos y festivos, con los punteros escalonados (0, ⌊N/4⌋, ⌊2N/4⌋, ⌊3N/4⌋) desplazados ⌊N/2⌋, igual que en `wheels`.
- **Choques.** Si quien toca en la rueda de guardias hizo un refuerzo el día anterior, se le salta con deuda y la cobra en el siguiente turno de la rueda («saltar y conservar turno»). Lo mismo en las ruedas de refuerzo. El descanso blando y `InfeasiblePoolError` son los de `wheels`.
- **Resonancia semanal.** La corrección de 5 médicos sólo se aplica a la rueda de refuerzos de laborables, porque la rueda única de guardias no es una rueda de laborables.
- **Grupos múltiplos de 7** (`breakLapResonance`, activada por defecto). Si el tamaño del grupo es múltiplo de 7, cada vuelta de la rueda dura un número exacto de semanas y cada médico caería siempre el mismo día de la semana (con 7 médicos, uno haría los 52 domingos del año). Por eso, cada N días (N = tamaño del grupo, a partir del segundo bloque) la rueda de guardias avanza un puesto **sin apuntar deuda**. El saltado hace el último día de esa vuelta, así que nadie pierde guardias, y el día de la semana de cada médico se desplaza uno por vuelta. Con cualquier otro tamaño el cuadrante no cambia.

  | Grupo (2026 / 2027) | Sábados, sin → con | Domingos y festivos, sin → con | Horas, sin → con | Mayor diferencia en un mismo día de la semana, sin → con |
  |---|---|---|---|---|
  | AC 7 | 51 → 2 / 49 → 2 | 52 → 4 / 51 → 4 | 264 → 53 / 269 → 57 | 53 → 1 / 53 → 1 |
  | AP 14 | 22 → 4 / 20 → 6 | 20 → 6 / 20 → 6 | 126 → 27 / 107 → 32 | 27 → 6 / 26 → 6 |
  | AP 21 | 16 → 3 / 17 → 4 | 15 → 6 / 16 → 4 | 94 → 49 / 99 → 46 | 17 → 6 / 18 → 4 |

  Cada cifra es la diferencia entre el médico que más tiene y el que menos (`generateRotas`, festivos de la Comunitat Valenciana). Sábados, domingos y festivos, y días de la semana cuentan guardias; las horas incluyen también los refuerzos. En AP los saltos por los refuerzos descolocan algo la rueda, así que el giro no cae siempre en el puesto exacto, pero el efecto se mantiene. Los grupos de 13, 15 y 17 dan cifras idénticas con y sin la corrección.

  **Nota sobre las horas de 2027:** esta medición es anterior al cambio de horarios de 2027 (ver «Tipos de Día y Duraciones») y, en las filas AP (14, 21), también anterior a la corrección de la guardia AP (antes usaba por error el horario de refuerzo, 7h/12h, en vez del horario de guardia). Los recuentos de guardias (sábados, domingos y festivos, mismo día de la semana) no dependen de la duración y siguen siendo válidos en todas las filas. La columna de horas de AC 7 sigue siendo válida en 2026 (la guardia AC no cambió), pero no en 2027 (nuevo régimen de horarios). Las columnas de horas de AP 14 y AP 21, tanto en 2026 como en 2027, están desactualizadas: se midieron con la guardia AP en 7h/12h en vez de con su horario de guardia correcto.

**Compromisos.** El número de guardias por médico queda igualado (±1, salvo deuda pendiente a final de año), pero no el de guardias de cada tipo de día: un médico puede acumular más sábados o festivos que otro, y por tanto más horas, porque la guardia de festivo dura más. La resonancia de los grupos múltiplos de 7 se corrige con el giro de cada vuelta (ver arriba).


---

## Comparación de equidad: Rueda única frente a Ruedas

Medición de noviembre de 2026, con la corrección de los múltiplos de 7 incluida. Son 34 casos: AC de 4 a 7 médicos (con AP de 17) y AP de 9 a 21 médicos (con AC de 4), en 2026 y 2027. Se generan con `generateRotas` (refuerzos AC incluidos) y festivos nacionales y de la Comunitat Valenciana. Cada cifra es la diferencia entre el médico que más tiene y el que menos: cuanto más baja, más justo. Barajar el grupo no cambia estas diferencias, porque los médicos de la prueba son intercambiables.

- Sábados, domingos y festivos, número de guardias y día de la semana cuentan **guardias**.
- Las horas, totales o de fin de semana y festivo, incluyen también los **refuerzos**.

**Nota sobre las horas de 2027:** esta medición es anterior al cambio de horarios de 2027 (ver «Tipos de Día y Duraciones») y, en las filas AP (17, 21), también anterior a la corrección de la guardia AP (antes usaba por error el horario de refuerzo, 7h/12h, en vez del horario de guardia). Los recuentos de guardias (sábados, domingos y festivos, número de guardias, mismo día de la semana) no dependen de la duración y siguen siendo válidos en todas las filas. Las cifras de horas (totales y de fin de semana/festivo) de AC 4 siguen siendo válidas en 2026 (la guardia AC no cambió), pero no en 2027 (nuevo régimen de horarios). Las de AP 17 y AP 21 están desactualizadas en las dos columnas: se midieron con la guardia AP en 7h/12h en vez de con su horario de guardia correcto.

### Quién gana en cada medida (de 34 casos)

| Medida | Ruedas | Rueda única | Empate |
|---|---|---|---|
| Domingos y festivos | **34** | 0 | 0 |
| Sábados | **30** | 0 | 4 |
| Horas en fin de semana y festivo | **32** | 2 | 0 |
| Horas totales | **21** | 13 | 0 |
| Número de guardias | 0 | **22** | 12 |
| Mismo día de la semana | 7 | **19** | 8 |
| Meses de un AC por debajo de 135 h | 2 | **4** | 28 |

### Por tipo de grupo

- **Fines de semana y festivos:** «Ruedas» es más justo en todos los casos. Reparte sábados, domingos y festivos con una diferencia de 0 a 2; con la rueda única es de 1 a 8, porque esos días caen donde caigan en la rueda.
- **Horas totales:** en AP gana «Ruedas» en 21 de 26 casos. En AC gana la rueda única en los 8 casos, porque los refuerzos que completan las 135 h al mes compensan a quien hace menos festivos.
- **Número de guardias:** la rueda única siempre lo iguala (0–1). «Ruedas» deja diferencias de 1 a 4.
- **Día de la semana:** la rueda única reparte mejor qué día laborable le toca a cada uno. Con «Ruedas» y grupos de 10 o 15 médicos queda la resonancia suave de los múltiplos de 5 (diferencias de 11 a 16).
- **Grupos de 7, 14 y 21:** con la corrección, la rueda única ya no tiene casos rotos. AP 14 y AP 21 quedan en la media del método.
- **AC de 6 o 7 médicos:** no son representativos. El grupo es demasiado grande y los dos métodos generan avisos y muchos meses por debajo de 135 h.

### Grupos reales (2026 / 2027)

| Grupo | Método | Horas | Horas finde y festivo | Sábados | Domingos y festivos | Guardias |
|---|---|---|---|---|---|---|
| AC 4 | Ruedas | 34 / 33 | **48 / 54** | 1 / 1 | **1 / 1** | 2 / 1 |
| | Rueda única | **7 / 21** | 92 / 103 | 1 / 1 | 3 / 5 | **1 / 1** |
| AP 17 | Ruedas | 50 / **31** | **43 / 31** | **0 / 1** | **1 / 1** | 2 / 1 |
| | Rueda única | **39** / 41 | 48 / 60 | 5 / 4 | 4 / 5 | **1 / 1** |
| AP 21 | Ruedas | **26 / 31** | **19 / 31** | **1 / 1** | **1 / 1** | 2 / 2 |
| | Rueda única | 49 / 46 | 84 / 74 | 3 / 4 | 6 / 4 | 2 / 1 |

### Conclusión

Si justo significa repartir bien los turnos que más pesan (sábados, domingos y festivos), «Ruedas» es más equitativo, y en AP también en horas. La rueda única gana en igualar el número de guardias, en las horas totales de AC y en no repetir el mismo día laborable. Con la corrección de los múltiplos de 7 ya no tiene casos rotos, pero cada médico puede acabar con 3 a 8 domingos o festivos más que otro. Elegir el método predeterminado es una decisión de producto: depende de qué disparidad pesa más para los médicos.

---

## Compromisos y Limitaciones

- **Reglas fijas, no optimización.** Las ruedas reproducen el método manual: cada día sale quien toca en la rueda, salvo los saltos por descanso. No se busca el mejor reparto global; para garantizar la optimalidad (p. ej. de horas o de festivos por médico) haría falta un solver de programación por restricciones (p. ej., Google OR-Tools).
- **Sin retroceso.** Una vez asignado un día, nunca se revisita. Esto mantiene el algoritmo en O(D × N) donde D = días del año y N = tamaño del grupo, pero significa que no puede recuperarse de elecciones subóptimas tempranas.
- **Suavidad del día de descanso.** Para grupos pequeños, aplicar días de descanso estrictos puede crear callejones sin salida. El algoritmo degrada graciosamente permitiendo médicos sin descanso cuando es necesario, en lugar de fallar.
- **Límites blandos.** El algoritmo no rechaza calendarios que no cumplen los límites: con grupos AC muy grandes no hay suficientes horas para distribuir, y con grupos AP muy pequeños las horas exceden el máximo por médico; en ambos casos el cuadrante se entrega con un aviso y la desviación por médico.

---

## Estructuras de Datos

| Estructura | Tipo | Propósito |
|-----------|------|---------|
| `lastAssigned` | `Map<médico, fecha>` | Última fecha asignada por médico — filtrado de día de descanso |
| `Wheel.pointer` | `int` | Posición de cada rueda en el grupo; avanza con cada asignación o salto |
| `Wheel.pending` | `médico[]` (FIFO, admite repetidos) | Turnos debidos a médicos saltados por el día de descanso |
| `wheelsByRole` | `{ guardia, refuerzo } → Record<rueda, Wheel>` | Juego de ruedas de cada papel; con `single-wheel`, las cuatro claves de guardia apuntan a la misma rueda |

Todas las estructuras se crean al inicio de cada generación. Lo único que cruza de un año a otro es lo que se lee del cuadrante persistido (ver más abajo); las deudas (`Wheel.pending`) y la fase de la corrección de resonancia no se trasladan.

### Continuidad con el año anterior

Al generar el año Y de un equipo, si existe el cuadrante de Y-1 del mismo tipo (AC o AP) y comparte algún médico con el grupo actual, Y lo continúa en lugar de barajar. Es automático: no hay parámetro en la API ni aviso. Se lee de lo persistido (`rotas.pool` y `rota_assignments`, ediciones manuales incluidas) y `scheduling/continuation.ts` lo traduce:

- **Orden del grupo** (`continuePoolOrder`): los que siguen conservan el orden de Y-1, los que se fueron desaparecen y los nuevos van al final, en el orden de la petición. Un grupo continuado no usa aleatoriedad.
- **Punteros** (`buildWheelContinuation`): cada rueda (la rueda única de guardias en `single-wheel`, las cuatro de guardias en `wheels` y las cuatro de refuerzos de AP) arranca en el médico siguiente al último que hizo un turno de esa rueda en Y-1. Si ese médico se fue, arranca en el siguiente superviviente que le seguía; si era el último de los que siguen, en el primer médico nuevo (o en el 0 si no hay nuevos). Los días de Y-1 se reclasifican para saber a qué rueda pertenecía cada turno.
- **Descanso del 1 de enero**: quien trabajó el 31 de diciembre de Y-1 descansa el 1 de enero de Y en su grupo, también para los refuerzos AC de `planAcRefuerzos`.
- **No se arrastran** la deuda pendiente ni la fase de la corrección de resonancia de múltiplos de 7.

Sin cuadrante de Y-1, o sin médicos en común, se baraja con `Math.random` y los punteros arrancan escalonados.
