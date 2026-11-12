import {
  AC_POOL_4,
  AP_POOL_17,
  AP_POOL_5,
  AP_POOL_8,
  HOLIDAYS_2026,
  YEAR_2026,
  seededRandom,
  toHolidaySet,
} from '../helpers/fixtures';

import {
  computeDoctorsPerDay,
  generateRota,
  generateRotas,
  refuerzosForDay,
} from '../../src/scheduling/assignment.service';
import { addDays, toIsoDate } from '../../src/common/date.utils';
import { classifyDay, classifyYear } from '../../src/holidays/holidays.service';
import { PreviousYear, PreviousYearRota } from '../../src/scheduling/continuation';
import { RotaSchedule } from '../../src/scheduling/scheduling.types';

describe('Assignment domain', () => {
  const dayClassifications = classifyYear(YEAR_2026, toHolidaySet(HOLIDAYS_2026));
  const totalYearlyHours = dayClassifications.reduce((sum, day) => sum + day.durationHours, 0);

  it('computes doctors per day for AC and AP pools', () => {
    expect(computeDoctorsPerDay('AC', AC_POOL_4.length, totalYearlyHours)).toBe(1);
    expect(computeDoctorsPerDay('AC', 5, totalYearlyHours)).toBe(2);
    expect(computeDoctorsPerDay('AP', 10, totalYearlyHours)).toBe(1);
  });

  it('keeps AC and AP generation independent', () => {
    const acRota = generateRota(YEAR_2026, 'AC', AC_POOL_4, dayClassifications);
    const apRota = generateRota(YEAR_2026, 'AP', AP_POOL_8, dayClassifications);

    expect(acRota.rotaType).toBe('AC');
    expect(apRota.rotaType).toBe('AP');
    expect(acRota.schedule).toHaveLength(365);
    expect(apRota.schedule).toHaveLength(365);
  });

  it('enforces the hard minimum hours and rest-day rule', () => {
    const rota = generateRota(YEAR_2026, 'AC', AC_POOL_4, dayClassifications);

    for (const doctor of rota.stats.doctors) {
      expect(doctor.totalHours).toBeGreaterThanOrEqual(1620);
    }

    const scheduleByDate = new Map(rota.schedule.map((day) => [day.date.toISOString().slice(0, 10), day]));
    for (const day of rota.schedule) {
      const nextDate = new Date(day.date);
      nextDate.setUTCDate(nextDate.getUTCDate() + 1);
      const nextKey = nextDate.toISOString().slice(0, 10);
      const nextDay = scheduleByDate.get(nextKey);
      if (!nextDay) {
        continue;
      }

      const todayDoctors = new Set(day.doctors.map((doctor) => doctor.doctorId));
      const tomorrowDoctors = new Set(nextDay.doctors.map((doctor) => doctor.doctorId));
      const overlap = [...todayDoctors].filter((id) => tomorrowDoctors.has(id));
      expect(overlap).toHaveLength(0);
    }
  });

  it('applies AC shift durations and times per day type', () => {
    const rota = generateRota(YEAR_2026, 'AC', AC_POOL_4, dayClassifications);

    expect(
      rota.schedule.every((day) => {
        if (day.dayType === 'holiday') {
          return day.durationHours === 23 && day.shiftStart === '09:00' && day.shiftEnd === '08:00+1';
        }
        if (day.dayType === 'saturday') {
          return day.durationHours === 18 && day.shiftStart === '15:00' && day.shiftEnd === '09:00+1';
        }
        return day.durationHours === 17 && day.shiftStart === '15:00' && day.shiftEnd === '08:00+1';
      }),
    ).toBe(true);
  });
});

