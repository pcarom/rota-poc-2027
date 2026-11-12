import { Injectable } from '@nestjs/common';
import { Workbook, Worksheet } from 'exceljs';

import {
  compareIsoDates,
  fromIsoDate,
  getIsoMonth,
  getIsoWeekday,
  getWeekNumber,
  getYearWeeks,
} from '../common/date.utils';
import { isSanidadSpecialHoliday } from '../common/sanidad-holidays';
import { DayAssignment, DayType, RotaResponse, RotaType, ShiftRole } from './rota.types';

const NOMBRES_DIA = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];

const NOMBRES_TIPO_DIA: Record<DayType, string> = {
  weekday: 'Laborable',
  saturday: 'Sábado',
  holiday: 'Festivo',
};

const NOMBRES_MES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

const NOMBRES_PAPEL: Record<ShiftRole, string> = {
  guardia: 'Guardia',
  refuerzo: 'Refuerzo',
};

const CABECERA_CUADRANTE = [
  { header: 'Fecha', width: 12 },
  { header: 'Día', width: 11 },
  { header: 'Tipo de día', width: 13 },
  { header: 'Médico AC', width: 24 },
  { header: 'Horario AC', width: 15 },
  { header: 'Horas AC', width: 10 },
  { header: 'Médico AP', width: 24 },
  { header: 'Horario AP', width: 15 },
  { header: 'Horas AP', width: 10 },
  { header: 'Refuerzos', width: 44 },
  { header: 'Horario refuerzo', width: 17 },
  { header: 'Horas refuerzo', width: 15 },
];

const CABECERA_ESTADISTICAS = [
  { header: 'Médico', width: 26 },
  { header: 'Horas guardia', width: 13 },
  { header: 'Horas refuerzo', width: 14 },
  { header: 'Horas totales', width: 15 },
  { header: 'Horas objetivo', width: 16 },
  { header: 'Desviación', width: 13 },
  { header: 'Laborables', width: 13 },
  { header: 'Sábados', width: 11 },
  { header: 'Festivos', width: 11 },
  { header: 'Refuerzos', width: 12 },
  ...NOMBRES_MES.map((mes) => ({ header: mes, width: 8 })),
];

const CABECERA_HORARIOS = [
  { header: 'Papel', width: 12 },
  { header: 'Horario', width: 16 },
  { header: 'Horas', width: 9 },
  { header: 'Turnos AC', width: 11 },
  { header: 'Horas AC', width: 10 },
  { header: 'Turnos AP', width: 11 },
  { header: 'Horas AP', width: 10 },
];

const CABECERA_DIAS = [
  { header: 'Fecha', width: 12 },
  { header: 'Día', width: 11 },
  { header: 'Tipo de día', width: 13 },
  { header: 'Semana', width: 9 },
  { header: 'Mes', width: 8 },
  { header: 'Médico', width: 24 },
  { header: 'Papel', width: 12 },
  { header: 'Horario', width: 16 },
  { header: 'Horas guardia', width: 13 },
  { header: 'Horas refuerzo', width: 14 },
  { header: 'Horas', width: 9 },
];

const CABECERA_SEMANAS = [
  { header: 'Médico', width: 24 },
  { header: 'Semana', width: 9 },
  { header: 'Desde', width: 12 },
  { header: 'Hasta', width: 12 },
  { header: 'Guardias', width: 10 },
  { header: 'Horas guardia', width: 13 },
  { header: 'Refuerzos', width: 11 },
  { header: 'Horas refuerzo', width: 14 },
  { header: 'Horas totales', width: 13 },
];

const CABECERA_MESES = [
  { header: 'Médico', width: 24 },
  { header: 'Mes', width: 8 },
  { header: 'Guardias', width: 10 },
  { header: 'Horas guardia', width: 13 },
  { header: 'Refuerzos', width: 11 },
  { header: 'Horas refuerzo', width: 14 },
  { header: 'Horas totales', width: 13 },
];

const ANCHOS_TOTALES = [26, 10, 13, 11, 14, 14, 10, 12];

