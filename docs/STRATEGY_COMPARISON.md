# Comparación de métodos de asignación: Equilibrado vs Ruedas

> **Nota (noviembre de 2026):** la estrategia `balanced` («Equilibrado») está retirada. Este informe se conserva como registro histórico de la decisión. `scripts/compare-strategies.ts` compara ahora `wheels` con `single-wheel`; las cifras de abajo son de la ejecución original.

Informe de disparidades entre la estrategia actual (`balanced`, «Equilibrado») y la estrategia de ruedas (`wheels`, «Ruedas»). Las Ruedas replican el método manual del hospital: varias ruedas round-robin estrictas para laborables, sábados, domingos y festivos.

La estrategia `wheels` de producción arranca las ruedas **escalonadas**. La rueda de laborables empieza en el médico 0, la de sábados en ⌊N/4⌋, la de domingos en ⌊2N/4⌋ y la de festivos en ⌊3N/4⌋. Se adoptó tras este mismo análisis: el hallazgo 4 lo compara con la variante «todas desde el primero».

- **Datos**: `docs/strategy-comparison/results.json`
- **Reproducir**: `cd backend && npm run compare:strategies`
- **Escenarios**: 16 combinaciones (años 2026 y 2027 × AC con 3, 4, 5 y 6 médicos × AP con 5, 8, 12 y 17 médicos). AC 4 y AP 17 son los grupos semilla de `frontend/src/assets/doctors.json`; los grupos menores son los primeros N médicos del semilla y los mayores se completan con médicos sintéticos.
- **Festivos**: lista fija de festivos nacionales y de la Comunidad Valenciana (14 por año). El entorno de análisis no tenía acceso a `date.nager.at`, así que no hay festivos locales de Alicante ni traslados de festivos en domingo. Con los festivos reales las cifras cambiarán ligeramente, pero las tendencias no.

## Resumen

| Pregunta | Equilibrado | Ruedas (escalonadas) |
|---|---|---|
| ¿Reparte las **horas** por igual? | **Sí.** Rango entre médicos de 1 a 23 h al año | Casi igual. Rango de 5 a 58 h; igual al Equilibrado en 8 de 16 escenarios |
| ¿Reparte **domingos y festivos** por igual? | **No.** Hasta 6 domingos o 5 festivos de diferencia entre médicos | **Sí.** ±1 en festivos y ±2 como máximo en domingos |
| ¿Respeta el **día de descanso**? | Sí (0 violaciones) | Sí (0 violaciones), gracias a la regla de saltos |
| ¿Cumple los **límites** 1.620 h AC / 425 h AP? | Igual en ambas: depende del tamaño del grupo, no del método | Igual |
| ¿Es **predecible** para los médicos? | No: depende del historial acumulado | Sí: cada uno sabe su posición en cada rueda |
| ¿Concentra la carga en el tiempo? | Poco | Más: más huecos de sólo 2 días en 13 de 16 escenarios |

**Conclusión:** el Equilibrado iguala las **horas**; las Ruedas igualan el **número de guardias de cada tipo de día**. Con el arranque escalonado, las Ruedas pierden poca equidad horaria. A cambio, eliminan la disparidad de festivos, que es la más visible para los médicos. Su coste es una carga algo más irregular en el tiempo. La elección final es una decisión de política del servicio, no técnica.

## Hallazgos

### 1. Horas totales: el Equilibrado sigue siendo el más uniforme, pero la distancia es pequeña

| Escenario | Equilibrado (rango) | Ruedas escalonadas (rango) |
|---|---|---|
| AC 4 · 2026 | 18 h (1.655–1.673) | 29 h (1.650–1.679) |
| AC 4 · 2027 | 18 h | 18 h |
| AP 17 · 2026 | 7 h (167–174) | 7 h |
| AP 17 · 2027 | 12 h (167–179) | 19 h (167–186) |
| AC 6 · 2026 (peor caso) | 18 h | 58 h (1.071–1.129) |

En 8 de los 16 escenarios ambos métodos reparten las horas exactamente igual de bien. Donde difieren, la causa es que cada rueda reparte con ±1 guardia y las guardias valen horas distintas: en AC, 17 h un laborable, 18 h un sábado y 23 h un festivo o domingo. El Equilibrado compensa esa diferencia día a día porque usa las horas totales como segundo criterio; las Ruedas no compensan.

### 2. Domingos y festivos: las Ruedas son claramente más justas

El Equilibrado cuenta los domingos y los festivos como una sola categoría. Por eso iguala la suma de ambos, pero no cada uno por separado:

| Escenario | Domingos por médico, rango (Equilibrado → Ruedas) | Festivos por médico, rango (Equilibrado → Ruedas) |
|---|---|---|
| AC 3 · 2027 | 6 → 2 | 5 → 1 |
| AC 4 · 2027 | 5 → 1 | 4 → 1 |
| AP 5 · 2026 | 5 → 1 | 5 → 1 |
| AP 12 · 2027 | 4 → 1 | 4 → 1 |

Con el Equilibrado, un médico puede acabar el año con 6 festivos y otro con 1, aunque ambos sumen las mismas horas. Socialmente, Navidad, Reyes y Semana Santa no equivalen a un domingo cualquiera. Con las Ruedas, el rango de festivos es ≤ 1 en los 16 escenarios.

En laborables y sábados ambos métodos empatan (±1).

### 3. El método manual literal choca con el día de descanso

