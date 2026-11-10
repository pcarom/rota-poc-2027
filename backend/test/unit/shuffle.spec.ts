import {
  AC_POOL_4,
  AP_POOL_17,
  HOLIDAYS_2026,
  YEAR_2026,
  seededRandom,
  toHolidaySet,
} from '../helpers/fixtures';

import { generateRotas } from '../../src/scheduling/assignment.service';
import { DayAssignment } from '../../src/scheduling/scheduling.types';
import { shuffle } from '../../src/scheduling/shuffle';
import { ASSIGNMENT_STRATEGY_IDS } from '../../src/scheduling/strategies';
import { addDays } from '../../src/common/date.utils';
import { classifyYear } from '../../src/holidays/holidays.service';

describe('shuffle', () => {
  it('devuelve una permutación sin modificar el original', () => {
    const items = [1, 2, 3, 4, 5, 6, 7, 8];
    const shuffled = shuffle(items, seededRandom(1));

    expect(items).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect([...shuffled].sort((left, right) => left - right)).toEqual(items);
  });

  it('es reproducible con la misma fuente y cambia con otra', () => {
    const items = Array.from({ length: 17 }, (_, index) => index);
    expect(shuffle(items, seededRandom(7))).toEqual(shuffle(items, seededRandom(7)));
    expect(shuffle(items, seededRandom(7))).not.toEqual(shuffle(items, seededRandom(8)));
  });
});

describe('generateRotas — barajado del grupo antes de asignar', () => {
  const dayClassifications = classifyYear(YEAR_2026, toHolidaySet(HOLIDAYS_2026));
  const iso = (date: Date) => date.toISOString().slice(0, 10);
  const firstGuardia = (schedule: DayAssignment[]) =>
    schedule[0].doctors.find((doctor) => doctor.role === 'guardia')!.doctorId;

  it.each(ASSIGNMENT_STRATEGY_IDS)('sin barajar, %s empieza siempre por el mismo médico', (strategy) => {
    const runs = [1, 2].map(() =>
      generateRotas(YEAR_2026, AC_POOL_4, AP_POOL_17, dayClassifications, undefined, strategy),
    );
    expect(firstGuardia(runs[0].ac.schedule)).toBe(firstGuardia(runs[1].ac.schedule));
    expect(firstGuardia(runs[0].ap.schedule)).toBe(firstGuardia(runs[1].ap.schedule));
  });

  it.each(ASSIGNMENT_STRATEGY_IDS)('al barajar, %s no empieza siempre por el mismo médico', (strategy) => {
    const firstAc = new Set<string>();
    const firstAp = new Set<string>();
    for (let seed = 1; seed <= 20; seed += 1) {
      const { ac, ap } = generateRotas(
        YEAR_2026,
        AC_POOL_4,
        AP_POOL_17,
        dayClassifications,
        undefined,
        strategy,
        seededRandom(seed),
      );
      firstAc.add(firstGuardia(ac.schedule));
      firstAp.add(firstGuardia(ap.schedule));
    }
    expect(firstAc.size).toBeGreaterThan(1);
    expect(firstAp.size).toBeGreaterThan(1);
  });

  it('las estadísticas conservan el orden original del grupo', () => {
    const { ac, ap } = generateRotas(
      YEAR_2026,
      AC_POOL_4,
      AP_POOL_17,
      dayClassifications,
      undefined,
      'single-wheel',
      seededRandom(3),
    );
    expect(ac.stats.doctors.map((doctor) => doctor.doctorId)).toEqual(AC_POOL_4.map((doctor) => doctor.id));
    expect(ap.stats.doctors.map((doctor) => doctor.doctorId)).toEqual(AP_POOL_17.map((doctor) => doctor.id));
  });

  describe.each(ASSIGNMENT_STRATEGY_IDS)('con cualquier orden, %s cumple las reglas', (strategy) => {
    it.each([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])('semilla %i', (seed) => {
      const { ac, ap } = generateRotas(
        YEAR_2026,
        AC_POOL_4,
        AP_POOL_17,
        dayClassifications,
        undefined,
        strategy,
        seededRandom(seed),
      );

      expect(ac.warnings).toEqual([]);
      // El grupo real de 17 AP supera las 425h/año con la guardia AP corregida (era
      // 7h/12h, el horario del refuerzo, por error) sea cual sea el orden barajado:
      // el aviso de grupo demasiado pequeño no depende del barajado, sólo las reglas
      // de más abajo (horas mínimas AC, descanso AP).
      expect(ap.warnings).toHaveLength(1);
      expect(ap.warnings[0]).toMatch(/demasiado pequeño para AP/);
      for (const doctor of ac.stats.doctors) {
        for (let month = 1; month <= 12; month += 1) {
          expect(doctor.monthlyHours[String(month)]).toBeGreaterThanOrEqual(135);
        }
      }
      const apByDate = new Map(ap.schedule.map((day) => [iso(day.date), day]));
      for (const day of ap.schedule) {
        const today = new Set(day.doctors.map((doctor) => doctor.doctorId));
        expect(today.size).toBe(day.doctors.length);
        for (const doctor of apByDate.get(addDays(iso(day.date), 1))?.doctors ?? []) {
          expect(today.has(doctor.doctorId)).toBe(false);
        }
      }
    });
  });
});
