import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DoctorPoolComponent, DoctorsFile } from './features/doctor-pool/doctor-pool.component';
import { TeamSelectorComponent } from './features/teams/team-selector.component';
import { CalendarComponent } from './features/calendar/calendar.component';
import { StatsPanelComponent } from './features/stats/stats-panel.component';
import { ConfirmDialogComponent } from './shared/confirm-dialog.component';
import { DayRefuerzo, ReplaceDoctorDialogComponent, ReplaceDoctorChoice } from './shared/replace-doctor-dialog.component';
import { DayContextMenuComponent } from './shared/day-context-menu.component';
import { NotificationComponent } from './shared/notification.component';
import { ConfigService } from './core/services/config.service';
import { RotaService } from './core/services/rota.service';
import { HolidaysService } from './core/services/holidays.service';
import { DoctorPoolService } from './core/services/doctor-pool.service';
import { NotificationService } from './core/services/notification.service';
import { TeamsService } from './core/services/teams.service';
import { extractErrorMessage } from './core/http-error';
import { Doctor, RotaType } from './core/models/doctor.model';
import { DayAssignment, GeneratedStrategy, DoctorStats, DoctorRef, MergedDayAssignment, ReplaceRequest, RotaResponse } from './core/models/rota.model';
import { ReplacementEvent } from './features/calendar/day-cell.component';
import { HttpErrorResponse } from '@angular/common/http';
import { CdkDropListGroup } from '@angular/cdk/drag-drop';

