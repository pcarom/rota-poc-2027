import { Component, computed, input, output, signal } from '@angular/core';
import { DoctorCardComponent } from './doctor-card.component';
import { AddDoctorDialogComponent } from './add-doctor-dialog.component';
import { Doctor, RotaType } from '../../core/models/doctor.model';
import {
  GeneratedStrategy,
  RETIRED_STRATEGY_LABELS,
} from '../../core/models/rota.model';
import { CdkDropList } from '@angular/cdk/drag-drop';
import { parseDoctorFile } from '../../core/parsers/doctor-file.parser';

/** Lista de médicos leída de un fichero subido, pendiente de confirmar */
export interface DoctorsFile {
  fileName: string;
  doctors: Doctor[];
}

@Component({
  selector: 'app-doctor-pool',
  standalone: true,
  imports: [DoctorCardComponent, AddDoctorDialogComponent, CdkDropList],
  template: `
    <section class="doctor-pool">
      <ng-content select="[poolHeader]" />
      <h3 class="pool-title">Grupo de médicos</h3>

      <div class="pool-tabs">
        <button
          class="tab-btn"
          [class.tab-active]="activeTab() === 'AC'"
          [class.tab-ac]="activeTab() === 'AC'"
          (click)="onTabClick('AC')"
        >AC</button>
        <button
          class="tab-btn"
          [class.tab-active]="activeTab() === 'AP'"
          [class.tab-ap]="activeTab() === 'AP'"
          (click)="onTabClick('AP')"
        >AP</button>
      </div>

      <div class="doctor-list" cdkDropList>
        @for (doctor of doctors(); track doctor.id) {
          <app-doctor-card [doctor]="doctor" />
        }
      </div>

      @if (showAddDialog()) {
        <app-add-doctor-dialog
          [defaultRotaType]="activeTab()"
          (doctorAdded)="onDoctorAdded($event)"
          (cancelled)="showAddDialog.set(false)"
        />
      }

      <div class="pool-actions">
        <div class="list-actions">
          <button class="btn-add-doctor" (click)="onAddDoctorClick()">
            + Añadir médico
          </button>
          <button
            class="btn-upload"
            type="button"
            [disabled]="isLoading()"
            title="Sustituye la lista del equipo por la de un fichero JSON o CSV con las columnas nombre, departamento y grupo (AC o AP)"
            (click)="fileInput.click()"
          >
            Cargar lista
          </button>
          <input
            #fileInput
            class="file-input"
            type="file"
            accept=".json,.csv,.txt,application/json,text/csv"
            (change)="onFileSelected(fileInput)"
          />
        </div>
        <button
          class="btn-generate"
          [class.btn-loading]="isLoading()"
          [disabled]="isLoading()"
          (click)="generateRota.emit()"
        >
          @if (isLoading()) {
            <span class="btn-spinner"></span>
          }
          {{ hasExistingRota() ? 'Regenerar cuadrante' : 'Generar cuadrante' }}
        </button>
        @if (retiredStrategyLabel(); as label) {
          <p class="generated-with">Generado con: {{ label }}</p>
        }
      </div>
    </section>
  `,
  styles: [`
    .doctor-pool {
      width: 280px;
      min-width: 280px;
      display: flex;
      flex-direction: column;
      border-right: 1px solid #e0e0e0;
      background: #fafafa;
      height: 100%;
      overflow: hidden;
    }

    .pool-title {
      margin: 0;
      padding: 0.75rem 1rem;
      font-size: 0.95rem;
      font-weight: 700;
      color: #1a237e;
      border-bottom: 1px solid #e0e0e0;
      background: #e8eaf6;
    }

    .pool-tabs {
      display: flex;
      border-bottom: 1px solid #e0e0e0;
      flex-shrink: 0;
    }

    .tab-btn {
      flex: 1;
      padding: 0.55rem;
      font-size: 0.8rem;
      font-weight: 700;
      border: none;
      background: #f5f5f5;
      color: #888;
      cursor: pointer;
      transition: all 0.15s ease;
      border-bottom: 3px solid transparent;
    }

    .tab-btn:hover {
      background: #eee;
    }

    .tab-btn.tab-active.tab-ac {
      background: #e3f2fd;
      color: #1565c0;
      border-bottom-color: #1565c0;
    }

    .tab-btn.tab-active.tab-ap {
      background: #e8f5e9;
      color: #2e7d32;
      border-bottom-color: #2e7d32;
    }

    .doctor-list {
      flex: 1;
      overflow-y: auto;
      min-height: 0;
      padding: 0.75rem;
    }

    .pool-actions {
      padding: 0.75rem;
      border-top: 1px solid #e0e0e0;
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      flex-shrink: 0;
    }

    .generated-with {
      margin: 0;
      font-size: 0.75rem;
      color: #777;
      text-align: center;
    }

    .list-actions {
      display: flex;
      gap: 0.5rem;
    }

    .file-input {
      display: none;
    }

    .btn-upload {
      flex: 1;
      padding: 0.55rem;
      font-size: 0.8rem;
      font-weight: 600;
      border-radius: 6px;
      cursor: pointer;
      border: 1px solid #9fa8da;
      background: #fff;
      color: #1a237e;
      white-space: nowrap;
    }

    .btn-upload:hover:not(:disabled) {
      background: #e8eaf6;
    }

    .btn-upload:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }

    .btn-add-doctor,
    .btn-generate {
      width: 100%;
      padding: 0.55rem;
      font-size: 0.8rem;
      font-weight: 600;
      border-radius: 6px;
      cursor: pointer;
      transition: background-color 0.15s ease;
    }

    .btn-add-doctor {
      flex: 1.3;
      width: auto;
      white-space: nowrap;
      border: 1px dashed #999;
      background: #fff;
      color: #555;
    }

    .btn-add-doctor:hover {
      background: #f0f0f0;
      border-color: #666;
    }

    .btn-generate {
      border: none;
      background: #1a237e;
      color: #fff;
    }

    .btn-generate:hover:not(:disabled) {
      background: #283593;
    }

    .btn-generate:disabled {
      opacity: 0.7;
      cursor: not-allowed;
    }

    .btn-loading {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.4rem;
    }

    .btn-spinner {
      display: inline-block;
      width: 14px;
      height: 14px;
      border: 2px solid rgba(255, 255, 255, 0.3);
      border-top-color: #fff;
      border-radius: 50%;
      animation: btn-spin 0.6s linear infinite;
      flex-shrink: 0;
    }

    @keyframes btn-spin {
      to { transform: rotate(360deg); }
    }
  `],
})
export class DoctorPoolComponent {
  readonly doctors = input.required<Doctor[]>();
  readonly activeTab = input.required<RotaType>();
  readonly hasExistingRota = input<boolean>(false);
  readonly isLoading = input<boolean>(false);
  /** Método con el que se generó el cuadrante de la pestaña activa; null si no hay cuadrante */
  readonly generatedStrategy = input<GeneratedStrategy | null>(null);