// Una asignación (guardia o refuerzo) de un médico en un día concreto, con las horas
// reales guardadas (no recalculadas) y la semana/mes del día. Base común de las hojas
// «Días», «Semanas», «Meses» y «Totales»: se recorre el cuadrante una sola vez por grupo.
interface FilaDetalle {
  date: string;
  dayType: DayType;
  week: number;
  month: number;
  doctorId: string;
  doctorName: string;
  role: ShiftRole;
  shiftStart: string;
  shiftEnd: string;
  durationHours: number;
}

interface AgregadoHoras {
  guardias: number;
  horasGuardia: number;
  refuerzos: number;
  horasRefuerzo: number;
}

function agregadoVacio(): AgregadoHoras {
  return { guardias: 0, horasGuardia: 0, refuerzos: 0, horasRefuerzo: 0 };
}

function acumular(agregado: AgregadoHoras, fila: FilaDetalle): void {
  if (fila.role === 'refuerzo') {
    agregado.refuerzos += 1;
    agregado.horasRefuerzo += fila.durationHours;
  } else {
    agregado.guardias += 1;
    agregado.horasGuardia += fila.durationHours;
  }
}

// Agrupa las filas de detalle (guardias y refuerzos) por la clave indicada, sumando
// turnos y horas de cada grupo. Común a «Totales», «Semanas» y «Meses».
function agruparPorClave(detalle: FilaDetalle[], clave: (fila: FilaDetalle) => string): Map<string, AgregadoHoras> {
  const agregados = new Map<string, AgregadoHoras>();
  for (const fila of detalle) {
    const llave = clave(fila);
    let agregado = agregados.get(llave);
    if (!agregado) {
      agregado = agregadoVacio();
      agregados.set(llave, agregado);
    }
    acumular(agregado, fila);
  }
  return agregados;
}

@Injectable()
export class RotaExportService {
  async buildWorkbook(rotas: RotaResponse[]): Promise<Buffer> {
    const workbook = new Workbook();
    const porTipo = new Map(rotas.map((rota) => [rota.rota_type, rota]));
    const ac = porTipo.get(RotaType.AC);
    const ap = porTipo.get(RotaType.AP);
    // Un bloque por grupo presente (AC y/o AP), en ese orden; «Totales», «Estadísticas»,
    // «Días», «Semanas» y «Meses» recorren esta misma lista.
    const bloques = [ac, ap]
      .filter((rota): rota is RotaResponse => !!rota)
      .map((rota) => ({ tipo: rota.rota_type, rota, detalle: this.construirFilasDetalle(rota) }));
    const bloqueAc = bloques.find((bloque) => bloque.tipo === RotaType.AC);
    const bloqueAp = bloques.find((bloque) => bloque.tipo === RotaType.AP);

    this.addScheduleSheet(workbook, ac, ap);
    this.addHorariosSheet(workbook, bloqueAc?.detalle, bloqueAp?.detalle);
    this.addTotalsSheet(workbook, bloqueAc, bloqueAp);
    for (const bloque of bloques) {
      this.addStatsSheet(workbook, bloque.rota);
    }
    for (const bloque of bloques) {
      this.addDaysSheet(workbook, bloque.tipo, bloque.detalle);
    }
    for (const bloque of bloques) {
      this.addWeeksSheet(workbook, bloque.tipo, bloque.rota, bloque.detalle);
    }
    for (const bloque of bloques) {
      this.addMonthsSheet(workbook, bloque.tipo, bloque.rota, bloque.detalle);
    }

    return Buffer.from(await workbook.xlsx.writeBuffer());
  }

  // Aplana el cuadrante en una fila por asignación (médico x día), con la semana y el mes
  // ya calculados; ordenada por fecha y, dentro del día, guardia antes que refuerzo.
  private construirFilasDetalle(rota: RotaResponse): FilaDetalle[] {
    const filas: FilaDetalle[] = [];
    for (const dia of rota.schedule) {
      // La semana y el mes son del día, no del médico: se calculan una vez aunque haya
      // varias asignaciones (guardia + refuerzos) ese día.
      const week = getWeekNumber(dia.date);
      const month = getIsoMonth(dia.date);
      for (const doctor of dia.doctors) {
        filas.push({
          date: dia.date,
          dayType: dia.day_type,
          week,
          month,
          doctorId: doctor.doctor_id,
          doctorName: doctor.doctor_name,
          role: doctor.role,
          shiftStart: doctor.shift_start,
          shiftEnd: doctor.shift_end,
          durationHours: doctor.duration_hours,
        });
      }
    }
    return filas.sort(
      (left, right) =>
        compareIsoDates(left.date, right.date) ||
        (left.role === right.role ? 0 : left.role === 'guardia' ? -1 : 1),
    );
  }