describe('AP rota — guardia AP y refuerzos del día', () => {
  const isoDate = (day: { date: Date }) => day.date.toISOString().slice(0, 10);
  const refuerzos = (day: { doctors: { role?: string; durationHours?: number }[] }) =>
    day.doctors.filter((doctor) => doctor.role === 'refuerzo');
  const guardias = (day: { doctors: { role?: string }[] }) =>
    day.doctors.filter((doctor) => doctor.role !== 'refuerzo');
  // Días de 2026 con dos refuerzos: los festivos especiales de sanidad y los festivos
  // cuyo día anterior también es festivo (domingo incluido).
  const DOS_REFUERZOS_2026 = [
    '2026-01-01', // especial
    '2026-01-06', // especial
    '2026-04-03', // Viernes Santo, tras Jueves Santo
    '2026-08-16', // domingo, tras el sábado festivo de la Asunción
    '2026-10-12', // lunes, tras domingo
    '2026-11-02', // lunes, tras domingo
    '2026-12-07', // lunes, tras domingo
    '2026-12-08', // martes, tercer festivo seguido
    '2026-12-24', // especial
    '2026-12-25', // especial y segundo festivo seguido: siguen siendo dos
    '2026-12-31', // especial
  ];

  const dayClassifications = classifyYear(YEAR_2026, toHolidaySet(HOLIDAYS_2026));

  // La guardia AP ya no comparte horario con el refuerzo: antes de 2027 coincide con la
  // guardia AC (17h laborable, 18h sábado, 23h festivo); el refuerzo sigue en 7h/12h
  // (comprobado en `pone dos/un refuerzo...` y en `generateRotas 2026 — la guardia AP
  // coincide con la guardia AC`).
  it('asigna la guardia AP de 17h laborable y 18h sábado, igual que la AC', () => {
    const rota = generateRota(YEAR_2026, 'AP', AP_POOL_8, dayClassifications);
    const weekdays = rota.schedule.filter((day) => day.dayType === 'weekday');
    const saturdays = rota.schedule.filter((day) => day.dayType === 'saturday');

    expect(weekdays.length).toBeGreaterThan(0);
    expect(saturdays.length).toBeGreaterThan(0);
    expect(
      weekdays.every(
        (day) => day.durationHours === 17 && day.shiftStart === '15:00' && day.shiftEnd === '08:00+1',
      ),
    ).toBe(true);
    expect(
      saturdays.every(
        (day) => day.durationHours === 18 && day.shiftStart === '15:00' && day.shiftEnd === '09:00+1',
      ),
    ).toBe(true);
  });

  it('aplica la guardia AP de 23h en todos los festivos (09:00–08:00+1), igual que la AC', () => {
    const rota = generateRota(YEAR_2026, 'AP', AP_POOL_8, dayClassifications);
    const holidayDays = rota.schedule.filter((day) => day.dayType === 'holiday');

    expect(holidayDays.length).toBeGreaterThan(0);
    for (const day of holidayDays) {
      expect(day.durationHours).toBe(23);
      expect(day.shiftStart).toBe('09:00');
      expect(day.shiftEnd).toBe('08:00+1');
    }
  });

  it('cada día tiene una guardia AP y al menos un refuerzo, con médicos distintos', () => {
    const rota = generateRota(YEAR_2026, 'AP', AP_POOL_8, dayClassifications);

    for (const day of rota.schedule) {
      expect(guardias(day)).toHaveLength(1);
      expect(refuerzos(day).length).toBeGreaterThanOrEqual(1);
      expect(new Set(day.doctors.map((doctor) => doctor.doctorId)).size).toBe(day.doctors.length);
    }
  });

  it('pone dos refuerzos sólo en los festivos especiales y en los precedidos de otro festivo', () => {
    const rota = generateRota(YEAR_2026, 'AP', AP_POOL_8, dayClassifications);
    const doubled = rota.schedule.filter((day) => refuerzos(day).length === 2);

    expect(doubled.map(isoDate)).toEqual(DOS_REFUERZOS_2026);
    expect(rota.schedule.every((day) => refuerzos(day).length <= 2)).toBe(true);
  });

  it('pone un único refuerzo en los festivos aislados y en el primero de una serie', () => {
    const rota = generateRota(YEAR_2026, 'AP', AP_POOL_8, dayClassifications);
    const byDate = new Map(rota.schedule.map((day) => [isoDate(day), day]));

    // Domingo aislado, primer festivo de un par y domingo previo a un lunes festivo.
    for (const date of ['2026-01-04', '2026-04-02', '2026-10-11', '2026-12-06']) {
      expect(byDate.get(date)?.dayType).toBe('holiday');
      expect(refuerzos(byDate.get(date)!)).toHaveLength(1);
    }
  });

  it('los festivos especiales cuentan como festivo aunque la API no los traiga', () => {
    const rota = generateRota(YEAR_2026, 'AP', AP_POOL_8, classifyYear(YEAR_2026, toHolidaySet([])));
    const byDate = new Map(rota.schedule.map((day) => [isoDate(day), day]));

    for (const date of ['2026-01-01', '2026-01-06', '2026-12-24', '2026-12-25', '2026-12-31']) {
      expect(byDate.get(date)?.dayType).toBe('holiday');
      // Guardia AP (como la AC): 23h. El refuerzo, 12h (comprobado más abajo).
      expect(byDate.get(date)?.durationHours).toBe(23);
      const refuerzosDelDia = refuerzos(byDate.get(date)!);
      expect(refuerzosDelDia).toHaveLength(2);
      for (const refuerzo of refuerzosDelDia) {
        expect(refuerzo.durationHours).toBe(12);
      }
    }
  });

  it('cuenta el día anterior al año para el segundo festivo consecutivo', () => {
    // 2021 (antes de 2027, para que la regla del sábado desde 2027 no interfiera): el 2
    // de enero (sábado) sólo es segundo festivo si se marca como festivo.
    const days2021 = classifyYear(2021, toHolidaySet([new Date('2021-01-02')]));
    const rota = generateRota(2021, 'AP', AP_POOL_8, days2021, classifyDay(new Date('2020-12-31'), new Set()));
    const byDate = new Map(rota.schedule.map((day) => [isoDate(day), day]));

    expect(refuerzos(byDate.get('2021-01-01')!)).toHaveLength(2);
    expect(refuerzos(byDate.get('2021-01-02')!)).toHaveLength(2);
    expect(refuerzos(byDate.get('2021-01-03')!)).toHaveLength(2); // domingo tras festivo
    expect(refuerzos(byDate.get('2021-01-04')!)).toHaveLength(1);
  });

  // Antes de corregir el horario de la guardia AP (usaba el de refuerzo, 7h/12h, un error
  // histórico) el grupo real de 17 nunca superaba las 425h/año. Con la guardia AP igual
  // que la AC (17h/18h/23h) ese mismo grupo ya no basta: el cuadrante se genera igual
  // (restricción blanda) pero con el aviso de grupo demasiado pequeño.
  it('con el grupo real de 17, la guardia AP corregida hace que el cuadrante avise de superar las 425h', () => {
    const rota = generateRota(YEAR_2026, 'AP', AP_POOL_17, dayClassifications);

    const capacity = rota.schedule.reduce(
      (sum, day) =>
        sum +
        day.doctors.reduce((total, doctor) => total + (doctor.durationHours ?? day.durationHours), 0),
      0,
    );
    const excesses = rota.stats.doctors.map((doctor) => Math.max(0, doctor.totalHours - doctor.targetHours));
    const excessHours = excesses.reduce((sum, value) => sum + value, 0);
    expect(excessHours).toBe(capacity - 17 * 425);

    expect(rota.warnings).toHaveLength(1);
    expect(rota.warnings[0]).toMatch(/demasiado pequeño para AP/);
    expect(rota.warnings[0]).toContain(`${capacity}h`);
    expect(rota.warnings[0]).toContain(`al menos ${Math.ceil(capacity / 425)} médicos`);
    expect(rota.warnings[0]).toContain('17 médicos quedan por encima del máximo de 425h');
    expect(rota.warnings[0]).toContain(`sobran ${excessHours}h en total`);
    expect(rota.doctorsPerDay).toBe(1);
  });

  it('reparte guardias y refuerzos AP por igual entre los médicos', () => {
    const rota = generateRota(YEAR_2026, 'AP', AP_POOL_17, dayClassifications);
    const guardiaCounts = rota.stats.doctors.map(
      (doctor) =>
        doctor.shiftsWeekday + doctor.shiftsSaturday + doctor.shiftsSundayHoliday - doctor.shiftsRefuerzo,
    );
    const refuerzoCounts = rota.stats.doctors.map((doctor) => doctor.shiftsRefuerzo);

    expect(Math.max(...guardiaCounts) - Math.min(...guardiaCounts)).toBeLessThanOrEqual(2);
    expect(Math.max(...refuerzoCounts) - Math.min(...refuerzoCounts)).toBeLessThanOrEqual(2);
  });

  it('genera el cuadrante con un aviso cuando el pool AP es demasiado pequeño para el máximo', () => {
    const rota = generateRota(YEAR_2026, 'AP', AP_POOL_8, dayClassifications);

    expect(rota.schedule).toHaveLength(365);
    // Suma por médico (`durationHours` propio del refuerzo, si no el de la guardia del
    // día): con la guardia AP y el refuerzo en horarios distintos, `day.durationHours *
    // day.doctors.length` ya no vale (contaría el refuerzo con las horas de la guardia).
    const capacity = rota.schedule.reduce(
      (sum, day) =>
        sum +
        day.doctors.reduce((total, doctor) => total + (doctor.durationHours ?? day.durationHours), 0),
      0,
    );
    const excesses = rota.stats.doctors.map((doctor) =>
      Math.max(0, doctor.totalHours - doctor.targetHours),
    );
    const excessHours = excesses.reduce((sum, value) => sum + value, 0);
    expect(excessHours).toBe(capacity - 8 * 425);

    expect(rota.warnings).toHaveLength(1);
    expect(rota.warnings[0]).toMatch(/demasiado pequeño para AP/);
    expect(rota.warnings[0]).toContain(`${capacity}h`);
    expect(rota.warnings[0]).toContain(`al menos ${Math.ceil(capacity / 425)} médicos`);
    expect(rota.warnings[0]).toContain('8 médicos quedan por encima del máximo de 425h');
    expect(rota.warnings[0]).toContain(`sobran ${excessHours}h en total`);
  });

  it('rechaza un pool AP que no cubre guardia y dos refuerzos con descanso', () => {
    expect(() => generateRota(YEAR_2026, 'AP', AP_POOL_5, dayClassifications)).toThrow(
      /demasiado pequeño para AP. Se necesitan al menos 6 médicos/i,
    );
  });
});

