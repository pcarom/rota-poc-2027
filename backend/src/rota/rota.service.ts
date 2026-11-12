import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';

import { AppConfigService } from '../config/app-config.service';
import { formatClockTime, fromIsoDate } from '../common/date.utils';
import { HolidaysService, classifyDay, classifyYear } from '../holidays/holidays.service';
import { InfeasiblePoolError, generateRotas } from '../scheduling/assignment.service';
import { DEFAULT_ASSIGNMENT_STRATEGY } from '../scheduling/strategies';
import { refuerzoShiftDetails } from '../scheduling/shifts';
import { PreviousYear, PreviousYearRota } from '../scheduling/continuation';
import { DayType, DoctorInput, RotaSchedule, ShiftRole } from '../scheduling/scheduling.types';
import { AddDoctorDto } from './dto/add-doctor.dto';
import { GenerateRotaDto } from './dto/generate-rota.dto';
import { ReplaceDoctorDto } from './dto/replace-doctor.dto';
import { RotaAssignmentEntity, compareAssignments } from './entities/rota-assignment.entity';
import { RotaDoctorEntity } from './entities/rota-doctor.entity';
import { RotaEntity } from './entities/rota.entity';
import { deleteRotaWithChildren } from './rota-deletion';
import { RotaResponseMapper } from './rota-response.mapper';
import { TeamsService } from '../teams/teams.service';

@Injectable()
export class RotaService {
  constructor(
    private readonly appConfigService: AppConfigService,
    private readonly holidaysService: HolidaysService,
    private readonly responseMapper: RotaResponseMapper,
    private readonly teamsService: TeamsService,
    private readonly dataSource: DataSource,
    @InjectRepository(RotaEntity)
    private readonly rotaRepository: Repository<RotaEntity>,
    @InjectRepository(RotaDoctorEntity)
    private readonly rotaDoctorRepository: Repository<RotaDoctorEntity>,
    @InjectRepository(RotaAssignmentEntity)
    private readonly rotaAssignmentRepository: Repository<RotaAssignmentEntity>,
  ) {}

  private async holidayDates(year: number): Promise<Set<Date>> {
    const holidayItems = await this.holidaysService.getHolidays(year, this.appConfigService.city);
    return new Set(holidayItems.map((holiday) => new Date(`${holiday.date}T00:00:00.000Z`)));
  }

  async generate(request: GenerateRotaDto) {
    const sharedIds = request.ac_pool
      .map((doctor) => doctor.id)
      .filter((doctorId) => request.ap_pool.some((doctor) => doctor.id === doctorId));
    if (sharedIds.length > 0) {
      throw new BadRequestException(
        `Un médico sólo puede pertenecer a un grupo: ${sharedIds.join(', ')} está en AC y en AP.`,
      );
    }

    const teamId = await this.teamsService.resolveTeamId(request.team_id);
    const previousRotas = await this.loadPreviousYearRotas(teamId, request.year - 1);

    try {
      const dayClassifications = classifyYear(
        request.year,
        await this.holidayDates(request.year),
      );
      const previousHolidays = await this.holidayDates(request.year - 1);
      // El 31 de diciembre anterior decide si el 1 de enero es un segundo festivo consecutivo.
      const dayBeforeYear = classifyDay(
        new Date(Date.UTC(request.year - 1, 11, 31)),
        previousHolidays,
      );
      const previousYear: PreviousYear | undefined =
        previousRotas.ac || previousRotas.ap
          ? { days: classifyYear(request.year - 1, previousHolidays), ...previousRotas }
          : undefined;
      const rotas = generateRotas(
        request.year,
        request.ac_pool,
        request.ap_pool,
        dayClassifications,
        dayBeforeYear,
        request.strategy ?? DEFAULT_ASSIGNMENT_STRATEGY,
        // Cada grupo sin cuadrante del año anterior se baraja para no empezar todos los años
        // por el mismo médico; los que lo tienen lo continúan y no usan la aleatoriedad.
        Math.random,
        previousYear,
      );

      const persisted = await this.dataSource.transaction(async (manager) => [
        await this.persistRota(manager, teamId, request.year, rotas.ac, rotas.ac.poolOrder),
        await this.persistRota(manager, teamId, request.year, rotas.ap, rotas.ap.poolOrder),
      ]);

      return [
        { ...this.responseMapper.toResponse(persisted[0]), warnings: rotas.ac.warnings },
        { ...this.responseMapper.toResponse(persisted[1]), warnings: rotas.ap.warnings },
      ];
    } catch (error) {
      if (error instanceof InfeasiblePoolError) {
        throw new BadRequestException(error.message);
      }
      if (error instanceof BadRequestException) {
        throw error;
      }
      const message = error instanceof Error ? error.message : String(error);
      throw new BadGatewayException(`No se han podido obtener los festivos de ${request.year}: ${message}`);
    }
  }

