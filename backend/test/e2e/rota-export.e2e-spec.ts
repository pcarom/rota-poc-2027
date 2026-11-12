import { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Workbook, Worksheet } from 'exceljs';

import {
  AC_POOL_4,
  AP_POOL_17,
  HOLIDAY_API_RESPONSE,
  YEAR_2026,
} from '../helpers/fixtures';
import { createTestApp } from '../helpers/test-app';

const XLSX_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const CABECERA_CUADRANTE = [
  'Fecha',
  'Día',
  'Tipo de día',
  'Médico AC',
  'Horario AC',
  'Horas AC',
  'Médico AP',
  'Horario AP',
  'Horas AP',
  'Refuerzos',
  'Horario refuerzo',
  'Horas refuerzo',
];

const CABECERA_ESTADISTICAS = [
  'Médico',
  'Horas guardia',
  'Horas refuerzo',
  'Horas totales',
  'Horas objetivo',
  'Desviación',
  'Laborables',
  'Sábados',
  'Festivos',
  'Refuerzos',
  'Ene',
  'Feb',
  'Mar',
  'Abr',
  'May',
  'Jun',
  'Jul',
  'Ago',
  'Sep',
  'Oct',
  'Nov',
  'Dic',
];

const CABECERA_HORARIOS = ['Papel', 'Horario', 'Horas', 'Turnos AC', 'Horas AC', 'Turnos AP', 'Horas AP'];

const CABECERA_DIAS = [
  'Fecha',
  'Día',
  'Tipo de día',
  'Semana',
  'Mes',
  'Médico',
  'Papel',
  'Horario',
  'Horas guardia',
  'Horas refuerzo',
  'Horas',
];

const CABECERA_SEMANAS = [
  'Médico',
  'Semana',
  'Desde',
  'Hasta',
  'Guardias',
  'Horas guardia',
  'Refuerzos',
  'Horas refuerzo',
  'Horas totales',
];

const CABECERA_MESES = ['Médico', 'Mes', 'Guardias', 'Horas guardia', 'Refuerzos', 'Horas refuerzo', 'Horas totales'];

const CABECERA_TOTALES_BLOQUE = [
  'Médico',
  'Guardias',
  'Horas guardia',
  'Refuerzos',
  'Horas refuerzo',
  'Horas totales',
  'Objetivo',
  'Desviación',
];

const ORDEN_HOJAS = [
  'Cuadrante',
  'Horarios',
  'Totales',
  'Estadísticas AC',
  'Estadísticas AP',
  'Días AC',
  'Días AP',
  'Semanas AC',
  'Semanas AP',
  'Meses AC',
  'Meses AP',
];

