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

  it('exporta AC y AP con cabeceras HTTP, tres hojas y 365 filas', async () => {
    await generar();

    const response = await exportar();

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toBe(XLSX_CONTENT_TYPE);
    expect(response.headers['content-disposition']).toBe(
      `attachment; filename="cuadrante-guardias-${YEAR_2026}.xlsx"`,
    );

    const workbook = await cargarLibro(response.rawPayload);
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual([
      'Cuadrante',
      'Estadísticas AC',
      'Estadísticas AP',
    ]);

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

  it('2027: un sábado muestra la guardia de 24h y el refuerzo de 12h (10:00–22:00)', async () => {
    const generacion = await app.inject({
      method: 'POST',
      url: '/api/v1/rota/generate',
      payload: { year: 2027, ac_pool: AC_POOL_4, ap_pool: AP_POOL_17 },
    });
    expect(generacion.statusCode).toBe(201);

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

  it('las hojas de estadísticas tienen una fila por médico y las columnas esperadas', async () => {
    await generar();

    const workbook = await cargarLibro((await exportar()).rawPayload);
    const estadisticas = workbook.getWorksheet('Estadísticas AC')!;

    expect((estadisticas.getRow(1).values as unknown[]).slice(1)).toEqual([
      'Médico',
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
    ]);
    expect(estadisticas.getRow(1).font?.bold).toBe(true);
    expect(estadisticas.rowCount).toBe(AC_POOL_4.length + 1);
    expect(workbook.getWorksheet('Estadísticas AP')!.rowCount).toBe(AP_POOL_17.length + 1);

    const nombres = [2, 3, 4, 5].map((numero) => estadisticas.getRow(numero).getCell(1).value);
    expect(nombres.sort()).toEqual(AC_POOL_4.map((doctor) => doctor.name).sort());

    let totalHoras = 0;
    for (let numero = 2; numero <= estadisticas.rowCount; numero += 1) {
      const fila = estadisticas.getRow(numero);
      const mensuales = Array.from({ length: 12 }, (_, indice) =>
        Number(fila.getCell(9 + indice).value),
      );
      const sumaMensual = mensuales.reduce((acumulado, valor) => acumulado + valor, 0);
      expect(sumaMensual).toBe(fila.getCell(2).value);
      totalHoras += sumaMensual;
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
});
