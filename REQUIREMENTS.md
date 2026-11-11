# Aplicación de Asignación de Guardias Médicas

## 1. Visión y alcance

Aplicación para la planificación automática de guardias en hospitales españoles. Cubre dos rotas anuales: **AC** (Atención Continuada) y **AP** (Atención Primaria). El sistema asegura el cumplimiento de los límites horarios anuales, equidad entre profesionales y la cobertura mínima de personal por día.

Esta es una Prueba de Concepto (PoC): sin autenticación, sin multi-ciudad, sin deshacer, sin diseño móvil ni CI/CD productivo.

## 2. Modelo de dominio: AC y AP

AC y AP son dos rotas independientes en cuanto a generación, pero conectadas en cuanto al servicio que prestan:

- Los profesionales de **AC** trabajan exclusivamente como guardias y son los responsables principales de la cobertura del día.
- Los profesionales de **AP** **refuerzan cada día** la cobertura de AC. Aunque la rota se genera por separado, el rol funcional en el calendario es el de **refuerzo del día**.

Un médico pertenece a un único grupo (AC o AP) y nunca participa en la rota del otro.

## 3. Reglas de cobertura diaria

- **Cada día** debe haber, como mínimo, **1 AC de guardia** y **1 AP de guardia**, más el refuerzo del día (de AP, salvo el que cubre un AC).
- **En festivos** (incluye domingos clasificados como festivos por la regulación) el refuerzo hace un turno de **12 h** (10:00 a 22:00); la guardia, igual para AC y AP, tiene su propio horario de festivo (ver sección 4).
- **Cuando hay dos festivos consecutivos**, el **segundo** lleva **2 refuerzos** (12 h cada uno). El primer festivo de la serie y los festivos aislados llevan 1 refuerzo.
- **Desde 2027**, **todos los sábados** llevan **2 refuerzos** de 12 h (también si el sábado es festivo). Nunca hay más de 2.

## 4. Duraciones de turno por rota y tipo de día

Hasta 2026, la guardia ya era la misma para AC y AP; el refuerzo (lo haga un AP o, si le faltan horas en el mes, un AC) tiene su propio horario, que nunca coincide con el de la guardia del día:

| Rol               | Laborable             | Sábado                | Festivo / Domingo     |
|-------------------|-----------------------|-----------------------|-----------------------|
| Guardia (AC y AP) | 17 h (15:00–08:00+1)  | 18 h (15:00–09:00+1)  | 23 h (09:00–08:00+1)  |
| Refuerzo          | 7 h (15:00–22:00)     | 7 h (15:00–22:00)     | 12 h (10:00–22:00); × 2 en el segundo festivo consecutivo |

Desde 2027 la guardia sigue siendo la misma para AC y AP, pero con horas distintas por tipo de día; los refuerzos (los haga un AP o un AC) mantienen su propio horario. Un sábado festivo mantiene el horario de sábado; un festivo de lunes a viernes tiene el de domingo.

| Rol      | Lunes a jueves        | Viernes               | Sábado                                  | Domingo / Festivo     |
|----------|-----------------------|-----------------------|-----------------------------------------|-----------------------|
| Guardia  | 17 h (15:00–08:00+1)  | 18 h (15:00–09:00+1)  | 24 h (09:00–09:00+1)                    | 23 h (09:00–08:00+1)  |
| Refuerzo | 7 h (15:00–22:00)     | 7 h (15:00–22:00)     | 12 h (10:00–22:00); siempre 2 refuerzos | 12 h (10:00–22:00); × 2 en el segundo festivo consecutivo |

Sin migración de datos: un cuadrante generado antes de un cambio de horario conserva las horas con las que se generó hasta que se regenera.

## 5. Restricciones (validadas por el algoritmo)

1. **Límite anual por médico** (no bloqueante):
   - AC: mínimo 1.620 h/año (135 h/mes × 12).
   - AP: máximo 425 h/año (tope, no mínimo).
   - Si algún profesional incumple su límite (AC por debajo, AP por encima), el cuadrante se genera igualmente con un aviso y las estadísticas muestran la desviación de cada médico.