describe('Exportación del cuadrante a Excel', () => {
  let app: NestFastifyApplication;
  let fetchSpy: jest.SpiedFunction<typeof fetch>;

  beforeEach(async () => {
    process.env.DB_TYPE = 'sqljs';
    fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => HOLIDAY_API_RESPONSE,
      text: async () => JSON.stringify(HOLIDAY_API_RESPONSE),
    } as Response);
    app = await createTestApp();
  });

  afterEach(async () => {
    fetchSpy.mockRestore();
    if (app) {
      await app.close();
    }
  });

  async function generar() {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/rota/generate',
      payload: { year: YEAR_2026, ac_pool: AC_POOL_4, ap_pool: AP_POOL_17 },
    });
    expect(response.statusCode).toBe(201);
    return response.json();
  }

  async function exportar() {
    return app.inject({ method: 'GET', url: `/api/v1/rota/${YEAR_2026}/export` });
  }

  async function cargarLibro(rawPayload: Buffer): Promise<Workbook> {
    const workbook = new Workbook();
    await workbook.xlsx.load(rawPayload as unknown as Parameters<Workbook['xlsx']['load']>[0]);
    return workbook;
  }

  function filaDeFecha(sheet: Worksheet, fecha: string) {
    const objetivo = new Date(`${fecha}T00:00:00.000Z`).getTime();
    for (let numero = 2; numero <= sheet.rowCount; numero += 1) {
      const valor = sheet.getRow(numero).getCell(1).value;
      if (valor instanceof Date && valor.getTime() === objetivo) {
        return sheet.getRow(numero);
      }
    }
    throw new Error(`No se ha encontrado la fecha ${fecha} en la hoja`);
  }

  // Lee una hoja de cabecera única (fila 1 = nombres de columna) como objetos {columna: valor}.
  function filasObjeto(sheet: Worksheet): Record<string, unknown>[] {
    const cabecera = (sheet.getRow(1).values as unknown[]).slice(1).map((valor) => String(valor));
    const filas: Record<string, unknown>[] = [];
    for (let numero = 2; numero <= sheet.rowCount; numero += 1) {
      const valores = (sheet.getRow(numero).values as unknown[]).slice(1);
      if (valores.every((valor) => valor === null || valor === undefined)) {
        continue;
      }
      const fila: Record<string, unknown> = {};
      cabecera.forEach((nombre, indice) => {
        fila[nombre] = valores[indice];
      });
      filas.push(fila);
    }
    return filas;
  }

  // Lee un bloque (AC o AP) de la hoja «Totales»: fila de título, cabecera, una fila por
  // médico y la fila «Total X».
  function bloqueTotales(sheet: Worksheet, tipo: 'AC' | 'AP') {
    let inicio = -1;
    for (let numero = 1; numero <= sheet.rowCount; numero += 1) {
      if (sheet.getRow(numero).getCell(1).value === tipo) {
        inicio = numero;
        break;
      }
    }
    if (inicio === -1) {
      throw new Error(`No se ha encontrado el bloque ${tipo} en «Totales»`);
    }

    const cabecera = (sheet.getRow(inicio + 1).values as unknown[]).slice(1).map((valor) => String(valor));
    const medicos: Record<string, unknown>[] = [];
    let numero = inicio + 2;
    while (sheet.getRow(numero).getCell(1).value !== `Total ${tipo}`) {
      const valores = (sheet.getRow(numero).values as unknown[]).slice(1);
      const fila: Record<string, unknown> = {};
      cabecera.forEach((nombre, indice) => {
        fila[nombre] = valores[indice];
      });
      medicos.push(fila);
      numero += 1;
    }
    const totalValores = (sheet.getRow(numero).values as unknown[]).slice(1);
    const total: Record<string, unknown> = {};
    cabecera.forEach((nombre, indice) => {
      total[nombre] = totalValores[indice];
    });
    return { medicos, total, filaTotal: sheet.getRow(numero) };
  }

  it('devuelve 404 en español cuando no hay ningún cuadrante', async () => {
    const response = await exportar();

    expect(response.statusCode).toBe(404);
    expect(response.json().message).toBe(
      `No se ha encontrado ningún cuadrante para el año ${YEAR_2026}`,
    );
  });

  it('no depende de la API externa de festivos', async () => {
    await generar();
    fetchSpy.mockClear();
    fetchSpy.mockRejectedValue(new Error('sin red'));

    const response = await exportar();

    expect(response.statusCode).toBe(200);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('exporta AC y AP con cabeceras HTTP y las once hojas en orden', async () => {
    await generar();

    const response = await exportar();

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toBe(XLSX_CONTENT_TYPE);
    expect(response.headers['content-disposition']).toBe(
      `attachment; filename="cuadrante-guardias-${YEAR_2026}.xlsx"`,
    );

    const workbook = await cargarLibro(response.rawPayload);
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual(ORDEN_HOJAS);

    const cuadrante = workbook.getWorksheet('Cuadrante')!;
    expect((cuadrante.getRow(1).values as unknown[]).slice(1)).toEqual(CABECERA_CUADRANTE);
    expect(cuadrante.getRow(1).font?.bold).toBe(true);
    expect(cuadrante.views[0]).toMatchObject({ state: 'frozen', ySplit: 1 });
    expect(cuadrante.rowCount).toBe(366);
  });

  it('la primera fila es el 1 de enero: festivo especial, 23 h de guardia en AC y AP, 12 h de refuerzo y dos refuerzos; un laborable lleva uno', async () => {
    await generar();

    const workbook = await cargarLibro((await exportar()).rawPayload);
    const cuadrante = workbook.getWorksheet('Cuadrante')!;
    const fila = cuadrante.getRow(2);

    const fecha = fila.getCell(1).value;
    expect(fecha).toBeInstanceOf(Date);
    expect((fecha as Date).toISOString()).toBe('2026-01-01T00:00:00.000Z');
    expect(fila.getCell(1).numFmt).toBe('dd/mm/yyyy');
    expect(fila.getCell(2).value).toBe('jueves');
    expect(fila.getCell(3).value).toBe('Festivo especial');
    expect(fila.getCell(5).value).toBe('09:00–08:00+1');
    expect(fila.getCell(6).value).toBe(23);
    expect(String(fila.getCell(7).value).split(', ')).toHaveLength(1);
    // La guardia AP ya no comparte horario con el refuerzo: coincide con la AC.
    expect(fila.getCell(8).value).toBe('09:00–08:00+1');
    expect(fila.getCell(9).value).toBe(23);
    expect(String(fila.getCell(10).value).split(', ')).toHaveLength(2);
    expect(fila.getCell(11).value).toBe('10:00–22:00');
    expect(fila.getCell(12).value).toBe(12);

    // Domingo 16-08, tras el festivo del sábado 15-08: también dos refuerzos.
    const segundoFestivo = String(filaDeFecha(cuadrante, '2026-08-16').getCell(10).value);
    expect(segundoFestivo.split(', ')).toHaveLength(2);
    expect(segundoFestivo).not.toContain('R:');

    const laborable = filaDeFecha(cuadrante, '2026-01-07');
    expect(String(laborable.getCell(10).value).split(', ')).toHaveLength(1);
    expect(laborable.getCell(11).value).toBe('15:00–22:00');
    expect(laborable.getCell(12).value).toBe(7);
  });

  it('marca con «(AC)» los refuerzos que hace un médico AC', async () => {
    const [ac] = await generar();
    const dia = ac.schedule.find((day: { doctors: { role: string }[] }) =>
      day.doctors.some((doctor) => doctor.role === 'refuerzo'),
    );
    const medico = dia.doctors.find((doctor: { role: string }) => doctor.role === 'refuerzo');

    const workbook = await cargarLibro((await exportar()).rawPayload);
    const fila = filaDeFecha(workbook.getWorksheet('Cuadrante')!, dia.date);

    expect(String(fila.getCell(10).value)).toContain(`${medico.doctor_name} (AC)`);
    expect(String(fila.getCell(4).value)).not.toContain(medico.doctor_name);
  });

  it('traduce el tipo de día y el día de la semana', async () => {
    await generar();

    const workbook = await cargarLibro((await exportar()).rawPayload);
    const cuadrante = workbook.getWorksheet('Cuadrante')!;

    const sabado = filaDeFecha(cuadrante, '2026-01-03');
    expect(sabado.getCell(2).value).toBe('sábado');
    expect(sabado.getCell(3).value).toBe('Sábado');
    expect(sabado.getCell(6).value).toBe(18);

    const laborable = filaDeFecha(cuadrante, '2026-01-07');
    expect(laborable.getCell(2).value).toBe('miércoles');
    expect(laborable.getCell(3).value).toBe('Laborable');
    expect(laborable.getCell(5).value).toBe('15:00–08:00+1');
    expect(laborable.getCell(6).value).toBe(17);
  });

  it('2027: un sábado muestra la guardia de 24h y el refuerzo de 12h (10:00–22:00), también en los campos nuevos de la API', async () => {
    const generacion = await app.inject({
      method: 'POST',
      url: '/api/v1/rota/generate',
      payload: { year: 2027, ac_pool: AC_POOL_4, ap_pool: AP_POOL_17 },
    });
    expect(generacion.statusCode).toBe(201);
    const [ac2027, ap2027] = generacion.json();

    // Todos los médicos de schedule[].doctors traen sus horas e inicio/fin propios.
    for (const dia of [...ac2027.schedule, ...ap2027.schedule]) {
      for (const doctor of dia.doctors) {
        expect(typeof doctor.duration_hours).toBe('number');
        expect(doctor.shift_start).toMatch(/^\d{2}:\d{2}$/);
        expect(doctor.shift_end).toMatch(/^\d{2}:\d{2}(\+1)?$/);
      }
    }

    // El refuerzo del sábado siempre lo cubre (al menos uno) el propio grupo AP; la
    // guardia AC del mismo día es el otro dato fijo que exige el plan.
    const sabadoAc = ac2027.schedule.find((dia: { date: string }) => dia.date === '2027-01-09');
    const guardiaApi = sabadoAc.doctors.find((doctor: { role: string }) => doctor.role === 'guardia');
    expect(guardiaApi).toMatchObject({ duration_hours: 24, shift_start: '09:00', shift_end: '09:00+1' });

    const sabadoAp = ap2027.schedule.find((dia: { date: string }) => dia.date === '2027-01-09');
    const refuerzoApi = sabadoAp.doctors.find((doctor: { role: string }) => doctor.role === 'refuerzo');
    expect(refuerzoApi).toMatchObject({ duration_hours: 12, shift_start: '10:00', shift_end: '22:00' });

    const exportacion = await app.inject({ method: 'GET', url: '/api/v1/rota/2027/export' });
    expect(exportacion.statusCode).toBe(200);

    const workbook = await cargarLibro(exportacion.rawPayload);
    const cuadrante = workbook.getWorksheet('Cuadrante')!;

    // 2027-01-09 es sábado.
    const sabado = filaDeFecha(cuadrante, '2027-01-09');
    expect(sabado.getCell(3).value).toBe('Sábado');
    expect(sabado.getCell(5).value).toBe('09:00–09:00+1');
    expect(sabado.getCell(6).value).toBe(24);
    expect(sabado.getCell(8).value).toBe('09:00–09:00+1');
    expect(sabado.getCell(9).value).toBe(24);
    expect(String(sabado.getCell(10).value).split(', ')).toHaveLength(2);
    expect(sabado.getCell(11).value).toBe('10:00–22:00');
    expect(sabado.getCell(12).value).toBe(12);
  });

  it('las hojas de estadísticas tienen una fila por médico y las columnas esperadas, con horas de guardia y refuerzo', async () => {
    await generar();

    const workbook = await cargarLibro((await exportar()).rawPayload);
    const estadisticas = workbook.getWorksheet('Estadísticas AC')!;

    expect((estadisticas.getRow(1).values as unknown[]).slice(1)).toEqual(CABECERA_ESTADISTICAS);
    expect(estadisticas.getRow(1).font?.bold).toBe(true);
    expect(estadisticas.rowCount).toBe(AC_POOL_4.length + 1);
    expect(workbook.getWorksheet('Estadísticas AP')!.rowCount).toBe(AP_POOL_17.length + 1);

    const nombres = [2, 3, 4, 5].map((numero) => estadisticas.getRow(numero).getCell(1).value);
    expect(nombres.sort()).toEqual(AC_POOL_4.map((doctor) => doctor.name).sort());

    let totalHoras = 0;
    for (let numero = 2; numero <= estadisticas.rowCount; numero += 1) {
      const fila = estadisticas.getRow(numero);
      const horasGuardia = Number(fila.getCell(2).value);
      const horasRefuerzo = Number(fila.getCell(3).value);
      const horasTotales = Number(fila.getCell(4).value);
      expect(horasGuardia + horasRefuerzo).toBe(horasTotales);

      const mensuales = Array.from({ length: 12 }, (_, indice) => Number(fila.getCell(11 + indice).value));
      const sumaMensual = mensuales.reduce((acumulado, valor) => acumulado + valor, 0);
      expect(sumaMensual).toBe(horasTotales);
      totalHoras += horasTotales;
    }
    expect(totalHoras).toBeGreaterThan(0);
  });

  it('refleja una sustitución hecha con PATCH en el fichero exportado', async () => {
    const [generado] = await generar();
    const dia = generado.schedule[0];
    const antiguo = dia.doctors[0].doctor_id;
    const nuevo = AC_POOL_4.find(
      (doctor) => !dia.doctors.some((ref: { doctor_id: string }) => ref.doctor_id === doctor.id),
    )!;

    const sustitucion = await app.inject({
      method: 'PATCH',
      url: '/api/v1/rota/2026/AC/replace',
      payload: { date: dia.date, old_doctor_id: antiguo, new_doctor_id: nuevo.id },
    });
    expect(sustitucion.statusCode).toBe(200);

    const workbook = await cargarLibro((await exportar()).rawPayload);
    const fila = filaDeFecha(workbook.getWorksheet('Cuadrante')!, dia.date);

    expect(fila.getCell(4).value).toBe(nuevo.name);
  });

  describe('hojas nuevas: Horarios, Totales, Días, Semanas y Meses', () => {
    async function generarYExportar() {
      const [ac, ap] = await generar();
      const workbook = await cargarLibro((await exportar()).rawPayload);
      return { ac, ap, workbook };
    }

    it('«Horarios» agrupa los turnos reales por papel y horario, con guardias antes que refuerzos y turnos ordenados por horas', async () => {
      const { ac, ap, workbook } = await generarYExportar();
      const sheet = workbook.getWorksheet('Horarios')!;

      expect((sheet.getRow(1).values as unknown[]).slice(1)).toEqual(CABECERA_HORARIOS);

      // Se excluye la fila de nota («Las horas de cada turno...», bajo la fila en blanco).
      const filas = filasObjeto(sheet).filter(
        (fila) => fila['Papel'] === 'Guardia' || fila['Papel'] === 'Refuerzo',
      );
      expect(filas.length).toBeGreaterThan(0);

      const indiceGuardia = filas.findIndex((fila) => fila['Papel'] === 'Guardia');
      expect(indiceGuardia).toBeGreaterThanOrEqual(0);
      // Todas las guardias preceden a todos los refuerzos.
      const ultimaGuardia = filas.map((fila) => fila['Papel']).lastIndexOf('Guardia');
      const primeraRefuerzo = filas.map((fila) => fila['Papel']).indexOf('Refuerzo');
      if (primeraRefuerzo !== -1) {
        expect(ultimaGuardia).toBeLessThan(primeraRefuerzo);
      }

      // Dentro de cada papel, ordenado por horas ascendente.
      const guardias = filas.filter((fila) => fila['Papel'] === 'Guardia');
      const horasGuardias = guardias.map((fila) => Number(fila['Horas']));
      expect(horasGuardias).toEqual([...horasGuardias].sort((a, b) => a - b));

      // Conciliación: Turnos x Horas = Horas AC / Horas AP, y la suma total por grupo
      // coincide con el total de horas de cada grupo.
      let sumaHorasAc = 0;
      let sumaHorasAp = 0;
      for (const fila of filas) {
        const horas = Number(fila['Horas']);
        expect(Number(fila['Turnos AC']) * horas).toBe(Number(fila['Horas AC']));
        expect(Number(fila['Turnos AP']) * horas).toBe(Number(fila['Horas AP']));
        sumaHorasAc += Number(fila['Horas AC']);
        sumaHorasAp += Number(fila['Horas AP']);
      }
      const totalAc = ac.stats.doctors.reduce((acumulado: number, doctor: { total_hours: number }) => acumulado + doctor.total_hours, 0);
      const totalAp = ap.stats.doctors.reduce((acumulado: number, doctor: { total_hours: number }) => acumulado + doctor.total_hours, 0);
      expect(sumaHorasAc).toBe(totalAc);
      expect(sumaHorasAp).toBe(totalAp);
    });

    it('«Totales» tiene un bloque por grupo con las columnas esperadas, coincide con las estadísticas y «Total AC + AP» suma ambos', async () => {
      const { ac, ap, workbook } = await generarYExportar();
      const sheet = workbook.getWorksheet('Totales')!;
      expect(sheet.autoFilter).toBeFalsy();

      for (const [tipo, rota] of [['AC', ac] as const, ['AP', ap] as const]) {
        const { medicos, total, filaTotal } = bloqueTotales(sheet, tipo);
        expect(Object.keys(medicos[0])).toEqual(CABECERA_TOTALES_BLOQUE);
        expect(medicos).toHaveLength(rota.stats.doctors.length);
        expect(filaTotal.font?.bold).toBe(true);

        let sumaGuardias = 0;
        let sumaHorasGuardia = 0;
        let sumaRefuerzos = 0;
        let sumaHorasRefuerzo = 0;
        let sumaHorasTotales = 0;
        let sumaObjetivo = 0;
        let sumaDesviacion = 0;

        for (const doctor of rota.stats.doctors) {
          const fila = medicos.find((candidata) => candidata['Médico'] === doctor.doctor_name)!;
          expect(fila).toBeDefined();
          expect(Number(fila['Horas guardia'])).toBe(doctor.guardia_hours);
          expect(Number(fila['Horas refuerzo'])).toBe(doctor.refuerzo_hours);
          expect(Number(fila['Horas totales'])).toBe(doctor.total_hours);
          expect(Number(fila['Objetivo'])).toBe(doctor.target_hours);
          expect(Number(fila['Desviación'])).toBe(doctor.hours_vs_target);

          sumaGuardias += Number(fila['Guardias']);
          sumaHorasGuardia += Number(fila['Horas guardia']);
          sumaRefuerzos += Number(fila['Refuerzos']);
          sumaHorasRefuerzo += Number(fila['Horas refuerzo']);
          sumaHorasTotales += Number(fila['Horas totales']);
          sumaObjetivo += Number(fila['Objetivo']);
          sumaDesviacion += Number(fila['Desviación']);
        }

        expect(total['Guardias']).toBe(sumaGuardias);
        expect(total['Horas guardia']).toBe(sumaHorasGuardia);
        expect(total['Refuerzos']).toBe(sumaRefuerzos);
        expect(total['Horas refuerzo']).toBe(sumaHorasRefuerzo);
        expect(total['Horas totales']).toBe(sumaHorasTotales);
        expect(total['Objetivo']).toBe(sumaObjetivo);
        expect(total['Desviación']).toBe(sumaDesviacion);
      }

      // Fila «Total AC + AP»: suma de los dos bloques, sin Objetivo ni Desviación.
      let filaGranTotal = -1;
      for (let numero = 1; numero <= sheet.rowCount; numero += 1) {
        if (sheet.getRow(numero).getCell(1).value === 'Total AC + AP') {
          filaGranTotal = numero;
          break;
        }
      }
      expect(filaGranTotal).toBeGreaterThan(-1);
      const { total: totalAc } = bloqueTotales(sheet, 'AC');
      const { total: totalAp } = bloqueTotales(sheet, 'AP');
      const granTotal = sheet.getRow(filaGranTotal);
      expect(granTotal.getCell(2).value).toBe(Number(totalAc['Guardias']) + Number(totalAp['Guardias']));
      expect(granTotal.getCell(3).value).toBe(Number(totalAc['Horas guardia']) + Number(totalAp['Horas guardia']));
      expect(granTotal.getCell(4).value).toBe(Number(totalAc['Refuerzos']) + Number(totalAp['Refuerzos']));
      expect(granTotal.getCell(5).value).toBe(Number(totalAc['Horas refuerzo']) + Number(totalAp['Horas refuerzo']));
      expect(granTotal.getCell(6).value).toBe(Number(totalAc['Horas totales']) + Number(totalAp['Horas totales']));
      expect(granTotal.getCell(7).value).toBeFalsy();
      expect(granTotal.getCell(8).value).toBeFalsy();
    });

    it('«Días AP» tiene una fila por asignación del cuadrante AP, con las columnas esperadas', async () => {
      const { ap, workbook } = await generarYExportar();
      const sheet = workbook.getWorksheet('Días AP')!;

      expect((sheet.getRow(1).values as unknown[]).slice(1)).toEqual(CABECERA_DIAS);

      const numeroAsignaciones = ap.schedule.reduce(
        (acumulado: number, dia: { doctors: unknown[] }) => acumulado + dia.doctors.length,
        0,
      );
      expect(sheet.rowCount - 1).toBe(numeroAsignaciones);
    });

    it('conciliación AC y AP: «Días X», «Semanas X» y «Meses X» suman lo mismo que las estadísticas', async () => {
      const { ac, ap, workbook } = await generarYExportar();

      for (const [tipo, rota] of [['AC', ac] as const, ['AP', ap] as const]) {
        const dias = filasObjeto(workbook.getWorksheet(`Días ${tipo}`)!);
        const semanas = filasObjeto(workbook.getWorksheet(`Semanas ${tipo}`)!);
        const meses = filasObjeto(workbook.getWorksheet(`Meses ${tipo}`)!);

        for (const doctor of rota.stats.doctors) {
          const diasDoctor = dias.filter((fila) => fila['Médico'] === doctor.doctor_name);
          const sumaDias = diasDoctor.reduce((acumulado, fila) => acumulado + Number(fila['Horas']), 0);
          const sumaDiasGuardia = diasDoctor.reduce((acumulado, fila) => acumulado + Number(fila['Horas guardia']), 0);
          const sumaDiasRefuerzo = diasDoctor.reduce((acumulado, fila) => acumulado + Number(fila['Horas refuerzo']), 0);
          expect(sumaDias).toBe(doctor.total_hours);
          expect(sumaDiasGuardia).toBe(doctor.guardia_hours);
          expect(sumaDiasRefuerzo).toBe(doctor.refuerzo_hours);

          const semanasDoctor = semanas.filter((fila) => fila['Médico'] === doctor.doctor_name);
          const sumaSemanas = semanasDoctor.reduce((acumulado, fila) => acumulado + Number(fila['Horas totales']), 0);
          expect(sumaSemanas).toBe(doctor.total_hours);

          const mesesDoctor = meses.filter((fila) => fila['Médico'] === doctor.doctor_name);
          const sumaMeses = mesesDoctor.reduce((acumulado, fila) => acumulado + Number(fila['Horas totales']), 0);
          expect(sumaMeses).toBe(doctor.total_hours);

          // Mes a mes contra `monthly_hours`.
          for (const fila of mesesDoctor) {
            const indiceMes = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'].indexOf(
              String(fila['Mes']),
            );
            expect(indiceMes).toBeGreaterThanOrEqual(0);
            const esperado = doctor.monthly_hours[String(indiceMes + 1)] ?? 0;
            expect(Number(fila['Horas totales'])).toBe(esperado);
          }
        }

        expect((workbook.getWorksheet(`Semanas ${tipo}`)!.getRow(1).values as unknown[]).slice(1)).toEqual(
          CABECERA_SEMANAS,
        );
        expect((workbook.getWorksheet(`Meses ${tipo}`)!.getRow(1).values as unknown[]).slice(1)).toEqual(
          CABECERA_MESES,
        );
      }
    });
  });

  describe('semanas de 2027 (empieza en viernes)', () => {
    it('la semana 1 va del 01/01 al 03/01 y la 2 del 04/01 al 10/01', async () => {
      const generacion = await app.inject({
        method: 'POST',
        url: '/api/v1/rota/generate',
        payload: { year: 2027, ac_pool: AC_POOL_4, ap_pool: AP_POOL_17 },
      });
      expect(generacion.statusCode).toBe(201);

      const exportacion = await app.inject({ method: 'GET', url: '/api/v1/rota/2027/export' });
      const workbook = await cargarLibro(exportacion.rawPayload);
      const semanas = workbook.getWorksheet('Semanas AC')!;

      const primerMedico = semanas.getRow(2).getCell(1).value;
      const filaSemana1 = [...Array(semanas.rowCount - 1)]
        .map((_, indice) => semanas.getRow(indice + 2))
        .find((fila) => fila.getCell(1).value === primerMedico && fila.getCell(2).value === 1)!;
      const filaSemana2 = [...Array(semanas.rowCount - 1)]
        .map((_, indice) => semanas.getRow(indice + 2))
        .find((fila) => fila.getCell(1).value === primerMedico && fila.getCell(2).value === 2)!;

      expect((filaSemana1.getCell(3).value as Date).toISOString()).toBe('2027-01-01T00:00:00.000Z');
      expect((filaSemana1.getCell(4).value as Date).toISOString()).toBe('2027-01-03T00:00:00.000Z');
      expect((filaSemana2.getCell(3).value as Date).toISOString()).toBe('2027-01-04T00:00:00.000Z');
      expect((filaSemana2.getCell(4).value as Date).toISOString()).toBe('2027-01-10T00:00:00.000Z');
    });
  });
});