  readonly generateRota = output<void>();
  readonly addDoctorClick = output<void>();
  readonly doctorAdded = output<Doctor>();
  readonly poolTabChange = output<RotaType>();
  /** Fichero de médicos leído y validado */
  readonly doctorsFileLoaded = output<DoctorsFile>();
  /** Fichero de médicos que no se ha podido leer, con el motivo */
  readonly doctorsFileError = output<string>();

  readonly showAddDialog = signal(false);

  /** Etiqueta del método retirado con que se generó el cuadrante; null con la rueda única o sin cuadrante */
  protected readonly retiredStrategyLabel = computed(() => {
    const generated = this.generatedStrategy();
    return generated && generated !== 'single-wheel' ? RETIRED_STRATEGY_LABELS[generated] : null;
  });

  onTabClick(tab: RotaType): void {
    this.poolTabChange.emit(tab);
  }

  onAddDoctorClick(): void {
    this.showAddDialog.set(true);
    this.addDoctorClick.emit();
  }

  async onFileSelected(fileInput: HTMLInputElement): Promise<void> {
    const file = fileInput.files?.[0];
    // Se vacía para que volver a elegir el mismo fichero dispare otra vez «change».
    fileInput.value = '';
    if (!file) return;
    try {
      const doctors = parseDoctorFile(file.name, await file.text());
      this.doctorsFileLoaded.emit({ fileName: file.name, doctors });
    } catch (error) {
      this.doctorsFileError.emit(
        `No se ha podido leer «${file.name}»: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  onDoctorAdded(doctor: Doctor): void {
    this.showAddDialog.set(false);
    this.doctorAdded.emit(doctor);
  }
}