describe('refuerzosForDay', () => {
  const dayOf = (iso: string, holidays: string[] = []) =>
    classifyDay(new Date(`${iso}T00:00:00.000Z`), new Set(holidays.map((h) => new Date(`${h}T00:00:00.000Z`))));

  it('1 refuerzo en laborables, sábados y festivos aislados', () => {
    expect(refuerzosForDay(dayOf('2026-03-10'), dayOf('2026-03-09'))).toBe(1);
    expect(refuerzosForDay(dayOf('2026-03-14'), dayOf('2026-03-13'))).toBe(1);
    expect(refuerzosForDay(dayOf('2026-03-15'), dayOf('2026-03-14'))).toBe(1);
  });

  it('2 refuerzos en el segundo de dos festivos consecutivos', () => {
    expect(refuerzosForDay(dayOf('2026-03-16', ['2026-03-16']), dayOf('2026-03-15'))).toBe(2);
  });

  it('2 refuerzos en los festivos especiales de sanidad, nunca más', () => {
    for (const iso of ['2026-01-01', '2026-01-06', '2026-12-24', '2026-12-25', '2026-12-31']) {
      const previous = dayOf(new Date(Date.parse(`${iso}T00:00:00.000Z`) - 86400000).toISOString().slice(0, 10));
      expect(refuerzosForDay(dayOf(iso), previous)).toBe(2);
    }
  });

  it('sin día anterior, el 2 de enero festivo sigue al 1 de enero especial', () => {
    // 2021 (antes de 2027): si fuera 2027 el sábado ya daría 2 por la regla del sábado y
    // la prueba dejaría de ejercitar el cálculo del día anterior por defecto.
    expect(refuerzosForDay(dayOf('2021-01-02', ['2021-01-02']))).toBe(2);
  });

  it('2027: todos los sábados llevan 2 refuerzos, sean festivos o no', () => {
    expect(refuerzosForDay(dayOf('2027-01-09'))).toBe(2); // sábado normal
    expect(refuerzosForDay(dayOf('2027-05-01', ['2027-05-01']))).toBe(2); // sábado festivo
  });

  it('2027: el domingo tras un sábado normal lleva 1 refuerzo; tras uno festivo, 2', () => {
    expect(refuerzosForDay(dayOf('2027-01-10'), dayOf('2027-01-09'))).toBe(1);
    expect(refuerzosForDay(dayOf('2027-05-02'), dayOf('2027-05-01', ['2027-05-01']))).toBe(2);
  });

  it('2026: el sábado normal sigue llevando 1 refuerzo (sin la regla de 2027)', () => {
    expect(refuerzosForDay(dayOf('2026-01-03'), dayOf('2026-01-02'))).toBe(1);
  });
});

