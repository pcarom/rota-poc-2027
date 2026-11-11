# Formato del fichero de médicos («Cargar lista»)

El botón **«Cargar lista»** del panel de médicos sustituye la lista del equipo
seleccionado por la de un fichero **JSON** o **CSV**. El fichero se lee en el
navegador (`frontend/src/app/core/parsers/doctor-file.parser.ts`); si no es
válido no se envía nada y se muestra el motivo. Si es válido, se pide
confirmación antes de sustituir la lista.

Ejemplos listos para usar en esta carpeta:

| Fichero | Contenido |
|---------|-----------|
| [`equipo-ejemplo.csv`](./equipo-ejemplo.csv) | 21 médicos (4 AC, 17 AP), CSV con `;` y codificación UTF-8 con BOM, como lo guarda Excel en español. Sin `id`. |
| [`equipo-ejemplo.json`](./equipo-ejemplo.json) | Los mismos médicos en JSON, con `id` propios. |
| [`doctors-21-ap.json`](./doctors-21-ap.json) | 25 médicos (4 AC, 21 AP) en el formato de `assets/doctors.json`. |

## Campos

| Campo | Obligatorio | Nombres admitidos (JSON: clave; CSV: columna) | Notas |
|-------|-------------|-----------------------------------------------|-------|
| Nombre | Sí | `nombre`, `name`, `medico` | Máximo 200 caracteres. |
| Grupo | Sí | `grupo`, `rota_type`, `tipo`, `rota` | `AC` o `AP`, sin distinguir mayúsculas. |
| Departamento | No | `departamento`, `department`, `servicio`, `especialidad` | Vacío si falta. |
| Identificador | No | `id`, `identificador` | Máximo 50 caracteres; no se puede repetir. Si falta, se genera `doc-001`, `doc-002`… sin chocar con los ids del fichero. |

Los nombres de clave o columna no distinguen mayúsculas ni tildes (`Médico`,
`NOMBRE` y `nombre` valen igual). Los valores se recortan de espacios. Las
claves o columnas desconocidas se ignoran.

## JSON

Se reconoce por la extensión `.json` o porque el contenido empieza por `[` o
`{`. Puede ser una lista de médicos (la forma de
`frontend/src/assets/doctors.json`) o un objeto con la lista en `doctors`:

```json
[
  { "id": "doc-001", "name": "Dra. Carmen Ruiz", "department": "Medicina Intensiva", "rota_type": "AC" },
  { "nombre": "Dr. Pablo Herrero", "departamento": "Urgencias", "grupo": "ap" }
]
```

```json
{ "doctors": [ { "name": "Dra. Elena Vidal", "rota_type": "AP" } ] }
```

## CSV

Cualquier otro fichero (`.csv`, `.txt`) se lee como CSV:

- La **primera línea es la cabecera** y debe tener las columnas de nombre y grupo.
- El **separador** se detecta en la cabecera: `;`, `,` o tabulador.
- Los campos pueden ir entre comillas dobles para incluir el separador
  (`"Ruiz; jefa de servicio"`); `""` dentro de comillas es una comilla.
- Se aceptan finales de línea `\n` y `\r\n`, el BOM de UTF-8 y líneas vacías.
- Codificación: **UTF-8**. Desde Excel, guardar como «CSV UTF-8 (delimitado por comas)».

```csv
Nombre;Departamento;Grupo
Dra. Carmen Ruiz Navarro;Medicina Intensiva;AC
Dr. Pablo Herrero Díaz;Urgencias;AP
```

Excel (`.xlsx`) no se admite directamente: hay que guardarlo antes como CSV.

## Errores

Los errores indican dónde está el problema: «Línea N» en CSV (contando la
cabecera como línea 1) y «Médico N» en JSON.

| Situación | Mensaje |
|-----------|---------|
| JSON mal formado | El fichero no es un JSON válido. |
| JSON sin lista de médicos | El fichero JSON debe contener una lista de médicos. |
| CSV sin columna de nombre / grupo | Falta la columna «nombre» / «grupo» en la cabecera del fichero. |
| Sin ningún médico | El fichero no contiene ningún médico. |
| Médico sin nombre | Línea 3: falta el nombre. |
| Grupo incorrecto | Línea 3: el grupo debe ser AC o AP (se ha leído «XX»). |
| Id repetido | Línea 5: el identificador «doc-001» está repetido. |
| Nombre o id demasiado largo | Línea 3: el nombre no puede superar los 200 caracteres. |

En la interfaz cada mensaje va precedido de «No se ha podido leer «fichero»: ».

## Después de cargar

- La lista se guarda en el equipo (`PUT /api/v1/teams/:id/doctors`) y es la que
  se usa al generar.
- Los cuadrantes ya generados conservan los médicos con los que se generaron
  hasta que se regeneren.
- El ejemplo usa 4 AC y 17 AP, el mismo tamaño que la lista inicial. Desde que la
  guardia AP usa el horario de guardia (igual que AC) en vez del de refuerzo, ese
  tamaño de grupo AP genera con el aviso de «grupo demasiado pequeño para AP»
  (hacen falta al menos 23 médicos en 2026, 26 desde 2027); lo mismo ocurre con
  los 21 AP de `doctors-21-ap.json`.
