import { Injectable } from '@nestjs/common';

import {
  formatClockTime,
  formatShiftEnd,
  fromIsoDate,
  toIsoDate,
} from '../common/date.utils';
import { buildTargetHours } from '../scheduling/assignment.service';
import { calculateStats } from '../scheduling/stats.service';
import {
  DayAssignment as DomainDayAssignment,
  DoctorInput,
  ShiftRole,
} from '../scheduling/scheduling.types';
import { RotaResponse, RotaType, StatsResponse } from './rota.types';
import { RotaAssignmentEntity, compareAssignments } from './entities/rota-assignment.entity';
import { RotaEntity } from './entities/rota.entity';

@Injectable()
export class RotaResponseMapper {
  toResponse(rota: RotaEntity, doctorIdFilter?: string): RotaResponse {
    const pool = rota.pool as DoctorInput[];
    const doctorMap = new Map(pool.map((doctor) => [doctor.id, doctor]));
    const targetHours = buildTargetHours(rota.rotaType as RotaType, pool);

    const allAssignments = [...rota.assignments].sort(compareAssignments);
    const filteredAssignments = doctorIdFilter
      ? allAssignments.filter((assignment) => assignment.doctorId === doctorIdFilter)
      : allAssignments;

    const schedule = this.buildApiSchedule(filteredAssignments, doctorMap);
    const allSchedule = this.buildDomainSchedule(allAssignments, doctorMap);
    const statsList = calculateStats(allSchedule, pool, targetHours);
    const stats: StatsResponse = {
      doctors: statsList.map((doctor) => ({
        doctor_id: doctor.doctorId,
        doctor_name: doctor.doctorName,
        guardia_hours: doctor.guardiaHours,
        refuerzo_hours: doctor.refuerzoHours,
        total_hours: doctor.totalHours,
        target_hours: doctor.targetHours,
        hours_vs_target: doctor.hoursVsTarget,
        monthly_hours: doctor.monthlyHours,
        shifts_weekday: doctor.shiftsWeekday,
        shifts_saturday: doctor.shiftsSaturday,
        shifts_sunday_holiday: doctor.shiftsSundayHoliday,
        shifts_refuerzo: doctor.shiftsRefuerzo,
      })),
    };

    return {
      team_id: rota.teamId,
      year: rota.year,
      city: rota.city,
      rota_type: rota.rotaType as RotaType,
      doctors_per_day: rota.doctorsPerDay,
      strategy: rota.strategy as RotaResponse['strategy'],
      generated_at: rota.generatedAt,
      doctor_order: pool.map((doctor) => doctor.id),
      schedule,
      stats,
      warnings: [],
    };
  }

  private buildDomainSchedule(
    assignments: RotaAssignmentEntity[],
    doctorMap: Map<string, DoctorInput>,
  ): DomainDayAssignment[] {
    const grouped = new Map<string, RotaAssignmentEntity[]>();
    for (const assignment of assignments) {
      const key = assignment.date;
      if (!grouped.has(key)) {
        grouped.set(key, []);
      }
      grouped.get(key)?.push(assignment);
    }

    return [...grouped.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([date, rows]) => {
        // El horario del día es el de la guardia; un refuerzo AC lleva el suyo propio.
        const first = rows.find((row) => row.role !== 'refuerzo') ?? rows[0];

        return {
          date: fromIsoDate(date),
          dayType: first.dayType as DomainDayAssignment['dayType'],
          shiftStart: formatClockTime(first.shiftStart),
          shiftEnd: formatShiftEnd(first.shiftStart, first.shiftEnd),
          durationHours: first.durationHours,
          doctors: rows.map((assignment) => ({
            doctorId: assignment.doctorId,
            doctorName: doctorMap.get(assignment.doctorId)?.name ?? assignment.doctorId,
            role: (assignment.role ?? 'guardia') as ShiftRole,
            durationHours: assignment.durationHours,
            shiftStart: formatClockTime(assignment.shiftStart),
            shiftEnd: formatShiftEnd(assignment.shiftStart, assignment.shiftEnd),
          })),
        };
      });
  }

  private buildApiSchedule(assignments: RotaAssignmentEntity[], doctorMap: Map<string, DoctorInput>) {
    return this.buildDomainSchedule(assignments, doctorMap).map((day) => ({
      date: toIsoDate(day.date),
      day_type: day.dayType,
      shift_start: day.shiftStart,
      shift_end: day.shiftEnd,
      duration_hours: day.durationHours,
      doctors: day.doctors.map((doctor) => ({
        doctor_id: doctor.doctorId,
        doctor_name: doctor.doctorName,
        role: doctor.role ?? 'guardia',
      })),
    }));
  }
}