2. **Día de descanso**: un médico de guardia el día D queda libre el D+1 dentro de la misma rota. Restricción suavizable en pools muy pequeños.
3. **AC y AP se generan de forma independiente**: un mismo médico no puede aparecer en ambas rotas.
4. **Cobertura primary base = 1**: el algoritmo nunca asigna más de un AC primary por día ni más de un AP primary por día, salvo cuando el día lleva 2 refuerzos (festivos especiales de sanidad, segundo de dos festivos consecutivos y, desde 2027, todos los sábados; nunca más de 2, ver sección 3). Con pools AC que exceden la capacidad de cobertura anual, o pools AP demasiado pequeños para respetar el máximo de 425 h, el cuadrante se genera igualmente y se devuelve un aviso.

## 6. Equidad

Las asignaciones se distribuyen equitativamente entre los profesionales del pool por tipo de día (laborable, sábado, festivo) y por horas totales acumuladas vs. objetivo personal anual. El puntero round-robin deslizante evita bloqueos sistemáticos en pools pequeños. Para detalles, ver `docs/ALGORITHM.md`.

## 7. Datos de entrada

```json
{
  "year": 2026,
  "rota_type": "AC",
  "pool": [
    {
      "id": "doc-001",
      "name": "Dra. García",
      "department": "Medicina General"
    },
    {
      "id": "doc-002",
      "name": "Dr. López",
      "department": "Pediatría"
    }
  ]
}
```

## 8. Datos de salida

Se devuelve un calendario anual con:

- Asignaciones primary por día (1 médico para AC, 1 ó 2 médicos para AP).
- Estadísticas por médico: horas totales (desglosadas en horas de guardia y horas de refuerzo), horas vs. objetivo, número de turnos por tipo de día, horas mensuales.
- Avisos (`warnings`): al generar, un aviso agregado si algún médico incumple su límite anual (cuántos médicos y cuántas horas faltan o sobran en total). En las consultas posteriores la lista va vacía; la desviación sigue en las estadísticas.

## 9. Persistencia y consultas

- La rota se almacena para acceso rápido posterior.
- Se puede consultar la rota completa, filtrar por médico o reemplazar un profesional concreto en un día concreto.
- El reemplazo respeta todas las restricciones (descanso, conflicto mismo día).

## 10. Servicio de festivos

El sistema consulta una API externa de festivos españoles (por defecto `https://date.nager.at/api/v3`) según la ciudad del hospital (variable de entorno `CITY`, por defecto `Alicante`, cuyos festivos regionales son los de la Comunitat Valenciana). Los festivos se cachean en la base de datos.

## 11. Componentes del producto

### 11.1 Servicio de asignación (backend)

- **Stack**: NestJS 11, TypeScript, class-validator, TypeORM, MySQL.
- **Endpoints principales**:
  - `POST /api/v1/rota/generate` — genera la rota anual.
  - `GET /api/v1/rota/:year/:rotaType` — consulta una rota (soporta filtro por `doctor_id`).
  - `GET /api/v1/rota/:year` — devuelve las rotas (AC y AP) del año.
  - `PATCH /api/v1/rota/:year/:rotaType/replace` — reemplaza un profesional.
  - `GET /api/v1/holidays/:year` — festivos del año para la ciudad configurada.

### 11.2 Interfaz de calendario (frontend)

- **Stack**: Angular 19+, signals, Angular CDK (drag-and-drop).
- **Layout** en dos columnas:
  - **Izquierda**: pool de médicos (cards arrastrables) con botones para añadir profesionales y generar/regenerar la rota. Se prepopula desde un archivo de configuración estática.
  - **Derecha**: vista mensual del calendario con las asignaciones del año. Cada celda diaria muestra:
    - **AC**: 1 médico de guardia.
    - **AP**: 1 ó 2 médicos, cada uno prefijado con `R:` para reflejar su rol funcional de refuerzo del día.
  - **Panel oculto** con estadísticas por médico (horas, turnos, horas vs. objetivo).
- **Botón Generar**:
  - Si no hay rota para el año: "Generate Rota".
  - Si ya existe: "Re-generate Rota" con diálogo de confirmación.

## 12. Exclusiones del alcance PoC

- Sin autenticación ni gestión de usuarios.
- Sin soporte multi-ciudad simultáneo (una ciudad por entorno).
- Sin deshacer ni historial de versiones de rota.
- Sin diseño responsivo móvil.
- Sin pipeline CI/CD ni despliegue productivo.

## 13. Otros requisitos

- Versiones modernas de frameworks y lenguajes.
- Ejecución local (`npm run start:dev` backend, `ng serve` frontend) y entorno completo dockerizado (`docker compose up --build`).
- ATDD: los criterios de aceptación tienen tests automatizados antes de la implementación.
