import { Injectable, inject, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { Doctor, RotaType } from '../models/doctor.model';
import { Team } from '../models/team.model';
import { TeamsService } from './teams.service';

/** Lista inicial con la que empieza un equipo sin médicos (también el «Equipo principal»). */
const SEED_DOCTORS_URL = 'assets/doctors.json';

@Injectable({ providedIn: 'root' })
export class DoctorPoolService {
  private readonly http = inject(HttpClient);
  private readonly teamsService = inject(TeamsService);

  /** Médicos del equipo cargado, en el orden en que se muestran */
  readonly doctors = signal<Doctor[]>([]);

  /** Equipo cuyos médicos están cargados */
  private teamId: number | null = null;

  /** Último orden de generación de cada grupo; se reaplica si los médicos llegan después. */
  private readonly savedOrder: Partial<Record<RotaType, string[]>> = {};

  /** Ids en el orden original (el de la lista del equipo), al que vuelve `resetOrder`. */
  private originalOrder: string[] = [];

  readonly acDoctors = computed(() =>
    this.doctors().filter((d) => d.rota_type === 'AC')
  );

  readonly apDoctors = computed(() =>
    this.doctors().filter((d) => d.rota_type === 'AP')
  );

  /**
   * Carga los médicos del equipo. Un equipo sin médicos empieza con la lista inicial
   * (`assets/doctors.json`), que se guarda como lista del equipo.
   */
  loadTeam(team: Team): void {
    this.teamId = team.id;
    this.forgetSavedOrder();
    if (team.doctors.length > 0) {
      this.setDoctors(team.doctors);
      return;
    }
    this.setDoctors([]);
    this.http.get<Doctor[]>(SEED_DOCTORS_URL).subscribe({
      next: (docs) => {
        if (this.teamId !== team.id) return;
        this.setDoctors(docs);
        this.teamsService.setDoctors(team.id, docs).subscribe({
          error: (err) => console.error('No se ha podido guardar la lista inicial del equipo', err),
        });
      },
      error: (err) => console.error('No se ha podido cargar la lista inicial de médicos', err),
    });
  }

  /** Sustituye la lista de médicos del equipo cargado (p. ej. la de un fichero subido). */
  replaceDoctors(doctors: Doctor[]): Observable<Team> {
    return this.teamsService.setDoctors(this.requireTeamId(), doctors).pipe(
      tap((team) => {
        this.forgetSavedOrder();
        this.setDoctors(team.doctors);
      }),
    );
  }

  /** Añade un médico a la lista del equipo cargado y lo guarda. */
  addDoctor(doctor: Doctor): Observable<Team> {
    const byId = new Map(this.doctors().map((d) => [d.id, d]));
    const list = [...this.originalOrder.map((id) => byId.get(id)!), doctor];
    return this.teamsService.setDoctors(this.requireTeamId(), list).pipe(
      tap(() => {
        this.originalOrder.push(doctor.id);
        this.doctors.update((current) => [...current, doctor]);
      }),
    );
  }

  /** Olvida el orden de generación y devuelve cada grupo a su orden original. */
  resetOrder(): void {
    this.forgetSavedOrder();
    for (const rotaType of ['AC', 'AP'] as RotaType[]) {
      this.sortGroup(rotaType, this.originalOrder);
    }
  }

  /**
   * Reordena los médicos del grupo según `orderedIds` (el orden con que se generó
   * el cuadrante). Los que no aparecen en la lista conservan su orden y van al final.
   */
  applyOrder(rotaType: RotaType, orderedIds: string[]): void {
    this.savedOrder[rotaType] = orderedIds;
    this.sortGroup(rotaType, orderedIds);
  }

  getDoctorsByType(rotaType: RotaType): Doctor[] {
    return this.doctors().filter((d) => d.rota_type === rotaType);
  }

  private setDoctors(docs: Doctor[]): void {
    this.doctors.set(docs);
    this.originalOrder = docs.map((d) => d.id);
    for (const rotaType of Object.keys(this.savedOrder) as RotaType[]) {
      this.sortGroup(rotaType, this.savedOrder[rotaType] ?? []);
    }
  }

  private forgetSavedOrder(): void {
    for (const rotaType of Object.keys(this.savedOrder) as RotaType[]) {
      delete this.savedOrder[rotaType];
    }
  }

  private requireTeamId(): number {
    if (this.teamId === null) {
      throw new Error('No hay ningún equipo cargado');
    }
    return this.teamId;
  }

  private sortGroup(rotaType: RotaType, orderedIds: string[]): void {
    const position = new Map(orderedIds.map((id, index) => [id, index]));
    this.doctors.update((current) => {
      const sorted = current
        .filter((d) => d.rota_type === rotaType)
        .sort((a, b) => (position.get(a.id) ?? Infinity) - (position.get(b.id) ?? Infinity));
      // Cada médico del grupo ocupa el hueco que dejó otro del mismo grupo en la lista global.
      let next = 0;
      return current.map((d) => (d.rota_type === rotaType ? sorted[next++] : d));
    });
  }
}