  private addScheduleSheet(workbook: Workbook, ac?: RotaResponse, ap?: RotaResponse): void {
    const sheet = this.createSheet(workbook, 'Cuadrante', CABECERA_CUADRANTE);
    sheet.getColumn(1).numFmt = 'dd/mm/yyyy';

    const diasAc = new Map((ac?.schedule ?? []).map((day) => [day.date, day]));
    const diasAp = new Map((ap?.schedule ?? []).map((day) => [day.date, day]));
    const fechas = [...new Set([...diasAc.keys(), ...diasAp.keys()])].sort();

    for (const fecha of fechas) {
      const diaAc = diasAc.get(fecha);
      const diaAp = diasAp.get(fecha);
      const tipoDia = (diaAc ?? diaAp)!.day_type;

      sheet.addRow([
        fromIsoDate(fecha),
        ...this.columnasDia(fecha, tipoDia),
        ...this.guardiaColumns(diaAc),
        ...this.guardiaColumns(diaAp),
        ...this.refuerzoColumns(diaAc, diaAp),
      ]);
    }
  }

  // Día de la semana y tipo de día (festivo especial o el que traiga el cuadrante), común
  // a «Cuadrante» y «Días».
  private columnasDia(fecha: string, tipoDia: DayType): [string, string] {
    return [
      NOMBRES_DIA[getIsoWeekday(fecha)],
      isSanidadSpecialHoliday(fecha) ? 'Festivo especial' : NOMBRES_TIPO_DIA[tipoDia],
    ];
  }

  private guardiaColumns(day?: DayAssignment): Array<string | number | null> {
    const guardias = day?.doctors.filter((doctor) => doctor.role !== 'refuerzo') ?? [];
    if (!day || guardias.length === 0) {
      return [null, null, null];
    }
    return [
      guardias.map((doctor) => doctor.doctor_name).join(', '),
      `${day.shift_start}–${day.shift_end}`,
      day.duration_hours,
    ];
  }

  // Refuerzos del día: los de AP y, marcados con «(AC)», los que cubre un médico AC. El
  // horario y las horas son los de cada refuerzo (no recalculados); si coincidieran en
  // horario y horas (lo habitual) se muestra un único valor, si no se unen con «, ».
  private refuerzoColumns(ac?: DayAssignment, ap?: DayAssignment): Array<string | number | null> {
    const refuerzosAp = (ap?.doctors ?? []).filter((doctor) => doctor.role === 'refuerzo');
    const refuerzosAc = (ac?.doctors ?? []).filter((doctor) => doctor.role === 'refuerzo');
    const nombres = [
      ...refuerzosAp.map((doctor) => doctor.doctor_name),
      ...refuerzosAc.map((doctor) => `${doctor.doctor_name} (AC)`),
    ];
    if (nombres.length === 0) {
      return [null, null, null];
    }
    const refuerzos = [...refuerzosAp, ...refuerzosAc];
    const horarios = this.unirValores(refuerzos.map((doctor) => `${doctor.shift_start}–${doctor.shift_end}`));
    const horas = this.unirValores(refuerzos.map((doctor) => doctor.duration_hours));
    return [nombres.join(', '), horarios, horas];
  }

  // Si todos los valores coinciden (lo habitual) devuelve uno solo; si no, los une con «, ».
  private unirValores<T extends string | number>(valores: T[]): T | string {
    const unicos = [...new Set(valores)];
    return unicos.length === 1 ? unicos[0] : unicos.join(', ');
  }

