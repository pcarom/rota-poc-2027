import { Component, computed, input } from '@angular/core';
import { DoctorStats } from '../../core/models/rota.model';
import { RotaType } from '../../core/models/doctor.model';

@Component({
  selector: 'app-doctor-stats-row',
  standalone: true,
  template: `
    <div class="doctor-stats-row">
      <strong class="doctor-name">{{ stats().doctor_name }}</strong>
      <div class="stats-grid">
        <div class="stat-item">
          <span class="stat-label">Guardias</span>
          <span class="stat-value">{{ stats().guardia_hours }}h</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">Refuerzos</span>
          <span class="stat-value">{{ stats().refuerzo_hours }}h</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">Total</span>
          <span class="stat-value">{{ stats().total_hours }}h</span>
        </div>
      </div>
      <div class="stats-grid compact">
        <div class="stat-item">
          <span class="stat-label">Objetivo</span>
          <span class="stat-value">{{ stats().target_hours ?? 0 }}h</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">{{ monthName() }}</span>
          <span
            class="stat-value month-hours"
            [class.negative]="rotaType() === 'AC' && currentMonthHours() < acMonthlyMinimum"
            [attr.title]="rotaType() === 'AC' ? 'Mínimo mensual: ' + acMonthlyMinimum + 'h' : null"
          >{{ currentMonthHours() }}h</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">Desviación</span>
          <span class="stat-value" [class.negative]="isOutOfLimit()">
            {{ (stats().hours_vs_target ?? 0) >= 0 ? '+' : '' }}{{ stats().hours_vs_target ?? 0 }}h
          </span>
        </div>
        @if (limitExcessHours() > 0) {
          <div class="stat-item">
            <span class="stat-label">{{ rotaType() === 'AP' ? 'Sobran' : 'Faltan' }}</span>
            <span class="stat-value negative missing-hours">{{ limitExcessHours() }}h</span>
          </div>
        }
      </div>
      <div class="hours-bar">
        <div class="hours-bar-fill" [style.width.%]="barWidth()"></div>
      </div>
      <div class="shifts-row">
        <span class="shift-badge weekday">Lab: {{ stats().shifts_weekday }}</span>
        <span class="shift-badge saturday">Sáb: {{ stats().shifts_saturday }}</span>
        <span class="shift-badge holiday">Fest: {{ stats().shifts_sunday_holiday }}</span>
        @if (stats().shifts_refuerzo) {
          <span class="shift-badge refuerzo" title="Turnos de refuerzo (incluidos en Lab/Sáb/Fest)">Ref: {{ stats().shifts_refuerzo }}</span>
        }
      </div>
    </div>
  `,
  styles: [`
    .doctor-stats-row {
      padding: 0.75rem 1rem;
      border-bottom: 1px solid #eee;
    }

    .doctor-name {
      display: block;
      font-size: 0.85rem;
      color: #1a237e;
      margin-bottom: 0.4rem;
    }

    .stats-grid {
      display: flex;
      gap: 0.75rem;
      margin-bottom: 0.4rem;
    }

    .stat-item {
      display: flex;
      flex-direction: column;
      gap: 1px;
    }

    .stat-label {
      font-size: 0.65rem;
      font-weight: 600;
      color: #999;
      text-transform: uppercase;
    }

    .stat-value {
      font-size: 0.8rem;
      font-weight: 600;
      color: #333;
    }

    .stat-value.month-hours {
      color: #1565c0;
    }

    .stat-value.negative {
      color: #c62828;
    }

    .stats-grid.compact {
      margin-top: -0.1rem;
      flex-wrap: wrap;
    }

    .hours-bar {
      display: flex;
      height: 6px;
      background: #eee;
      border-radius: 3px;
      overflow: hidden;
      margin-bottom: 0.4rem;
    }

    .hours-bar-fill {
      height: 100%;
      transition: width 0.3s ease;
      background: #1565c0;
    }

    .shifts-row {
      display: flex;
      gap: 0.4rem;
    }

    .shift-badge {
      font-size: 0.65rem;
      padding: 1px 5px;
      border-radius: 3px;
      font-weight: 500;
    }

    .shift-badge.weekday {
      background: #e3f2fd;
      color: #1565c0;
    }

    .shift-badge.saturday {
      background: #fff8e1;
      color: #f57f17;
    }

    .shift-badge.holiday {
      background: #fce4ec;
      color: #c62828;
    }

    .shift-badge.refuerzo {
      background: #fff3e0;
      color: #e65100;
    }
  `],
})
export class DoctorStatsRowComponent {
  protected readonly acMonthlyMinimum = 135;
  readonly stats = input.required<DoctorStats>();
  readonly rotaType = input<RotaType>('AC');
  readonly maxHours = input<number>(0);
  readonly currentMonth = input<number>(new Date().getMonth() + 1);

  private static readonly MONTH_NAMES = [
    'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
    'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic',
  ];

  readonly barWidth = computed(() => {
    const max = Math.max(this.maxHours(), this.stats().target_hours ?? 0);
    if (max === 0) return 0;
    return Math.round((this.stats().total_hours / max) * 100);
  });

  // AC tiene un mínimo (alerta si faltan horas); AP un máximo (alerta si sobran).
  readonly limitExcessHours = computed(() => {
    const delta = this.stats().hours_vs_target ?? 0;
    return Math.max(0, this.rotaType() === 'AP' ? delta : -delta);
  });

  readonly isOutOfLimit = computed(() => this.limitExcessHours() > 0);

  readonly monthName = computed(() =>
    DoctorStatsRowComponent.MONTH_NAMES[this.currentMonth() - 1] ?? ''
  );

  readonly currentMonthHours = computed(() =>
    this.stats().monthly_hours[this.currentMonth()] ?? 0
  );
}