  /** Cuadrantes AC y AP del año anterior del equipo, tal como quedaron guardados (ediciones incluidas). */
  private async loadPreviousYearRotas(
    teamId: number,
    year: number,
  ): Promise<{ ac?: PreviousYearRota; ap?: PreviousYearRota }> {
    const rotas = await this.rotaRepository.find({
      where: { teamId, year },
      relations: { assignments: true },
    });
    const toPrevious = (rotaType: string): PreviousYearRota | undefined => {
      const rota = rotas.find((candidate) => candidate.rotaType === rotaType);
      return rota
        ? {
            poolOrder: rota.pool as DoctorInput[],
            assignments: [...rota.assignments]
              .sort(compareAssignments)
              .map(({ date, doctorId, role }) => ({ date, doctorId, role: role as ShiftRole })),
          }
        : undefined;
    };

    return { ac: toPrevious('AC'), ap: toPrevious('AP') };
  }

  private async persistRota(
    manager: EntityManager,
    teamId: number,
    year: number,
    rota: RotaSchedule,
    pool: DoctorInput[],
  ): Promise<RotaEntity> {
    const existing = await manager.findOne(RotaEntity, {
      where: { teamId, year, rotaType: rota.rotaType },
    });
    if (existing) {
      await deleteRotaWithChildren(manager, existing.id);
    }

    const savedRota = await manager.save(
      manager.create(RotaEntity, {
        teamId,
        year,
        rotaType: rota.rotaType,
        city: this.appConfigService.city,
        generatedAt: new Date(),
        pool,
        doctorsPerDay: rota.doctorsPerDay,
        strategy: rota.strategy,
      }),
    );

    await manager.save(
      RotaDoctorEntity,
      pool.map((doctor) =>
        manager.create(RotaDoctorEntity, {
          rotaId: savedRota.id,
          doctorId: doctor.id,
          name: doctor.name,
          department: doctor.department,
        }),
      ),
    );

    await manager.save(
      RotaAssignmentEntity,
      rota.schedule.flatMap((day) =>
        day.doctors.map((doctor) =>
          manager.create(RotaAssignmentEntity, {
            rotaId: savedRota.id,
            date: day.date.toISOString().slice(0, 10),
            dayType: day.dayType,
            shiftStart: formatClockTime(doctor.shiftStart ?? day.shiftStart),
            shiftEnd: formatClockTime(doctor.shiftEnd ?? day.shiftEnd),
            durationHours: doctor.durationHours ?? day.durationHours,
            doctorId: doctor.doctorId,
            role: doctor.role ?? 'guardia',
          }),
        ),
      ),
    );

    return manager.findOneOrFail(RotaEntity, {
      where: { id: savedRota.id },
      relations: { assignments: true, doctors: true },
    });
  }

  async getByType(year: number, rotaType: string, doctorId?: string, teamId?: number) {
    const rota = await this.rotaRepository.findOne({
      where: { teamId: await this.teamsService.resolveTeamId(teamId), year, rotaType },
      relations: { assignments: true, doctors: true },
    });
    if (!rota) {
      throw new NotFoundException(`No se ha encontrado ningún cuadrante ${rotaType} para el año ${year}`);
    }

    return this.responseMapper.toResponse(rota, doctorId);
  }

  async getByYear(year: number, teamId?: number) {
    const rotas = await this.rotaRepository.find({
      where: { teamId: await this.teamsService.resolveTeamId(teamId), year },
      relations: { assignments: true, doctors: true },
      order: { rotaType: 'ASC' },
    });
    if (rotas.length === 0) {
      throw new NotFoundException(`No se ha encontrado ningún cuadrante para el año ${year}`);
    }

    return Promise.all(rotas.map((rota) => this.responseMapper.toResponse(rota)));
  }

  /** Borra los cuadrantes AC y AP del año del equipo con sus médicos y asignaciones; los festivos se conservan. */
  async deleteByYear(year: number, teamId?: number): Promise<void> {
    const resolvedTeamId = await this.teamsService.resolveTeamId(teamId);
    await this.dataSource.transaction(async (manager) => {
      const rotas = await manager.find(RotaEntity, { where: { teamId: resolvedTeamId, year } });
      if (rotas.length === 0) {
        throw new NotFoundException(`No se ha encontrado ningún cuadrante para el año ${year}`);
      }
      for (const rota of rotas) {
        await deleteRotaWithChildren(manager, rota.id);
      }
    });
  }

