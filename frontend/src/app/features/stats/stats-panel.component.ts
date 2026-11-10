import { Component, computed, input, output } from '@angular/core';
import { DoctorStatsRowComponent } from './doctor-stats-row.component';
import { DoctorStats } from '../../core/models/rota.model';
import { RotaType } from '../../core/models/doctor.model';

@Component({
  selector: 'app-stats-panel',
  standalone: true,
  imports: [DoctorStatsRowComponent],
  template: `
    <aside class="stats-panel" [class.open]="visible()">
      <div class="stats-header">
        <h3 class="stats-title">Estadísticas {{ activeTab() }}</h3>
        <button class="btn-close-stats" (click)="closed.emit()" aria-label="Cerrar panel de estadísticas">&times;</button>
      </div>
      @if (stats().length > 0) {
        <div class="stats-body">
          @for (doctorStats of stats(); track doctorStats.doctor_id) {
            <app-doctor-stats-row [stats]="doctorStats" [rotaType]="activeTab()" [maxHours]="maxHours()" [currentMonth]="currentMonth()" />
          }
        </div>
        @if (hasImbalance()) {
          <div class="equity-warning">
            Desequilibrio detectado: {{ hoursDifference() }}h de diferencia ({{ imbalancePercent() }}%) {{ imbalanceBasisLabel() }}.
          </div>
        }
        <div class="stats-summary">
          <div class="summary-row">
            <span class="summary-label">Horas de guardia</span>
            <span class="summary-value">{{ totalGuardiaHours() }}h</span>
          </div>
          <div class="summary-row">
            <span class="summary-label">Horas de refuerzo</span>
            <span class="summary-value">{{ totalRefuerzoHours() }}h</span>
          </div>
          <div class="summary-row">
            <span class="summary-label">Horas totales</span>
            <span class="summary-value">{{ totalHours() }}h</span>
          </div>
          <div class="summary-row">
            <span class="summary-label">Media por médico</span>
            <span class="summary-value">{{ averageHours() }}h</span>
          </div>
          <div class="summary-row">
            <span class="summary-label">Desviación media</span>
            <span class="summary-value">{{ averageDelta() }}h</span>
          </div>
          @if (limitExcessHours() > 0) {
            <div class="summary-row summary-missing">
              <span class="summary-label">{{ activeTab() === 'AP' ? 'Horas sobrantes' : 'Horas faltantes' }}</span>
              <span class="summary-value">{{ limitExcessHours() }}h</span>
            </div>
          }
          <div class="summary-row">
            <span class="summary-label">Médicos</span>
            <span class="summary-value">{{ stats().length }}</span>
          </div>
        </div>
      } @else {
        <p class="no-stats">No hay estadísticas disponibles. Genere primero un cuadrante.</p>
      }
    </aside>
  `,
  styles: [`
    :host {
      display: block;
      position: fixed;
      top: 0;
      right: 0;
      height: 100dvh;
      z-index: 100;
      pointer-events: none;
    }

    .stats-panel {
      width: 350px;
      height: 100%;
      background: #fafafa;
      border-left: 1px solid #e0e0e0;
      box-shadow: -4px 0 16px rgba(0, 0, 0, 0.08);
      transform: translateX(100%);
      transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      display: flex;
      flex-direction: column;
      overflow: hidden;
      pointer-events: auto;
    }

    .stats-panel.open {
      transform: translateX(0);
    }

    .stats-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0.75rem 1rem;
      background: #e8eaf6;
      border-bottom: 1px solid #e0e0e0;
      flex-shrink: 0;
    }

    .stats-title {
      margin: 0;
      font-size: 0.95rem;
      font-weight: 700;
      color: #1a237e;
    }

    .btn-close-stats {
      background: none;
      border: none;
      font-size: 1.3rem;
      color: #1a237e;
      cursor: pointer;
      padding: 0 0.25rem;
      line-height: 1;
      opacity: 0.7;
      transition: opacity 0.15s ease;
    }

    .btn-close-stats:hover {
      opacity: 1;
    }

    .stats-body {
      flex: 1;
      overflow-y: auto;
    }

    .equity-warning {
      padding: 0.6rem 1rem;
      margin: 0;
      background: #fff3e0;
      color: #e65100;
      font-size: 0.75rem;
      font-weight: 600;
      border-top: 1px solid #ffe0b2;
      border-bottom: 1px solid #ffe0b2;
      flex-shrink: 0;
    }

    .stats-summary {
      padding: 0.75rem 1rem;
      background: #e8eaf6;
      border-top: 1px solid #e0e0e0;
      flex-shrink: 0;
    }

    .summary-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0.2rem 0;
    }

    .summary-label {
      font-size: 0.75rem;
      font-weight: 600;
      color: #666;
      text-transform: uppercase;
    }

    .summary-value {
      font-size: 0.85rem;
      font-weight: 700;
      color: #1a237e;
    }

    .summary-missing .summary-label,
    .summary-missing .summary-value {
      color: #c62828;
    }

    .no-stats {
      padding: 1.5rem 1rem;
      font-size: 0.8rem;
      color: #999;
      text-align: center;
    }
  `],
})
export class StatsPanelComponent {
  readonly visible = input<boolean>(false);
  readonly stats = input<DoctorStats[]>([]);
  readonly activeTab = input<RotaType>('AC');
  readonly currentMonth = input<number>(new Date().getMonth() + 1);
  readonly closed = output<void>();

