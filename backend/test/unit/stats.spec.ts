import { calculateStats } from '../../src/scheduling/stats.service';
import { DayAssignment, DoctorInput } from '../../src/scheduling/scheduling.types';
import { fromIsoDate } from '../../src/common/date.utils';

describe('calculateStats', () => {
  const AP_DOCTOR: DoctorInput = { id: 'ap-1', name: 'Dr. Navarro', department: 'Urologia' };
  const AC_DOCTOR: DoctorInput = { id: 'ac-1', name: 'Dr. Garcia', department: 'Medicina General' };

  it('reparte las horas de un AP entre guardia (sin role) y refuerzo (con su propio horario)', () => {
    const schedule: DayAssignment[] = [
      {
        date: fromIsoDate('2026-01-05'),
        dayType: 'weekday',
        durationHours: 17,
        shiftStart: '15:00',
        shiftEnd: '08:00+1',
        doctors: [{ doctorId: 'ap-1', doctorName: 'Dr. Navarro' }],
      },
      {
        date: fromIsoDate('2026-01-10'),
        dayType: 'holiday',
        durationHours: 23,
        shiftStart: '09:00',
        shiftEnd: '08:00+1',
        doctors: [
          {
            doctorId: 'ap-1',
            doctorName: 'Dr. Navarro',
            role: 'refuerzo',
            durationHours: 12,
            shiftStart: '10:00',
            shiftEnd: '22:00',
          },
        ],
      },
    ];

    const [stats] = calculateStats(schedule, [AP_DOCTOR]);

    expect(stats.guardiaHours).toBe(17);
    expect(stats.refuerzoHours).toBe(12);
    expect(stats.totalHours).toBe(29);
  });

  it('reparte las horas de un AC con refuerzos reservados para llegar al mínimo mensual', () => {
    const schedule: DayAssignment[] = [
      {
        date: fromIsoDate('2026-02-02'),
        dayType: 'weekday',
        durationHours: 17,
        shiftStart: '15:00',
        shiftEnd: '08:00+1',
        doctors: [{ doctorId: 'ac-1', doctorName: 'Dr. Garcia' }],
      },
      {
        date: fromIsoDate('2026-02-05'),
        dayType: 'weekday',
        durationHours: 17,
        shiftStart: '15:00',
        shiftEnd: '08:00+1',
        doctors: [
          {
            doctorId: 'ac-1',
            doctorName: 'Dr. Garcia',
            role: 'refuerzo',
            durationHours: 7,
            shiftStart: '15:00',
            shiftEnd: '22:00',
          },
        ],
      },
      {
        date: fromIsoDate('2026-02-07'),
        dayType: 'saturday',
        durationHours: 18,
        shiftStart: '15:00',
        shiftEnd: '09:00+1',
        doctors: [
          {
            doctorId: 'ac-1',
            doctorName: 'Dr. Garcia',
            role: 'refuerzo',
            durationHours: 12,
            shiftStart: '10:00',
            shiftEnd: '22:00',
          },
        ],
      },
    ];

    const [stats] = calculateStats(schedule, [AC_DOCTOR]);

    expect(stats.guardiaHours).toBe(17);
    expect(stats.refuerzoHours).toBe(19);
    expect(stats.totalHours).toBe(36);
  });

  it('guardiaHours + refuerzoHours siempre coincide con totalHours, para cada médico del pool', () => {
    const schedule: DayAssignment[] = [
      {
        date: fromIsoDate('2026-03-02'),
        dayType: 'weekday',
        durationHours: 17,
        shiftStart: '15:00',
        shiftEnd: '08:00+1',
        doctors: [{ doctorId: 'ap-1', doctorName: 'Dr. Navarro' }],
      },
      {
        date: fromIsoDate('2026-03-03'),
        dayType: 'weekday',
        durationHours: 17,
        shiftStart: '15:00',
        shiftEnd: '08:00+1',
        doctors: [
          { doctorId: 'ac-1', doctorName: 'Dr. Garcia' },
          {
            doctorId: 'ap-1',
            doctorName: 'Dr. Navarro',
            role: 'refuerzo',
            durationHours: 7,
            shiftStart: '15:00',
            shiftEnd: '22:00',
          },
        ],
      },
    ];

    const stats = calculateStats(schedule, [AP_DOCTOR, AC_DOCTOR]);

    for (const doctor of stats) {
      expect(doctor.guardiaHours + doctor.refuerzoHours).toBe(doctor.totalHours);
    }
  });
});
