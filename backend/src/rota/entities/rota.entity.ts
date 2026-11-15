import {
  Column,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';

import { DoctorInput } from '../../scheduling/scheduling.types';
import { RotaAssignmentEntity } from './rota-assignment.entity';
import { RotaDoctorEntity } from './rota-doctor.entity';

const isSqlJs = (process.env.DB_TYPE ?? '') === 'sqljs';

@Entity({ name: 'rotas' })
@Unique('uq_rotas_team_year_rota_type', ['teamId', 'year', 'rotaType'])
export class RotaEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  // Equipo dueño del cuadrante: cada equipo tiene sus propios cuadrantes AC y AP por año.
  @Column({ name: 'team_id', type: 'int' })
  teamId!: number;

  @Column({ type: 'int' })
  year!: number;

  @Column({ name: 'rota_type', type: 'varchar', length: 2 })
  rotaType!: string;

  @Column({ type: 'varchar', length: 100 })
  city!: string;

  @Column({
    name: 'generated_at',
    type: 'datetime',
    precision: isSqlJs ? undefined : 3,
  })
  generatedAt!: Date;

  @Column({
    type: isSqlJs ? 'simple-json' : 'json',
  })
  pool!: DoctorInput[];

  @Column({ name: 'doctors_per_day', type: 'int' })
  doctorsPerDay!: number;

  // Método de asignación con el que se generó el cuadrante: todos los nuevos son
  // 'single-wheel'; los antiguos pueden conservar 'wheels' o 'balanced', ya retirados.
  @Column({ type: 'varchar', length: 20, default: 'single-wheel' })
  strategy!: string;

  @OneToMany(() => RotaDoctorEntity, (doctor) => doctor.rota)
  doctors!: RotaDoctorEntity[];

  @OneToMany(() => RotaAssignmentEntity, (assignment) => assignment.rota)
  assignments!: RotaAssignmentEntity[];
}
