import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DoctorStatsRowComponent } from './doctor-stats-row.component';
import { DoctorStats } from '../../core/models/rota.model';

describe('DoctorStatsRowComponent', () => {
  let component: DoctorStatsRowComponent;
  let fixture: ComponentFixture<DoctorStatsRowComponent>;

  const mockStats: DoctorStats = {
    doctor_id: 'doc-001',
    doctor_name: 'Dr. Garcia',
    guardia_hours: 1500,
    refuerzo_hours: 150,
    total_hours: 1650,
    monthly_hours: { 1: 140, 2: 130 },
    shifts_weekday: 20,
    shifts_saturday: 5,
    shifts_sunday_holiday: 4,
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DoctorStatsRowComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(DoctorStatsRowComponent);
    component = fixture.componentInstance;
  });

  it('should display doctor name', () => {
    fixture.componentRef.setInput('stats', mockStats);
    fixture.detectChanges();

    const nameEl = fixture.nativeElement.querySelector('.doctor-name');
    expect(nameEl).toBeTruthy();
    expect(nameEl.textContent).toContain('Dr. Garcia');
  });

  it('should display total hours', () => {
    fixture.componentRef.setInput('stats', mockStats);
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent;
    expect(text).toContain('1650');
  });

  it('should display total_hours in stats grid', () => {
    fixture.componentRef.setInput('stats', mockStats);
    fixture.detectChanges();

    const statValues = fixture.nativeElement.querySelectorAll('.stat-value');
    const statTexts = Array.from(statValues).map((el: any) => el.textContent.trim());

    expect(statTexts).toContain('1650h');
  });

  it('muestra las horas de guardia, de refuerzo y el total en la primera fila', () => {
    fixture.componentRef.setInput('stats', mockStats);
    fixture.detectChanges();

    const labels = Array.from(fixture.nativeElement.querySelectorAll('.stat-label')).map((el: any) =>
      el.textContent.trim(),
    );
    expect(labels).toContain('Guardias');
    expect(labels).toContain('Refuerzos');
    expect(labels).toContain('Total');

    const statValues = Array.from(fixture.nativeElement.querySelectorAll('.stat-value')).map((el: any) =>
      el.textContent.trim(),
    );
    expect(statValues).toContain('1500h');
    expect(statValues).toContain('150h');
    expect(statValues).toContain('1650h');
  });

  it('should display current month hours', () => {
    fixture.componentRef.setInput('stats', mockStats);
    fixture.componentRef.setInput('currentMonth', 1);
    fixture.detectChanges();

    const monthHours = fixture.nativeElement.querySelector('.month-hours');
    expect(monthHours).toBeTruthy();
    expect(monthHours.textContent).toContain('140h');

    const text = fixture.nativeElement.textContent;
    expect(text).toContain('Ene');
  });

  it('should show 0h for month with no data', () => {
    fixture.componentRef.setInput('stats', mockStats);
    fixture.componentRef.setInput('currentMonth', 5);
    fixture.detectChanges();

    const monthHours = fixture.nativeElement.querySelector('.month-hours');
    expect(monthHours).toBeTruthy();
    expect(monthHours.textContent).toContain('0h');
  });

  it('muestra las horas faltantes cuando el médico no alcanza el objetivo', () => {
    fixture.componentRef.setInput('stats', {
      ...mockStats,
      total_hours: 138,
      target_hours: 425,
      hours_vs_target: -287,
    });
    fixture.detectChanges();

    const missing = fixture.nativeElement.querySelector('.missing-hours');
    expect(missing).toBeTruthy();
    expect(missing.textContent.trim()).toBe('287h');
    expect(fixture.nativeElement.textContent).toContain('Faltan');
  });

  it('no muestra horas faltantes cuando el médico alcanza el objetivo', () => {
    fixture.componentRef.setInput('stats', {
      ...mockStats,
      target_hours: 1620,
      hours_vs_target: 30,
    });
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.missing-hours')).toBeFalsy();
    expect(fixture.nativeElement.textContent).not.toContain('Faltan');
  });

  it('en AP no avisa de horas faltantes: estar por debajo del máximo es correcto', () => {
    fixture.componentRef.setInput('rotaType', 'AP');
    fixture.componentRef.setInput('stats', {
      ...mockStats,
      total_hours: 170,
      target_hours: 425,
      hours_vs_target: -255,
    });
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.missing-hours')).toBeFalsy();
    expect(fixture.nativeElement.textContent).not.toContain('Faltan');
    expect(fixture.nativeElement.querySelector('.stat-value.negative')).toBeFalsy();
  });

  it('en AP muestra las horas sobrantes cuando el médico supera el máximo', () => {
    fixture.componentRef.setInput('rotaType', 'AP');
    fixture.componentRef.setInput('stats', {
      ...mockStats,
      total_hours: 450,
      target_hours: 425,
      hours_vs_target: 25,
    });
    fixture.detectChanges();

    const excess = fixture.nativeElement.querySelector('.missing-hours');
    expect(excess).toBeTruthy();
    expect(excess.textContent.trim()).toBe('25h');
    expect(fixture.nativeElement.textContent).toContain('Sobran');
  });

  it('should display shifts_weekday, shifts_saturday, shifts_sunday_holiday as badges', () => {
    fixture.componentRef.setInput('stats', mockStats);
    fixture.detectChanges();

    const weekdayBadge = fixture.nativeElement.querySelector('.shift-badge.weekday');
    const saturdayBadge = fixture.nativeElement.querySelector('.shift-badge.saturday');
    const holidayBadge = fixture.nativeElement.querySelector('.shift-badge.holiday');

    expect(weekdayBadge).toBeTruthy();
    expect(weekdayBadge.textContent).toContain('20');

    expect(saturdayBadge).toBeTruthy();
    expect(saturdayBadge.textContent).toContain('5');

    expect(holidayBadge).toBeTruthy();
    expect(holidayBadge.textContent).toContain('4');
  });

  it('muestra la insignia de refuerzos sólo si el médico ha hecho alguno', () => {
    fixture.componentRef.setInput('stats', mockStats);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.shift-badge.refuerzo')).toBeNull();

    fixture.componentRef.setInput('stats', { ...mockStats, shifts_refuerzo: 3 });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.shift-badge.refuerzo').textContent.trim()).toBe('Ref: 3');
  });

  it('resalta en AC el mes por debajo del mínimo de 135h', () => {
    fixture.componentRef.setInput('stats', mockStats);
    fixture.componentRef.setInput('rotaType', 'AC');
    fixture.componentRef.setInput('currentMonth', 2);
    fixture.detectChanges();
    const month = fixture.nativeElement.querySelector('.month-hours');
    expect(month.classList.contains('negative')).toBe(true);
    expect(month.getAttribute('title')).toBe('Mínimo mensual: 135h');

    fixture.componentRef.setInput('currentMonth', 1);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.month-hours').classList.contains('negative')).toBe(false);
  });
});