describe('generateRotas — AC y AP en una sola generación', () => {
  const dayClassifications = classifyYear(YEAR_2026, toHolidaySet(HOLIDAYS_2026));
  const iso = (date: Date) => date.toISOString().slice(0, 10);
  const { ac, ap } = generateRotas(YEAR_2026, AC_POOL_4, AP_POOL_17, dayClassifications);
  const acByDate = new Map(ac.schedule.map((day) => [iso(day.date), day]));
  const apByDate = new Map(ap.schedule.map((day) => [iso(day.date), day]));
  const acRefuerzoCount = (date: string) =>
    acByDate.get(date)!.doctors.filter((doctor) => doctor.role === 'refuerzo').length;

  it('cada día hay una guardia AC, una guardia AP y los refuerzos que tocan', () => {
    for (const [index, day] of dayClassifications.entries()) {
      const date = iso(day.date);
      const acDay = acByDate.get(date)!;
      const apDay = apByDate.get(date)!;
      const totalRefuerzos =
        acDay.doctors.filter((doctor) => doctor.role === 'refuerzo').length +
        apDay.doctors.filter((doctor) => doctor.role === 'refuerzo').length;

      expect(acDay.doctors.filter((doctor) => doctor.role === 'guardia')).toHaveLength(1);
      expect(apDay.doctors.filter((doctor) => doctor.role === 'guardia')).toHaveLength(1);
      expect(totalRefuerzos).toBe(refuerzosForDay(day, dayClassifications[index - 1]));
    }
  });

  it('un AC hace refuerzo el día anterior a una de sus guardias, en el mismo mes y con horario AP', () => {
    let total = 0;
    for (const day of ac.schedule) {
      for (const doctor of day.doctors.filter((ref) => ref.role === 'refuerzo')) {
        total += 1;
        const next = acByDate.get(addDays(iso(day.date), 1))!;
        const previous = acByDate.get(addDays(iso(day.date), -1));
        expect(next.doctors).toContainEqual(expect.objectContaining({ doctorId: doctor.doctorId, role: 'guardia' }));
        expect(next.date.getUTCMonth()).toBe(day.date.getUTCMonth());
        expect(previous?.doctors.some((ref) => ref.doctorId === doctor.doctorId) ?? false).toBe(false);
        expect(doctor.durationHours).toBe(day.dayType === 'holiday' ? 12 : 7);
        expect(doctor.shiftEnd).toBe('22:00');
      }
    }
    expect(total).toBeGreaterThan(0);
  });

  it('con los refuerzos, todos los AC llegan a 135h cada mes', () => {
    expect(ac.warnings).toEqual([]);
    for (const doctor of ac.stats.doctors) {
      for (let month = 1; month <= 12; month += 1) {
        expect(doctor.monthlyHours[String(month)]).toBeGreaterThanOrEqual(135);
      }
      expect(doctor.totalHours).toBeGreaterThanOrEqual(1620);
    }
  });

  it('los refuerzos que hace un AC se descuentan de los de AP ese día', () => {
    const date = ac.schedule.find((day) => day.doctors.some((ref) => ref.role === 'refuerzo'))!;
    const key = iso(date.date);
    expect(acRefuerzoCount(key)).toBe(1);
    expect(apByDate.get(key)!.doctors.filter((doctor) => doctor.role === 'refuerzo')).toHaveLength(
      refuerzosForDay(date) - 1,
    );
  });

  it('cuenta las horas del refuerzo AC en sus estadísticas', () => {
    const doctor = ac.stats.doctors[0];
    const fromSchedule = ac.schedule.reduce(
      (sum, day) =>
        sum +
        day.doctors
          .filter((ref) => ref.doctorId === doctor.doctorId)
          .reduce((total, ref) => total + (ref.durationHours ?? day.durationHours), 0),
      0,
    );
    expect(doctor.totalHours).toBe(fromSchedule);
    expect(ac.stats.doctors.reduce((sum, item) => sum + item.shiftsRefuerzo, 0)).toBeGreaterThan(0);
  });

  it('respeta el descanso en AP: nadie repite al día siguiente ni hace guardia y refuerzo el mismo día', () => {
    for (const day of ap.schedule) {
      const next = apByDate.get(addDays(iso(day.date), 1));
      const today = new Set(day.doctors.map((doctor) => doctor.doctorId));
      expect(today.size).toBe(day.doctors.length);
      for (const doctor of next?.doctors ?? []) {
        expect(today.has(doctor.doctorId)).toBe(false);
      }
    }
  });

  it('avisa de los meses que un AC no puede completar por falta de hueco', () => {
    const largePool = Array.from({ length: 8 }, (_, index) => ({
      id: `ac-${index}`,
      name: `Dr. AC ${index}`,
      department: 'Medicina General',
    }));
    const rotas = generateRotas(YEAR_2026, largePool, AP_POOL_17, dayClassifications);

    expect(rotas.ac.warnings).toHaveLength(2);
    expect(rotas.ac.warnings[0]).toMatch(/demasiado grande para AC/);
    expect(rotas.ac.warnings[1]).toMatch(/^No hay hueco para más refuerzos y algunos médicos AC quedan por debajo de 135h en el mes: /);
    expect(rotas.ac.warnings[1]).toMatch(/Dr\. AC \d \(enero, faltan \d+h\)/);
  });

  it('funciona con la estrategia de ruedas', () => {
    const rotas = generateRotas(YEAR_2026, AC_POOL_4, AP_POOL_17, dayClassifications, undefined, 'wheels');
    expect(rotas.ac.strategy).toBe('wheels');
    expect(rotas.ap.strategy).toBe('wheels');
    expect(rotas.ac.warnings).toEqual([]);
    // El grupo real de 17 AP supera las 425h/año con la guardia AP corregida (ver
    // «con el grupo real de 17 ...» más arriba); aquí sólo se comprueba que ruedas
    // también genera el cuadrante con ese mismo aviso, no una excepción.
    expect(rotas.ap.warnings).toHaveLength(1);
    expect(rotas.ap.warnings[0]).toMatch(/demasiado pequeño para AP/);
  });
});