@Component({
  selector: 'app-root',
  imports: [
    DoctorPoolComponent,
    TeamSelectorComponent,
    CalendarComponent,
    StatsPanelComponent,
    ConfirmDialogComponent,
    ReplaceDoctorDialogComponent,
    DayContextMenuComponent,
    NotificationComponent,
    CdkDropListGroup,
  ],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App implements OnInit {
  private readonly configService = inject(ConfigService);
  private readonly rotaService = inject(RotaService);
  private readonly holidaysService = inject(HolidaysService);
  private readonly doctorPoolService = inject(DoctorPoolService);
  private readonly notificationService = inject(NotificationService);
  private readonly teamsService = inject(TeamsService);

  /** Equipo activo: la lista de médicos y los cuadrantes son los suyos */
  protected readonly teamId = computed(() => this.teamsService.selectedTeamId());
  protected readonly teamName = computed(() => this.teamsService.selectedTeam()?.name ?? '');

  /** Lista de médicos leída de un fichero, a la espera de confirmar la sustitución */
  protected readonly pendingUpload = signal<DoctorsFile | null>(null);
  protected readonly uploadMessage = computed(() => {
    const upload = this.pendingUpload();
    if (!upload) return '';
    const count = (rotaType: RotaType) => upload.doctors.filter((d) => d.rota_type === rotaType).length;
    const current = this.doctorPoolService.doctors().length;
    const kept = this.hasData()
      ? ' Los cuadrantes ya generados conservan sus médicos hasta que los regenere.'
      : '';
    return `Se sustituirá la lista del equipo «${this.teamName()}» (${current} ${current === 1 ? 'médico' : 'médicos'}) por la de «${upload.fileName}»: ${upload.doctors.length} ${upload.doctors.length === 1 ? 'médico' : 'médicos'}, ${count('AC')} AC y ${count('AP')} AP.${kept} ¿Desea continuar?`;
  });

  protected readonly city = signal('');
  protected readonly selectedYear = signal(new Date().getFullYear());
  protected readonly activePoolTab = signal<RotaType>('AC');
  protected readonly showStats = signal(false);
  protected readonly showConfirmDialog = signal(false);
  protected readonly showResetDialog = signal(false);
  protected readonly loading = signal(false);
  protected readonly isGenerating = signal(false);
  protected readonly exporting = signal(false);
  protected readonly currentMonth = signal(new Date().getMonth() + 1);

  protected readonly contextMenuOpen = signal(false);
  protected readonly contextMenuPosition = signal<{ x: number; y: number }>({ x: 0, y: 0 });
  protected readonly contextMenuDate = signal('');
  protected readonly contextMenuDayType = signal('');

  readonly manualHolidayDates = computed(() => this.holidaysService.manualHolidayDates());
  readonly allHolidayDates = computed(() => this.holidaysService.allHolidayDates());
  readonly specialHolidayDates = computed(() => this.holidaysService.specialHolidayDates());

  // Dual rota state
  protected readonly acSchedule = signal<DayAssignment[]>([]);
  protected readonly apSchedule = signal<DayAssignment[]>([]);
  protected readonly acStats = signal<DoctorStats[]>([]);
  protected readonly apStats = signal<DoctorStats[]>([]);
  protected readonly hasAcRota = signal(false);
  protected readonly hasApRota = signal(false);

  // Método con el que se generó cada cuadrante cargado; sólo sirve para mostrar el aviso de los métodos retirados
  protected readonly acStrategy = signal<GeneratedStrategy>('single-wheel');
  protected readonly apStrategy = signal<GeneratedStrategy>('single-wheel');
  protected readonly generatedStrategy = computed<GeneratedStrategy | null>(() => {
    if (this.hasAcRota()) return this.acStrategy();
    if (this.hasApRota()) return this.apStrategy();
    return null;
  });

  // Drag-and-drop replacement state
  protected readonly pendingReplacement = signal<ReplacementEvent | null>(null);
  /** Fecha del día soltado en formato largo, p. ej. «jueves, 1 de enero» */
  protected readonly pendingDateLabel = computed(() => {
    const pending = this.pendingReplacement();
    if (!pending) return '';
    return new Date(pending.date + 'T00:00:00').toLocaleDateString('es-ES', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    });
  });
  /** Guardia de su grupo que el médico soltado puede sustituir */
  protected readonly pendingGuardia = computed<DoctorRef | null>(() => {
    const pending = this.pendingReplacement();
    if (!pending) return null;
    return this.sectionDoctors(this.activePoolTab(), pending).find((doctor) => doctor.role !== 'refuerzo') ?? null;
  });
  /** Refuerzos del día de los dos grupos: el bloque de refuerzo es común */
  protected readonly pendingRefuerzos = computed<DayRefuerzo[]>(() => {
    const pending = this.pendingReplacement();
    if (!pending) return [];
    const refuerzosOf = (doctors: DoctorRef[], rotaType: RotaType) =>
      doctors.filter((doctor) => doctor.role === 'refuerzo').map((doctor) => ({ doctor, rotaType }));
    return [...refuerzosOf(pending.apDoctors, 'AP'), ...refuerzosOf(pending.acDoctors, 'AC')];
  });

  protected readonly activePoolDoctors = computed(() => {
    const tab = this.activePoolTab();
    return tab === 'AC'
      ? this.doctorPoolService.acDoctors()
      : this.doctorPoolService.apDoctors();
  });

  // Se generan juntos: basta con que exista uno para pedir confirmación.
  protected readonly hasExistingRota = computed(() => this.hasAcRota() || this.hasApRota());

  protected readonly activeStats = computed(() => {
    const tab = this.activePoolTab();
    return tab === 'AC' ? this.acStats() : this.apStats();
  });

  // Merged schedule for the calendar: combine AC + AP by date
  protected readonly mergedSchedule = computed(() => {
    const acMap = new Map<string, DayAssignment>();
    for (const day of this.acSchedule()) {
      acMap.set(day.date, day);
    }
    const apMap = new Map<string, DayAssignment>();
    for (const day of this.apSchedule()) {
      apMap.set(day.date, day);
    }

    // Union of all dates
    const allDates = new Set([...acMap.keys(), ...apMap.keys()]);
    const merged: MergedDayAssignment[] = [];

    for (const dateStr of [...allDates].sort()) {
      const ac = acMap.get(dateStr);
      const ap = apMap.get(dateStr);
      const ref = ac ?? ap!;
      merged.push({
        date: dateStr,
        day_type: ref.day_type,
        shift_start: ref.shift_start,
        shift_end: ref.shift_end,
        duration_hours: ref.duration_hours,
        acDoctors: ac?.doctors ?? [],
        apDoctors: ap?.doctors ?? [],
      });
    }

    return merged;
  });

  protected readonly hasData = computed(() =>
    this.hasAcRota() || this.hasApRota()
  );

  protected readonly confirmMessage = computed(() =>
    `Los cuadrantes AC y AP actuales de ${this.selectedYear()} del equipo «${this.teamName()}» se sustituirán por unos nuevos. Esta acción no se puede deshacer. ¿Desea continuar?`
  );

  protected readonly resetMessage = computed(() =>
    `Se borrarán los cuadrantes AC y AP de ${this.selectedYear()} del equipo «${this.teamName()}», con todas sus guardias, refuerzos y cambios manuales. Los festivos se conservan. Esta acción no se puede deshacer. ¿Desea continuar?`
  );

  ngOnInit(): void {
    this.teamsService.load().subscribe({
      next: () => {
        const teamId = this.teamsService.initialTeamId();
        if (teamId !== null) {
          this.onTeamSelected(teamId);
        }
      },
      error: (err) => {
        console.error('Failed to load teams', err);
        this.notificationService.show(
          this.extractErrorMessage(err, 'No se han podido cargar los equipos'),
          'error'
        );
      },
    });
    this.configService.getConfig().subscribe({
      next: (config) => {
        this.city.set(config.city);
        this.holidaysService.loadHolidays(this.selectedYear());
      },
      error: (err) => {
        console.error('Failed to load config', err);
        this.notificationService.show(
          this.extractErrorMessage(err, 'No se ha podido cargar la configuración de la aplicación'),
          'error'
        );
      },
    });
  }

  /** Cambia al equipo indicado: carga su lista de médicos y sus cuadrantes del año. */
  onTeamSelected(teamId: number): void {
    this.teamsService.select(teamId);
    const team = this.teamsService.selectedTeam();
    if (!team) return;
    this.doctorPoolService.loadTeam(team);
    this.loadRotas(this.selectedYear());
  }

  onDoctorsFileLoaded(upload: DoctorsFile): void {
    this.pendingUpload.set(upload);
  }

  onDoctorsFileError(message: string): void {
    this.notificationService.show(message, 'error');
  }

  onConfirmUpload(): void {
    const upload = this.pendingUpload();
    this.pendingUpload.set(null);
    if (!upload) return;
    this.doctorPoolService.replaceDoctors(upload.doctors).subscribe({
      next: (team) => {
        const regenerate = this.hasData() ? ' Regenere los cuadrantes para usarla.' : '';
        this.notificationService.show(
          `Lista de médicos del equipo «${team.name}» sustituida: ${team.doctors.length} ${team.doctors.length === 1 ? 'médico' : 'médicos'}.${regenerate}`,
          this.hasData() ? 'warning' : 'success'
        );
      },
      error: (err) => {
        console.error('Failed to replace doctors', err);
        this.notificationService.show(
          this.extractErrorMessage(err, 'No se ha podido sustituir la lista de médicos'),
          'error'
        );
      },
    });
  }

  toggleStats(): void {
    this.showStats.update((v) => !v);
  }

  onExportRota(): void {
    const teamId = this.teamId();
    if (teamId === null) return;
    const year = this.selectedYear();
    const fileTeam = this.teamName().replace(/[\\/:*?"<>|]+/g, '').trim().replace(/\s+/g, '-');
    this.exporting.set(true);
    this.rotaService.exportRotas(teamId, year).subscribe({
      next: (blob) => {
        this.downloadBlob(blob, `cuadrante-guardias-${fileTeam ? fileTeam + '-' : ''}${year}.xlsx`);
        this.exporting.set(false);
      },
      error: async (err: HttpErrorResponse) => {
        console.error('Failed to export rota', err);
        // Con responseType 'blob' el cuerpo del error también llega como Blob
        const body = await this.parseBlobError(err);
        this.exporting.set(false);
        this.notificationService.show(
          this.extractErrorMessage({ error: body }, 'No se ha podido exportar el cuadrante'),
          'error'
        );
      },
    });
  }

  private downloadBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }

  private async parseBlobError(err: HttpErrorResponse): Promise<unknown> {
    try {
      return JSON.parse(await (err.error as Blob).text());
    } catch {
      return undefined;
    }
  }

  onMonthChange(month: number): void {
    this.currentMonth.set(month);
  }

  onDayContextMenu(event: { date: string; dayType: string; x: number; y: number }): void {
    this.contextMenuDate.set(event.date);
    this.contextMenuDayType.set(event.dayType);
    this.contextMenuPosition.set({ x: event.x, y: event.y });
    this.contextMenuOpen.set(true);
  }

  onCloseContextMenu(): void {
    this.contextMenuOpen.set(false);
  }

  onContextMenuAction(event: { action: 'mark' | 'unmark'; date: string }): void {
    const date = event.date;
    const year = this.selectedYear();
    this.contextMenuOpen.set(false);

    if (event.action === 'mark') {
      this.holidaysService.markHoliday(year, date, 'Festivo Manual').subscribe({
        next: () => {
          this.notificationService.show(
            `El día ${date} se ha marcado como festivo manual. Los cuadrantes existentes pueden no reflejar este cambio. Regenere el cuadrante para actualizar las asignaciones.`,
            'warning'
          );
        },
        error: (err) => {
          this.notificationService.show(
            this.extractErrorMessage(err, 'Error al marcar festivo manual'),
            'error'
          );
        },
      });
    } else {
      this.holidaysService.unmarkHoliday(year, date).subscribe({
        next: () => {
          this.notificationService.show(
            `El día ${date} ya no es festivo manual. Los cuadrantes existentes pueden no reflejar este cambio. Regenere el cuadrante para actualizar las asignaciones.`,
            'warning'
          );
        },
        error: (err) => {
          this.notificationService.show(
            this.extractErrorMessage(err, 'Error al desmarcar festivo manual'),
            'error'
          );
        },
      });
    }
  }

  onPoolTabChange(tab: RotaType): void {
    this.activePoolTab.set(tab);
  }

  onYearChange(year: number): void {
    this.selectedYear.set(year);
    this.holidaysService.loadHolidays(year);
    this.loadRotas(year);
  }

  onGenerateRota(): void {
    if (this.hasExistingRota()) {
      this.showConfirmDialog.set(true);
    } else {
      this.doGenerateRota();
    }
  }

  onConfirmRegenerate(): void {
    this.showConfirmDialog.set(false);
    this.doGenerateRota();
  }

  onCancelRegenerate(): void {
    this.showConfirmDialog.set(false);
  }

  onResetRotas(): void {
    this.showResetDialog.set(true);
  }

  onConfirmReset(): void {
    this.showResetDialog.set(false);
    const teamId = this.teamId();
    if (teamId === null) return;
    const year = this.selectedYear();
    this.loading.set(true);
    this.rotaService.deleteRotas(teamId, year).subscribe({
      next: () => {
        this.clearRotas();
        this.loading.set(false);
        this.notificationService.show(`Cuadrantes AC y AP de ${year} del equipo «${this.teamName()}» borrados`, 'success');
      },
      error: (err) => {
        console.error('Failed to delete rotas', err);
        this.loading.set(false);
        this.notificationService.show(
          this.extractErrorMessage(err, 'No se han podido borrar los cuadrantes'),
          'error'
        );
      },
    });
  }

  onAddDoctor(doctor: Doctor): void {
    this.doctorPoolService.addDoctor(doctor).subscribe({
      error: (err) => {
        console.error('Failed to add doctor to team', err);
        this.notificationService.show(
          this.extractErrorMessage(err, 'No se ha podido añadir el médico al equipo'),
          'error'
        );
      },
    });
  }

  onDoctorDropped(event: ReplacementEvent): void {
    const assignedDoctors = this.sectionDoctors(this.activePoolTab(), event);
    if (assignedDoctors.length === 0) {
      this.notificationService.show(
        'No hay ninguna sustitución disponible para ese médico en este día.',
        'warning'
      );
      return;
    }
    if (assignedDoctors.some((doctor) => doctor.doctor_id === event.newDoctor.id)) {
      this.notificationService.show(
        'Ese médico ya tiene una guardia o un refuerzo este día.',
        'warning'
      );
      return;
    }
    this.pendingReplacement.set(event);
  }

  onAddDoctorToDay(): void {
    const pending = this.pendingReplacement();
    if (!pending) return;
    this.pendingReplacement.set(null);
    this.doAdd(this.activePoolTab(), pending.date, pending.newDoctor.id);
  }

  onReplaceDoctorSelected(choice: ReplaceDoctorChoice): void {
    const replacement = this.pendingReplacement();
    if (!replacement) return;
    this.pendingReplacement.set(null);
    this.doReplace(this.activePoolTab(), replacement.date, choice, replacement.newDoctor.id);
  }

  onCancelReplacement(): void {
    this.pendingReplacement.set(null);
  }

  private doAdd(rotaType: RotaType, dateStr: string, doctorId: string): void {
    const teamId = this.teamId();
    if (teamId === null) return;
    this.loading.set(true);

    this.rotaService
      .addDoctor(teamId, this.selectedYear(), rotaType, { date: dateStr, doctor_id: doctorId })
      .subscribe({
        next: (rota) => {
          this.applyRota(rota);
          this.loading.set(false);
          if (rota.warnings?.length) {
            this.notificationService.show(rota.warnings.join('\n'), 'warning');
          }
        },
        error: (err) => {
          console.error('Failed to add doctor', err);
          this.loading.set(false);
          this.notificationService.show(
            this.extractErrorMessage(err, 'No se ha podido añadir al médico'),
            'error'
          );
        },
      });
  }

  private doReplace(
    rotaType: RotaType,
    dateStr: string,
    oldDoctor: ReplaceDoctorChoice,
    newDoctorId: string,
  ): void {
    const request: ReplaceRequest = {
      date: dateStr,
      old_doctor_id: oldDoctor.doctor_id,
      new_doctor_id: newDoctorId,
    };
    // Un refuerzo del otro grupo sale de su cuadrante: hay que recargar los dos.
    const crossRota = oldDoctor.rota_type !== rotaType;
    if (crossRota) {
      request.old_rota_type = oldDoctor.rota_type;
    }

    const teamId = this.teamId();
    if (teamId === null) return;
    this.loading.set(true);

    this.rotaService.replaceDoctor(teamId, this.selectedYear(), rotaType, request).subscribe({
      next: (rota) => {
        if (crossRota) {
          this.loadRotas(this.selectedYear());
        } else {
          this.applyRota(rota);
          this.loading.set(false);
        }
        if (rota.warnings?.length) {
          this.notificationService.show(rota.warnings.join('\n'), 'warning');
        }
      },
      error: (err) => {
        console.error('Failed to replace doctor', err);
        this.loading.set(false);
        this.notificationService.show(
          this.extractErrorMessage(err, 'No se ha podido sustituir al médico'),
          'error'
        );
      },
    });
  }

  private loadRotas(year: number): void {
    const teamId = this.teamId();
    if (teamId === null) return;
    this.loading.set(true);
    // Si entretanto se cambia de equipo o de año, la respuesta ya no vale.
    const isCurrent = () => this.teamId() === teamId && this.selectedYear() === year;
    this.rotaService.getRotas(teamId, year).subscribe({
      next: (rotas) => {
        if (!isCurrent()) return;
        this.clearRotas();
        for (const rota of rotas) {
          this.applyRota(rota);
        }
        this.loading.set(false);
      },
      error: (err: HttpErrorResponse) => {
        if (!isCurrent()) return;
        this.clearRotas();
        this.loading.set(false);
        if (err.status !== 404) {
          this.notificationService.show(
            this.extractErrorMessage(err, 'No se ha podido cargar el cuadrante'),
            'error'
          );
        }
      },
    });
  }

  private clearRotas(): void {
    this.acSchedule.set([]);
    this.apSchedule.set([]);
    this.acStats.set([]);
    this.apStats.set([]);
    this.hasAcRota.set(false);
    this.hasApRota.set(false);
    // Sin cuadrante no hay orden barajado que mostrar: se vuelve al original.
    this.doctorPoolService.resetOrder();
  }

  private applyRota(rota: RotaResponse): void {
    if (rota.doctor_order?.length) {
      this.doctorPoolService.applyOrder(rota.rota_type, rota.doctor_order);
    }
    if (rota.rota_type === 'AC') {
      this.acSchedule.set(rota.schedule);
      this.acStats.set(rota.stats.doctors);
      this.hasAcRota.set(true);
      // Sin strategy, el cuadrante es anterior a los métodos: se hizo con el equilibrado.
      this.acStrategy.set(rota.strategy ?? 'balanced');
    } else {
      this.apSchedule.set(rota.schedule);
      this.apStats.set(rota.stats.doctors);
      this.hasApRota.set(true);
      this.apStrategy.set(rota.strategy ?? 'balanced');
    }
  }

  /** Médicos (guardia y refuerzos) del grupo indicado en el día soltado */
  private sectionDoctors(rotaType: RotaType, event: ReplacementEvent): DoctorRef[] {
    return rotaType === 'AP' ? event.apDoctors : event.acDoctors;
  }

  private doGenerateRota(): void {
    const acPool = this.doctorPoolService.getDoctorsByType('AC');
    const apPool = this.doctorPoolService.getDoctorsByType('AP');
    const teamId = this.teamId();
    if (teamId === null) return;
    const year = this.selectedYear();
    this.loading.set(true);
    this.isGenerating.set(true);
    this.rotaService.generateRotas(teamId, year, acPool, apPool).subscribe({
      next: (rotas) => {
        for (const rota of rotas) {
          this.applyRota(rota);
        }
        this.loading.set(false);
        this.isGenerating.set(false);
        const warnings = rotas.flatMap((rota) =>
          (rota.warnings ?? []).map((warning) => `${rota.rota_type}: ${warning}`),
        );
        if (warnings.length) {
          this.notificationService.show(
            `Cuadrantes AC y AP generados con advertencias:\n${warnings.join('\n')}`,
            'warning'
          );
        } else {
          this.notificationService.show(
            `Cuadrantes AC y AP generados correctamente para ${year} (equipo «${this.teamName()}»)`,
            'success'
          );
        }
      },
      error: (err) => {
        console.error('Failed to generate rota', err);
        this.loading.set(false);
        this.isGenerating.set(false);
        this.notificationService.show(
          this.extractErrorMessage(err, 'No se han podido generar los cuadrantes'),
          'error'
        );
      },
    });
  }

  private extractErrorMessage(err: HttpErrorResponse | any, fallback: string): string {
    return extractErrorMessage(err, fallback);
  }
}