Se simuló la «rueda pura», es decir, cuatro ruedas estrictas sin ninguna regla de saltos:

| Escenario | Todas desde el primero: descanso incumplido / sáb + dom mismo médico | Escalonadas: descanso incumplido / sáb + dom mismo médico |
|---|---|---|
| AC 4 · 2026 | 58 / 38 | 20 / 4 |
| AP 17 · 2026 | 43 / 35 | 6 / 0 |
| AC 3 · 2026 | 76 / 37 | 46 / 5 |
| AP 17 · 2027 | 26 / 17 | 9 / 0 |

Si las ruedas de sábados y domingos empiezan por el mismo médico, avanzan a la vez y coinciden casi todos los fines de semana. **Escalonarlas elimina casi todos esos choques por sí solo**, y la regla «saltar y conservar turno» resuelve el resto. Con ambas cosas, la estrategia `wheels` queda en **0 violaciones de descanso y 0 fines de semana completos** en todos los escenarios, igual que el Equilibrado. Para ello se desvía del orden puro entre el 3 % y el 24 % de los días; los grupos grandes se desvían menos (AP 17: 12–17 días al año).

### 4. El arranque escalonado frente a «todas desde el primero»

| Escenario | Equilibrado | Ruedas escalonadas | Ruedas todas desde el primero |
|---|---|---|---|
| AC 4 · 2026 | 18 h | 29 h | 63 h |
| AC 4 · 2027 | 18 h | 18 h | 58 h |
| AC 6 · 2026 | 18 h | 58 h | 104 h |
| AP 12 · 2026 | 12 h | 12 h | 38 h |
| AP 17 · 2026 | 7 h | 7 h | 21 h |
| AP 17 · 2027 | 12 h | 19 h | 38 h |

Si todas las ruedas empiezan por el primer médico, la cabeza de la lista recibe a la vez el «+1» de cada rueda y el final de la lista se queda sin ninguno. Escalonar el arranque reparte esos «+1» entre médicos distintos. Por eso `wheels` arranca escalonada.

### 5. Las Ruedas concentran más la carga en el tiempo

Al seguir un orden fijo, las Ruedas no reaccionan a la carga reciente de cada médico:

- **Huecos de sólo 2 días entre guardias**: más en 13 de 16 escenarios, a menudo el doble o más. AP 17 · 2027 pasa de 1 a 18 y AC 5 · 2026 de 30 a 67. Con grupos AC de 3 o 4 médicos hay incluso menos que con el Equilibrado.
- **Mes más cargado de un médico**: algo mayor. AP 12 · 2027 sube de 33 h a 45 h y AC 5 · 2026 de 132 h a 154 h.
- **Hueco medio**: igual en ambos métodos. Lo que cambia es la regularidad.

### 6. Límites de horas: el método es indiferente

Las horas totales del año dependen sólo del calendario y del número de guardias por día, que es igual en ambos métodos. Por eso los avisos coinciden exactamente:

- **AC**: con 5 o 6 médicos todos quedan por debajo de 1.620 h. Con 3 o 4 todos lo cumplen.
- **AP**: con 5 médicos todos superan las 425 h. Con 8 o más ninguno las supera.

> Estas cifras de AP se midieron cuando la guardia AP usaba por error el horario de
> refuerzo (7h/12h) en vez del horario de guardia, y antes de los horarios de 2027.
> Con la guardia AP corregida, también los grupos de 17 y 21 médicos AP superan las
> 425h/año (ver `docs/ALGORITHM.md`).

Cambiar de método no arregla un grupo mal dimensionado.

### 7. Resonancia con 5 médicos: corregida con un salto semanal

Si el tamaño del grupo encaja con la cadencia semanal, puede darse un choque estructural. Con 5 médicos y semanas de 5 laborables, la rueda de laborables da una vuelta exacta cada semana y el mismo médico hace todos los viernes: en AC 5 · 2026, 25 viernes, 15 de ellos seguidos.

La estrategia `wheels` lo corrige como se hace a mano: con exactamente 5 médicos, el lunes de cada semana de 5 laborables salta un puesto de la rueda de laborables sin apuntar deuda. Los viernes quedan en 8–11 por médico, con como mucho 2 seguidos, sin quitar guardias a nadie. El resto de tamaños de grupo no cambia. Detalle en `docs/ALGORITHM.md`.

> Las cifras de las tablas anteriores (`results.json`) se generaron antes de esta corrección y de los festivos especiales de sanidad; sólo cambian para los escenarios de 5 médicos.

## Decisiones pendientes para el servicio

1. **¿Qué disparidad importa más a los médicos?** ¿Las horas totales, a favor del Equilibrado, o el número de domingos y festivos, a favor de las Ruedas?
2. **¿Cómo corrige hoy los choques la persona que hace los cuadrantes?** Conviene confirmar si coincide con «saltar y conservar turno», y si arranca las ruedas escalonadas.
3. **Validar con festivos reales de Alicante**, incluidos los locales, cuando haya acceso a la API.

## Limitaciones del análisis

- Festivos aproximados (ver arriba).
- Un único orden del grupo: el de `doctors.json`. Ambos métodos dependen del orden; las Ruedas mucho más.
- Las mediciones arrancan cada año desde cero (sin cuadrante previo): la continuación entre años se añadió después y no está medida. Tampoco se modelan las bajas, vacaciones o cambios manuales posteriores.