describe('generateRotas 2026 — la guardia AP coincide con la guardia AC', () => {
  const dayClassifications = classifyYear(YEAR_2026, toHolidaySet(HOLIDAYS_2026));

  it.each(['single-wheel', 'wheels'] as const)(
    'la guardia AP tiene las mismas horas e inicio/fin que la AC: 17h laborable, 18h sábado, 23h festivo (%s)',
    (strategy) => {
      const { ac, ap } = generateRotas(YEAR_2026, AC_POOL_4, AP_POOL_17, dayClassifications, undefined, strategy);
      const acByDate = new Map(ac.schedule.map((day) => [toIsoDate(day.date), day]));
      const apByDate = new Map(ap.schedule.map((day) => [toIsoDate(day.date), day]));

      for (const day of dayClassifications) {
        const date = toIsoDate(day.date);
        const acDay = acByDate.get(date)!;
        const apDay = apByDate.get(date)!;

        // La guardia AP ya no se transforma: comparte horas e inicio/fin con la AC.
        expect(apDay.durationHours).toBe(acDay.durationHours);
        expect(apDay.shiftStart).toBe(acDay.shiftStart);
        expect(apDay.shiftEnd).toBe(acDay.shiftEnd);

        if (day.dayType === 'holiday') {
          expect(acDay.durationHours).toBe(23);
        } else if (day.dayType === 'saturday') {
          expect(acDay.durationHours).toBe(18);
        } else {
          expect(acDay.durationHours).toBe(17);
        }
      }
    },
  );

  it.each(['single-wheel', 'wheels'] as const)(
    'los refuerzos de 2026 siguen con 7h laborable/sábado y 12h festivo, 1 por sábado normal (%s)',
    (strategy) => {
      const { ac, ap } = generateRotas(YEAR_2026, AC_POOL_4, AP_POOL_17, dayClassifications, undefined, strategy);
      const acByDate = new Map(ac.schedule.map((day) => [toIsoDate(day.date), day]));
      const apByDate = new Map(ap.schedule.map((day) => [toIsoDate(day.date), day]));

      for (const day of [...ac.schedule, ...ap.schedule]) {
        for (const refuerzo of day.doctors.filter((doctor) => doctor.role === 'refuerzo')) {
          const expectedHours = day.dayType === 'holiday' ? 12 : 7;
          expect(refuerzo.durationHours).toBe(expectedHours);
          expect(refuerzo.shiftStart).toBe(expectedHours === 12 ? '10:00' : '15:00');
          expect(refuerzo.shiftEnd).toBe('22:00');
        }
      }

      // Sin la regla de 2027, un sábado normal (no festivo) sigue llevando un único refuerzo.
      for (const day of dayClassifications) {
        if (day.dayType !== 'saturday') {
          continue;
        }
        const date = toIsoDate(day.date);
        const refuerzos =
          acByDate.get(date)!.doctors.filter((doctor) => doctor.role === 'refuerzo').length +
          apByDate.get(date)!.doctors.filter((doctor) => doctor.role === 'refuerzo').length;
        expect(refuerzos).toBe(1);
      }
    },
  );
});