  readonly maxHours = computed(() => {
    const s = this.stats();
    if (s.length === 0) return 0;
    return Math.max(...s.map(d => d.total_hours));
  });

  readonly minHours = computed(() => {
    const s = this.stats();
    if (s.length === 0) return 0;
    return Math.min(...s.map(d => d.total_hours));
  });

  private readonly imbalanceMetric = computed(() => {
    const s = this.stats();
    if (s.length < 2) {
      return { spread: 0, denominator: 0, basis: 'none' as const };
    }

    const targets = s.map(d => d.target_hours ?? 0);
    if (targets.every(t => t > 0)) {
      const deltas = s.map(d => d.hours_vs_target ?? 0);
      const spread = Math.max(...deltas) - Math.min(...deltas);
      const avgTarget = targets.reduce((sum, t) => sum + t, 0) / s.length;
      return { spread, denominator: avgTarget, basis: 'delta' as const };
    }

    const max = this.maxHours();
    const min = this.minHours();
    return { spread: max - min, denominator: max, basis: 'total' as const };
  });

  readonly hoursDifference = computed(() => this.imbalanceMetric().spread);

  readonly imbalancePercent = computed(() => {
    const { spread, denominator } = this.imbalanceMetric();
    if (denominator === 0) return 0;
    return Math.round((spread / denominator) * 100);
  });

  readonly imbalanceBasisLabel = computed(() =>
    this.imbalanceMetric().basis === 'delta'
      ? 'en la desviación respecto al objetivo'
      : 'entre las horas totales máxima y mínima',
  );

  readonly hasImbalance = computed(() => {
    const { spread, denominator } = this.imbalanceMetric();
    if (denominator === 0) return false;
    return (spread / denominator) > 0.10;
  });

  readonly totalGuardiaHours = computed(() =>
    this.stats().reduce((sum, d) => sum + d.guardia_hours, 0),
  );

  readonly totalRefuerzoHours = computed(() =>
    this.stats().reduce((sum, d) => sum + d.refuerzo_hours, 0),
  );

  readonly totalHours = computed(() =>
    this.stats().reduce((sum, d) => sum + d.total_hours, 0),
  );

  readonly totalDelta = computed(() =>
    this.stats().reduce((sum, d) => sum + (d.hours_vs_target ?? 0), 0),
  );

  // AC tiene un mínimo (suma lo que falta); AP un máximo (suma lo que sobra).
  readonly limitExcessHours = computed(() => {
    const sign = this.activeTab() === 'AP' ? 1 : -1;
    return this.stats().reduce(
      (sum, d) => sum + Math.max(0, sign * (d.hours_vs_target ?? 0)),
      0,
    );
  });

  readonly averageHours = computed(() => {
    const s = this.stats();
    if (s.length === 0) return 0;
    return Math.round(this.totalHours() / s.length);
  });

  readonly averageDelta = computed(() => {
    const s = this.stats();
    if (s.length === 0) return 0;
    return Math.round(this.totalDelta() / s.length);
  });
}