  private addHorariosSheet(workbook: Workbook, ac?: FilaDetalle[], ap?: FilaDetalle[]): void {
    const sheet = this.createSheet(workbook, 'Horarios', CABECERA_HORARIOS);

    interface Grupo {
      role: ShiftRole;
      shiftStart: string;
      shiftEnd: string;
      durationHours: number;
      turnosAc: number;
      turnosAp: number;
    }
    const grupos = new Map<string, Grupo>();

    const acumularGrupo = (filas: FilaDetalle[] | undefined, campo: 'turnosAc' | 'turnosAp') => {
      for (const fila of filas ?? []) {
        const clave = `${fila.role}|${fila.shiftStart}|${fila.shiftEnd}`;
        let grupo = grupos.get(clave);
        if (!grupo) {
          grupo = {
            role: fila.role,
            shiftStart: fila.shiftStart,
            shiftEnd: fila.shiftEnd,
            durationHours: fila.durationHours,
            turnosAc: 0,
            turnosAp: 0,
          };
          grupos.set(clave, grupo);
        }
        grupo[campo] += 1;
      }
    };
    acumularGrupo(ac, 'turnosAc');
    acumularGrupo(ap, 'turnosAp');

    const filas = [...grupos.values()].sort((left, right) => {
      if (left.role !== right.role) {
        return left.role === 'guardia' ? -1 : 1;
      }
      return left.durationHours - right.durationHours;
    });

    for (const grupo of filas) {
      sheet.addRow([
        NOMBRES_PAPEL[grupo.role],
        `${grupo.shiftStart}–${grupo.shiftEnd}`,
        grupo.durationHours,
        grupo.turnosAc,
        grupo.turnosAc * grupo.durationHours,
        grupo.turnosAp,
        grupo.turnosAp * grupo.durationHours,
      ]);
    }

    sheet.addRow([]);
    sheet.addRow(['Las horas de cada turno cuentan el día en que empieza.']);
  }

  private addTotalsSheet(
    workbook: Workbook,
    ac?: { tipo: RotaType; rota: RotaResponse; detalle: FilaDetalle[] },
    ap?: { tipo: RotaType; rota: RotaResponse; detalle: FilaDetalle[] },
  ): void {
    const sheet = workbook.addWorksheet('Totales');
    sheet.columns = ANCHOS_TOTALES.map((width) => ({ width }));

    const bloques = [ac, ap].filter((bloque): bloque is NonNullable<typeof bloque> => !!bloque);
    const sumaGrupos = agregadoVacio();

    for (const bloque of bloques) {
      sheet.addRow([bloque.tipo]).font = { bold: true };
      sheet.addRow([
        'Médico',
        'Guardias',
        'Horas guardia',
        'Refuerzos',
        'Horas refuerzo',
        'Horas totales',
        'Objetivo',
        'Desviación',
      ]).font = { bold: true };

      const porDoctor = agruparPorClave(bloque.detalle, (fila) => fila.doctorId);

      const totalBloque = agregadoVacio();
      let totalObjetivo = 0;
      let totalDesviacion = 0;
      for (const doctor of bloque.rota.stats.doctors) {
        const agregado = porDoctor.get(doctor.doctor_id) ?? agregadoVacio();
        const horasTotales = agregado.horasGuardia + agregado.horasRefuerzo;
        sheet.addRow([
          doctor.doctor_name,
          agregado.guardias,
          agregado.horasGuardia,
          agregado.refuerzos,
          agregado.horasRefuerzo,
          horasTotales,
          doctor.target_hours,
          doctor.hours_vs_target,
        ]);
        totalBloque.guardias += agregado.guardias;
        totalBloque.horasGuardia += agregado.horasGuardia;
        totalBloque.refuerzos += agregado.refuerzos;
        totalBloque.horasRefuerzo += agregado.horasRefuerzo;
        totalObjetivo += doctor.target_hours;
        totalDesviacion += doctor.hours_vs_target;
      }

      sheet.addRow([
        `Total ${bloque.tipo}`,
        totalBloque.guardias,
        totalBloque.horasGuardia,
        totalBloque.refuerzos,
        totalBloque.horasRefuerzo,
        totalBloque.horasGuardia + totalBloque.horasRefuerzo,
        totalObjetivo,
        totalDesviacion,
      ]).font = { bold: true };

      sumaGrupos.guardias += totalBloque.guardias;
      sumaGrupos.horasGuardia += totalBloque.horasGuardia;
      sumaGrupos.refuerzos += totalBloque.refuerzos;
      sumaGrupos.horasRefuerzo += totalBloque.horasRefuerzo;
    }

    if (ac && ap) {
      sheet.addRow([]);
      sheet.addRow([
        'Total AC + AP',
        sumaGrupos.guardias,
        sumaGrupos.horasGuardia,
        sumaGrupos.refuerzos,
        sumaGrupos.horasRefuerzo,
        sumaGrupos.horasGuardia + sumaGrupos.horasRefuerzo,
        null,
        null,
      ]);
    }
  }