describe('generateRotas 2027 — horarios nuevos', () => {
  const days2027 = classifyYear(2027, new Set());

  it.each(['single-wheel', 'wheels'] as const)(
    'todos los sábados llevan 2 refuerzos de 12h entre AC y AP, nunca más de 2, y la guardia AP comparte horario con la AC (%s)',
    (strategy) => {
      const { ac, ap } = generateRotas(2027, AC_POOL_4, AP_POOL_17, days2027, undefined, strategy);
      const acByDate = new Map(ac.schedule.map((day) => [toIsoDate(day.date), day]));
      const apByDate = new Map(ap.schedule.map((day) => [toIsoDate(day.date), day]));

      for (const day of days2027) {
        const date = toIsoDate(day.date);
        const acDay = acByDate.get(date)!;
        const apDay = apByDate.get(date)!;
        const refuerzos = [...acDay.doctors, ...apDay.doctors].filter(
          (doctor) => doctor.role === 'refuerzo',
        );

        expect(refuerzos.length).toBeLessThanOrEqual(2);
        if (day.date.getUTCDay() === 6) {
          expect(refuerzos).toHaveLength(2);
          for (const refuerzo of refuerzos) {
            expect(refuerzo.durationHours).toBe(12);
            expect(refuerzo.shiftStart).toBe('10:00');
            expect(refuerzo.shiftEnd).toBe('22:00');
          }
        }

        // La guardia AP ya no se transforma y comparte horas e inicio/fin con la AC.
        expect(apDay.durationHours).toBe(acDay.durationHours);
        expect(apDay.shiftStart).toBe(acDay.shiftStart);
        expect(apDay.shiftEnd).toBe(acDay.shiftEnd);
      }

      // 2027-01-08 es viernes y 2027-01-09 es sábado.
      expect(acByDate.get('2027-01-08')!.durationHours).toBe(18);
      expect(apByDate.get('2027-01-08')!.durationHours).toBe(18);
      expect(acByDate.get('2027-01-09')!.durationHours).toBe(24);
      expect(apByDate.get('2027-01-09')!.durationHours).toBe(24);
    },
  );

  it.each(['single-wheel', 'wheels'] as const)(
    'los refuerzos AC reservados (planAcRefuerzos) llevan el horario de refuerzo 2027 del día (%s)',
    (strategy) => {
      const { ac } = generateRotas(2027, AC_POOL_4, AP_POOL_17, days2027, undefined, strategy);
      let checked = 0;
      for (const day of ac.schedule) {
        for (const doctor of day.doctors.filter((ref) => ref.role === 'refuerzo')) {
          checked += 1;
          const expectedHours = day.date.getUTCDay() === 6 || day.dayType === 'holiday' ? 12 : 7;
          expect(doctor.durationHours).toBe(expectedHours);
          expect(doctor.shiftStart).toBe(expectedHours === 12 ? '10:00' : '15:00');
          expect(doctor.shiftEnd).toBe('22:00');
        }
      }
      expect(checked).toBeGreaterThan(0);
    },
  );
});