  async replaceDoctor(year: number, rotaType: string, request: ReplaceDoctorDto, teamId?: number) {
    const resolvedTeamId = await this.teamsService.resolveTeamId(teamId);
    return this.dataSource.transaction(async (manager) => {
      const rotaRepository = manager.getRepository(RotaEntity);
      const assignmentRepository = manager.getRepository(RotaAssignmentEntity);

      const rota = await this.findRotaForEdit(rotaRepository, resolvedTeamId, year, rotaType);
      this.assertInPool(rota, request.new_doctor_id);

      const oldRotaType = request.old_rota_type ?? rotaType;
      const oldRota =
        oldRotaType === rotaType ? rota : await this.findRotaForEdit(rotaRepository, resolvedTeamId, year, oldRotaType);

      const assignment = await assignmentRepository.findOne({
        where: {
          rotaId: oldRota.id,
          date: request.date,
          doctorId: request.old_doctor_id,
        },
      });
      if (!assignment) {
        throw new NotFoundException(
          `El médico ${request.old_doctor_id} no está asignado el ${request.date}.`,
        );
      }

      const hasConflict = rota.assignments.some(
        (candidate) =>
          candidate.date === request.date &&
          candidate.doctorId === request.new_doctor_id &&
          candidate.id !== assignment.id,
      );
      if (hasConflict) {
        throw new BadRequestException(
          `El médico ${request.new_doctor_id} ya tiene una asignación el ${request.date}.`,
        );
      }

      if (oldRota === rota) {
        assignment.doctorId = request.new_doctor_id;
        await assignmentRepository.save(assignment);
      } else {
        // Entre grupos sólo se cambia el refuerzo, que es común a AC y AP: la fila sale
        // del cuadrante del médico saliente y entra en el del entrante con el horario
        // de refuerzo.
        if (assignment.role !== 'refuerzo') {
          throw new BadRequestException(
            `Sólo se puede sustituir un refuerzo de otro grupo; ${request.old_doctor_id} hace la guardia ${oldRotaType} el ${request.date}.`,
          );
        }
        await assignmentRepository.remove(assignment);
        await assignmentRepository.save(
          this.newRefuerzo(assignmentRepository, rota.id, request.date, assignment.dayType, request.new_doctor_id),
        );
      }

      return this.refreshedResponse(rotaRepository, rota.id);
    });
  }

  async addDoctor(year: number, rotaType: string, request: AddDoctorDto, teamId?: number) {
    const resolvedTeamId = await this.teamsService.resolveTeamId(teamId);
    return this.dataSource.transaction(async (manager) => {
      const rotaRepository = manager.getRepository(RotaEntity);
      const assignmentRepository = manager.getRepository(RotaAssignmentEntity);

      const rota = await this.findRotaForEdit(rotaRepository, resolvedTeamId, year, rotaType);
      this.assertInPool(rota, request.doctor_id);

      const dayAssignments = rota.assignments.filter((candidate) => candidate.date === request.date);
      if (dayAssignments.length === 0) {
        throw new NotFoundException(
          `No hay ninguna guardia el ${request.date} a la que añadir un médico.`,
        );
      }
      if (dayAssignments.some((candidate) => candidate.doctorId === request.doctor_id)) {
        throw new BadRequestException(
          `El médico ${request.doctor_id} ya tiene una asignación el ${request.date}.`,
        );
      }

      // Tanto en AC como en AP se añade un refuerzo, con el horario de refuerzo del día.
      await assignmentRepository.save(
        this.newRefuerzo(assignmentRepository, rota.id, request.date, dayAssignments[0].dayType, request.doctor_id),
      );

      return this.refreshedResponse(rotaRepository, rota.id);
    });
  }

  private async findRotaForEdit(
    rotaRepository: Repository<RotaEntity>,
    teamId: number,
    year: number,
    rotaType: string,
  ) {
    const rota = await rotaRepository.findOne({
      where: { teamId, year, rotaType },
      relations: { assignments: true, doctors: true },
    });
    if (!rota) {
      throw new NotFoundException(`No se ha encontrado ningún cuadrante ${rotaType} para el año ${year}`);
    }
    return rota;
  }

  private assertInPool(rota: RotaEntity, doctorId: string): void {
    if (!(rota.pool as DoctorInput[]).some((doctor) => doctor.id === doctorId)) {
      throw new BadRequestException(`El médico ${doctorId} no pertenece al grupo original.`);
    }
  }

  private newRefuerzo(
    assignmentRepository: Repository<RotaAssignmentEntity>,
    rotaId: number,
    date: string,
    dayType: string,
    doctorId: string,
  ): RotaAssignmentEntity {
    const shift = refuerzoShiftDetails(fromIsoDate(date), dayType as DayType);
    return assignmentRepository.create({
      rotaId,
      date,
      dayType,
      shiftStart: shift.shiftStart,
      shiftEnd: shift.shiftEnd,
      durationHours: shift.durationHours,
      doctorId,
      role: 'refuerzo',
    });
  }

  private async refreshedResponse(rotaRepository: Repository<RotaEntity>, rotaId: number) {
    const refreshed = await rotaRepository.findOneOrFail({
      where: { id: rotaId },
      relations: { assignments: true, doctors: true },
    });
    return this.responseMapper.toResponse(refreshed);
  }
}