  private addStatsSheet(workbook: Workbook, rota: RotaResponse): void {
    const sheet = this.createSheet(workbook, `Estadísticas ${rota.rota_type}`, CABECERA_ESTADISTICAS);

    for (const doctor of rota.stats.doctors) {
      sheet.addRow([
        doctor.doctor_name,
        doctor.guardia_hours,
        doctor.refuerzo_hours,
        doctor.total_hours,
        doctor.target_hours,
        doctor.hours_vs_target,
        doctor.shifts_weekday,
        doctor.shifts_saturday,
        doctor.shifts_sunday_holiday,
        doctor.shifts_refuerzo,
        ...NOMBRES_MES.map((_, indice) => doctor.monthly_hours[String(indice + 1)] ?? 0),
      ]);
    }
  }

  private addDaysSheet(workbook: Workbook, tipo: RotaType, detalle: FilaDetalle[]): void {
    const sheet = this.createSheet(workbook, `Días ${tipo}`, CABECERA_DIAS);
    sheet.getColumn(1).numFmt = 'dd/mm/yyyy';

    for (const fila of detalle) {
      sheet.addRow([
        fromIsoDate(fila.date),
        ...this.columnasDia(fila.date, fila.dayType),
        fila.week,
        NOMBRES_MES[fila.month - 1],
        fila.doctorName,
        NOMBRES_PAPEL[fila.role],
        `${fila.shiftStart}–${fila.shiftEnd}`,
        fila.role === 'guardia' ? fila.durationHours : 0,
        fila.role === 'refuerzo' ? fila.durationHours : 0,
        fila.durationHours,
      ]);
    }
  }

  private addWeeksSheet(workbook: Workbook, tipo: RotaType, rota: RotaResponse, detalle: FilaDetalle[]): void {
    const sheet = this.createSheet(workbook, `Semanas ${tipo}`, CABECERA_SEMANAS);
    sheet.getColumn(3).numFmt = 'dd/mm/yyyy';
    sheet.getColumn(4).numFmt = 'dd/mm/yyyy';

    const porDoctorYSemana = agruparPorClave(detalle, (fila) => `${fila.doctorId}|${fila.week}`);

    const semanas = getYearWeeks(rota.year);
    for (const doctor of rota.stats.doctors) {
      for (const semana of semanas) {
        const agregado = porDoctorYSemana.get(`${doctor.doctor_id}|${semana.week}`) ?? agregadoVacio();
        sheet.addRow([
          doctor.doctor_name,
          semana.week,
          fromIsoDate(semana.from),
          fromIsoDate(semana.to),
          agregado.guardias,
          agregado.horasGuardia,
          agregado.refuerzos,
          agregado.horasRefuerzo,
          agregado.horasGuardia + agregado.horasRefuerzo,
        ]);
      }
    }
  }

  private addMonthsSheet(workbook: Workbook, tipo: RotaType, rota: RotaResponse, detalle: FilaDetalle[]): void {
    const sheet = this.createSheet(workbook, `Meses ${tipo}`, CABECERA_MESES);

    const porDoctorYMes = agruparPorClave(detalle, (fila) => `${fila.doctorId}|${fila.month}`);

    for (const doctor of rota.stats.doctors) {
      for (let mes = 1; mes <= 12; mes += 1) {
        const agregado = porDoctorYMes.get(`${doctor.doctor_id}|${mes}`) ?? agregadoVacio();
        sheet.addRow([
          doctor.doctor_name,
          NOMBRES_MES[mes - 1],
          agregado.guardias,
          agregado.horasGuardia,
          agregado.refuerzos,
          agregado.horasRefuerzo,
          agregado.horasGuardia + agregado.horasRefuerzo,
        ]);
      }
    }
  }

  private createSheet(
    workbook: Workbook,
    name: string,
    columns: Array<{ header: string; width: number }>,
  ): Worksheet {
    const sheet = workbook.addWorksheet(name);
    sheet.columns = columns;
    sheet.getRow(1).font = { bold: true };
    sheet.views = [{ state: 'frozen', ySplit: 1 }];
    sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
    return sheet;
  }
}