describe('AC rota — cobertura fija y validación de pool', () => {
  const dayClassifications = classifyYear(YEAR_2026, toHolidaySet(HOLIDAYS_2026));

  it('asigna exactamente 1 AC primary por día independientemente del tamaño del pool', () => {
    const largePool = [
      ...AC_POOL_4,
      { id: 'doc-005', name: 'Dr. Romero', department: 'Cardio' },
      { id: 'doc-006', name: 'Dr. Diaz', department: 'Cardio' },
      { id: 'doc-007', name: 'Dr. Iglesias', department: 'Cardio' },
      { id: 'doc-008', name: 'Dr. Marin', department: 'Cardio' },
    ];

    const rota = generateRota(YEAR_2026, 'AC', largePool, dayClassifications);

    for (const day of rota.schedule) {
      expect(day.doctors).toHaveLength(1);
    }
    expect(rota.warnings).toHaveLength(1);
    expect(rota.warnings[0]).toMatch(/demasiado grande para AC/);
    expect(rota.warnings[0]).toContain('8 médicos quedan por debajo del mínimo de 1620h');
    for (const doctor of rota.stats.doctors) {
      expect(doctor.hoursVsTarget).toBeLessThan(0);
    }
  });

  it('mantiene 1 AC primary por día con pool factible', () => {
    const rota = generateRota(YEAR_2026, 'AC', AC_POOL_4, dayClassifications);

    for (const day of rota.schedule) {
      expect(day.doctors).toHaveLength(1);
    }
    expect(rota.doctorsPerDay).toBe(1);
  });
});

