import { ComponentFixture, TestBed } from '@angular/core/testing';
import { StatsPanelComponent } from './stats-panel.component';
import { DoctorStats } from '../../core/models/rota.model';

describe('StatsPanelComponent', () => {
  let component: StatsPanelComponent;
  let fixture: ComponentFixture<StatsPanelComponent>;

  const mockStats: DoctorStats[] = [
    {
      doctor_id: 'doc-001',
      doctor_name: 'Dr. Garcia',
      guardia_hours: 1500,
      refuerzo_hours: 150,
      total_hours: 1650,
      monthly_hours: { 1: 140, 2: 130 },
      shifts_weekday: 20,
      shifts_saturday: 5,
      shifts_sunday_holiday: 4,
    },
    {
      doctor_id: 'doc-002',
      doctor_name: 'Dr. Lopez',
      guardia_hours: 1480,
      refuerzo_hours: 160,
      total_hours: 1640,
      monthly_hours: { 1: 138, 2: 132 },
      shifts_weekday: 19,
      shifts_saturday: 5,
      shifts_sunday_holiday: 5,
    },
  ];

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [StatsPanelComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(StatsPanelComponent);
    component = fixture.componentInstance;
  });

  it('should display per-doctor hour breakdowns when rota stats provided', () => {
    fixture.componentRef.setInput('visible', true);
    fixture.componentRef.setInput('stats', mockStats);
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent;
    expect(text).toContain('Dr. Garcia');
    expect(text).toContain('Dr. Lopez');
    expect(text).toContain('1650');
    expect(text).toContain('1640');
  });

  it('should show total hours for each doctor', () => {
    fixture.componentRef.setInput('visible', true);
    fixture.componentRef.setInput('stats', mockStats);
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent;
    expect(text).toContain('1650');
    expect(text).toContain('1640');
  });

  it('should show shift counts by day type', () => {
    fixture.componentRef.setInput('visible', true);
    fixture.componentRef.setInput('stats', mockStats);
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent;
    expect(text).toContain('20');
    expect(text).toContain('19');
    expect(text).toContain('5');
    expect(text).toContain('4');
  });

  it('muestra el total de horas faltantes sólo cuando algún médico no alcanza el objetivo', () => {
    fixture.componentRef.setInput('visible', true);
    fixture.componentRef.setInput('stats', mockStats);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.summary-missing')).toBeFalsy();

    fixture.componentRef.setInput('stats', [
      { ...mockStats[0], total_hours: 138, target_hours: 425, hours_vs_target: -287 },
      { ...mockStats[1], total_hours: 139, target_hours: 425, hours_vs_target: -286 },
      { ...mockStats[1], doctor_id: 'doc-003', total_hours: 430, target_hours: 425, hours_vs_target: 5 },
    ]);
    fixture.detectChanges();

    const row = fixture.nativeElement.querySelector('.summary-missing');
    expect(row).toBeTruthy();
    expect(row.textContent).toContain('Horas faltantes');
    expect(row.textContent).toContain('573h');
  });

  it('en AP muestra el total de horas sobrantes y no las faltantes', () => {
    fixture.componentRef.setInput('visible', true);
    fixture.componentRef.setInput('activeTab', 'AP');
    fixture.componentRef.setInput('stats', [
      { ...mockStats[0], total_hours: 170, target_hours: 425, hours_vs_target: -255 },
      { ...mockStats[1], total_hours: 450, target_hours: 425, hours_vs_target: 25 },
      { ...mockStats[1], doctor_id: 'doc-003', total_hours: 440, target_hours: 425, hours_vs_target: 15 },
    ]);
    fixture.detectChanges();

    const row = fixture.nativeElement.querySelector('.summary-missing');
    expect(row).toBeTruthy();
    expect(row.textContent).toContain('Horas sobrantes');
    expect(row.textContent).toContain('40h');
    expect(fixture.nativeElement.textContent).not.toContain('Horas faltantes');
  });

  it('should be hidden by default', () => {
    fixture.componentRef.setInput('visible', false);
    fixture.componentRef.setInput('stats', mockStats);
    fixture.detectChanges();

    const panel = fixture.nativeElement.querySelector('.stats-panel');
    expect(panel).toBeTruthy();
    expect(panel.classList.contains('open')).toBe(false);
  });

  it('should toggle open/closed when visible changes', () => {
    fixture.componentRef.setInput('visible', false);
    fixture.componentRef.setInput('stats', mockStats);
    fixture.detectChanges();

    let panel = fixture.nativeElement.querySelector('.stats-panel');
    expect(panel.classList.contains('open')).toBe(false);

    fixture.componentRef.setInput('visible', true);
    fixture.detectChanges();

    panel = fixture.nativeElement.querySelector('.stats-panel');
    expect(panel.classList.contains('open')).toBe(true);
  });

  it('should show equity indicator when there is a significant imbalance', () => {
    const imbalancedStats: DoctorStats[] = [
      {
        doctor_id: 'doc-001',
        doctor_name: 'Dr. Garcia',
        guardia_hours: 1650,
        refuerzo_hours: 150,
        total_hours: 1800,
        monthly_hours: { 1: 160 },
        shifts_weekday: 22,
        shifts_saturday: 6,
        shifts_sunday_holiday: 5,
      },
      {
        doctor_id: 'doc-002',
        doctor_name: 'Dr. Lopez',
        guardia_hours: 1380,
        refuerzo_hours: 120,
        total_hours: 1500,
        monthly_hours: { 1: 135 },
        shifts_weekday: 16,
        shifts_saturday: 4,
        shifts_sunday_holiday: 3,
      },
    ];

    fixture.componentRef.setInput('visible', true);
    fixture.componentRef.setInput('stats', imbalancedStats);
    fixture.detectChanges();

    const warningEl = fixture.nativeElement.querySelector('.equity-warning');
    expect(warningEl).toBeTruthy();
    expect(warningEl.textContent.toLowerCase()).toContain('desequilibrio');
  });

  it('should not show equity warning when distribution is balanced', () => {
    fixture.componentRef.setInput('visible', true);
    fixture.componentRef.setInput('stats', mockStats);
    fixture.detectChanges();

    const warningEl = fixture.nativeElement.querySelector('.equity-warning');
    expect(warningEl).toBeFalsy();
  });

  it('should show summary section with total and average hours', () => {
    fixture.componentRef.setInput('visible', true);
    fixture.componentRef.setInput('stats', mockStats);
    fixture.detectChanges();

    const summaryEl = fixture.nativeElement.querySelector('.stats-summary');
    expect(summaryEl).toBeTruthy();

    const summaryText = summaryEl.textContent;
    // Total hours: 1650 + 1640 = 3290
    expect(summaryText).toContain('3290');
    // Average hours: 3290 / 2 = 1645
    expect(summaryText).toContain('1645');
  });

  it('el resumen desglosa las horas de guardia y de refuerzo de todos los médicos', () => {
    fixture.componentRef.setInput('visible', true);
    fixture.componentRef.setInput('stats', mockStats);
    fixture.detectChanges();

    const summaryEl = fixture.nativeElement.querySelector('.stats-summary');
    const labels = Array.from(summaryEl.querySelectorAll('.summary-label')).map((el: any) =>
      el.textContent.trim(),
    );
    expect(labels).toContain('Horas de guardia');
    expect(labels).toContain('Horas de refuerzo');
    expect(labels).toContain('Horas totales');

    const summaryText = summaryEl.textContent;
    // Guardia: 1500 + 1480 = 2980; refuerzo: 150 + 160 = 310; total: 1650 + 1640 = 3290
    expect(summaryText).toContain('2980');
    expect(summaryText).toContain('310');
    expect(summaryText).toContain('3290');
  });

  it('should show header with active tab in title', () => {
    fixture.componentRef.setInput('visible', true);
    fixture.componentRef.setInput('stats', mockStats);
    fixture.componentRef.setInput('activeTab', 'AC');
    fixture.detectChanges();

    const title = fixture.nativeElement.querySelector('.stats-title');
    expect(title).toBeTruthy();
    expect(title.textContent).toContain('Estadísticas AC');
  });

  it('should emit close event when close button is clicked', () => {
    fixture.componentRef.setInput('visible', true);
    fixture.componentRef.setInput('stats', mockStats);
    fixture.detectChanges();

    const spy = vi.fn();
    component.closed.subscribe(spy);

    const closeBtn: HTMLButtonElement = fixture.nativeElement.querySelector('.btn-close-stats');
    closeBtn.click();
    fixture.detectChanges();

    expect(spy).toHaveBeenCalled();
  });

  it('should show no-stats message when stats array is empty and panel is open', () => {
    fixture.componentRef.setInput('visible', true);
    fixture.componentRef.setInput('stats', []);
    fixture.detectChanges();

    const noStatsEl = fixture.nativeElement.querySelector('.no-stats');
    expect(noStatsEl).toBeTruthy();
    expect(noStatsEl.textContent.toLowerCase()).toContain('no hay estadísticas');
  });

  it('should render doctor-stats-row components for each doctor', () => {
    fixture.componentRef.setInput('visible', true);
    fixture.componentRef.setInput('stats', mockStats);
    fixture.detectChanges();

    const rows = fixture.nativeElement.querySelectorAll('app-doctor-stats-row');
    expect(rows.length).toBe(2);
  });

  it('no marca imbalance cuando un AC con target personalizado cumple su objetivo al mismo nivel que un AC con jornada completa', () => {
    const mixedStats: DoctorStats[] = [
      {
        doctor_id: 'doc-001',
        doctor_name: 'Dr. Personalizado',
        guardia_hours: 1100,
        refuerzo_hours: 100,
        total_hours: 1200,
        target_hours: 1180,
        hours_vs_target: 20,
        monthly_hours: { 1: 100 },
        shifts_weekday: 15,
        shifts_saturday: 4,
        shifts_sunday_holiday: 3,
      },
      {
        doctor_id: 'doc-002',
        doctor_name: 'Dr. Completo',
        guardia_hours: 1500,
        refuerzo_hours: 155,
        total_hours: 1655,
        target_hours: 1620,
        hours_vs_target: 35,
        monthly_hours: { 1: 138 },
        shifts_weekday: 19,
        shifts_saturday: 5,
        shifts_sunday_holiday: 5,
      },
    ];

    fixture.componentRef.setInput('visible', true);
    fixture.componentRef.setInput('stats', mixedStats);
    fixture.detectChanges();

    const warningEl = fixture.nativeElement.querySelector('.equity-warning');
    expect(warningEl).toBeFalsy();
  });

  it('marca imbalance cuando los deltas vs target divergen entre médicos', () => {
    const skewedStats: DoctorStats[] = [
      {
        doctor_id: 'doc-001',
        doctor_name: 'Dr. Sobrecargado',
        guardia_hours: 1700,
        refuerzo_hours: 150,
        total_hours: 1850,
        target_hours: 1620,
        hours_vs_target: 230,
        monthly_hours: { 1: 160 },
        shifts_weekday: 22,
        shifts_saturday: 6,
        shifts_sunday_holiday: 5,
      },
      {
        doctor_id: 'doc-002',
        doctor_name: 'Dr. Aliviado',
        guardia_hours: 1490,
        refuerzo_hours: 135,
        total_hours: 1625,
        target_hours: 1620,
        hours_vs_target: 5,
        monthly_hours: { 1: 135 },
        shifts_weekday: 19,
        shifts_saturday: 5,
        shifts_sunday_holiday: 4,
      },
    ];

    fixture.componentRef.setInput('visible', true);
    fixture.componentRef.setInput('stats', skewedStats);
    fixture.detectChanges();

    const warningEl = fixture.nativeElement.querySelector('.equity-warning');
    expect(warningEl).toBeTruthy();
    expect(warningEl.textContent.toLowerCase()).toContain('desequilibrio');
  });
});