describe('Continuidad con el año anterior', () => {
  const days2025 = classifyYear(2025, new Set());
  const days2026 = classifyYear(YEAR_2026, toHolidaySet(HOLIDAYS_2026));
  const dayBefore2026 = days2025[days2025.length - 1];

  // Lo que persistiría el servicio: orden del grupo y filas por fecha y orden de inserción.
  const toPreviousRota = (rota: RotaSchedule): PreviousYearRota => ({
    poolOrder: rota.poolOrder,
    assignments: rota.schedule.flatMap((day) =>
      day.doctors.map((entry) => ({
        date: toIsoDate(day.date),
        doctorId: entry.doctorId,
        role: entry.role ?? 'guardia',
      })),
    ),
  });
  const firstYear = generateRotas(2025, AC_POOL_4, AP_POOL_17, days2025, undefined, 'single-wheel', seededRandom(7));
  const previousYear: PreviousYear = {
    days: days2025,
    ac: toPreviousRota(firstYear.ac),
    ap: toPreviousRota(firstYear.ap),
  };
  const doctorsOn = (rota: RotaSchedule, date: string, role?: string) =>
    (rota.schedule.find((day) => toIsoDate(day.date) === date)?.doctors ?? [])
      .filter((entry) => !role || (entry.role ?? 'guardia') === role)
      .map((entry) => entry.doctorId);

  it('no llama a random para el tipo que continúa el año anterior', () => {
    const random = jest.fn(() => 0.5);
    generateRotas(YEAR_2026, AC_POOL_4, AP_POOL_17, days2026, dayBefore2026, 'single-wheel', random, previousYear);
    expect(random).not.toHaveBeenCalled();
  });

  it('con continuidad sólo para AC, el grupo AP se baraja', () => {
    const random = jest.fn(() => 0.5);
    generateRotas(YEAR_2026, AC_POOL_4, AP_POOL_17, days2026, dayBefore2026, 'single-wheel', random, {
      days: days2025,
      ac: previousYear.ac,
    });
    expect(random).toHaveBeenCalled();
  });

  it('sin médicos en común con el año anterior se baraja como siempre', () => {
    const random = jest.fn(() => 0.5);
    const otherPool = AC_POOL_4.map((doctor) => ({ ...doctor, id: `otro-${doctor.id}` }));
    generateRotas(YEAR_2026, otherPool, AP_POOL_17, days2026, dayBefore2026, 'single-wheel', random, {
      days: days2025,
      ac: previousYear.ac,
    });
    expect(random).toHaveBeenCalled();
  });

  it.each(['single-wheel', 'wheels'] as const)(
    'encadenar dos años (%s): mismo orden, la guardia AC del 1-1 es la del siguiente al del 31-12 y nadie del 31-12 repite',
    (strategy) => {
      const first = generateRotas(2025, AC_POOL_4, AP_POOL_17, days2025, undefined, strategy, seededRandom(7));
      const chained: PreviousYear = {
        days: days2025,
        ac: toPreviousRota(first.ac),
        ap: toPreviousRota(first.ap),
      };
      const second = generateRotas(
        YEAR_2026, AC_POOL_4, AP_POOL_17, days2026, dayBefore2026, strategy, seededRandom(99), chained,
      );

      expect(second.ac.poolOrder.map((doctor) => doctor.id)).toEqual(first.ac.poolOrder.map((doctor) => doctor.id));
      expect(second.ap.poolOrder.map((doctor) => doctor.id)).toEqual(first.ap.poolOrder.map((doctor) => doctor.id));

      for (const [previousRota, rota] of [[first.ac, second.ac], [first.ap, second.ap]] as const) {
        const worked = doctorsOn(previousRota, '2025-12-31');
        const working = doctorsOn(rota, '2026-01-01');
        expect(working.filter((id) => worked.includes(id))).toEqual([]);
      }

      if (strategy === 'single-wheel') {
        const order = first.ac.poolOrder.map((doctor) => doctor.id);
        const last = doctorsOn(first.ac, '2025-12-31', 'guardia')[0];
        const expected = order[(order.indexOf(last) + 1) % order.length];
        expect(doctorsOn(second.ac, '2026-01-01', 'guardia')).toEqual([expected]);
      }
    },
  );
});
