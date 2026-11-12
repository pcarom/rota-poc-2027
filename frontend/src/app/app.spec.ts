import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { App } from './app';
import { RotaResponse } from './core/models/rota.model';
import { Doctor } from './core/models/doctor.model';
import { NotificationService } from './core/services/notification.service';

const mockDoctors: Doctor[] = [
  { id: 'doc-001', name: 'Dr. Garcia', department: 'Medicina General', rota_type: 'AC' },
  { id: 'doc-002', name: 'Dr. Lopez', department: 'Pediatria', rota_type: 'AC' },
  { id: 'doc-011', name: 'Dr. Navarro', department: 'Urologia', rota_type: 'AP' },
];

const mockAcRotaResponse: RotaResponse = {
  year: 2026,
  city: 'Madrid',
  rota_type: 'AC',
  doctors_per_day: 1,
  generated_at: '2026-01-15T10:30:00Z',
  schedule: [
    {
      date: '2026-01-01',
      day_type: 'holiday',
      shift_start: '09:00',
      shift_end: '08:00+1',
      duration_hours: 23,
      doctors: [{ doctor_id: 'doc-001', doctor_name: 'Dr. Garcia' }],
    },
  ],
  stats: {
    doctors: [
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
    ],
  },
  warnings: [],
};

const mockApRotaResponse: RotaResponse = {
  ...mockAcRotaResponse,
  rota_type: 'AP',
  schedule: [
    {
      date: '2026-01-01',
      day_type: 'holiday',
      shift_start: '10:00',
      shift_end: '22:00',
      duration_hours: 12,
      doctors: [
        { doctor_id: 'doc-011', doctor_name: 'Dr. Navarro', role: 'guardia' },
        { doctor_id: 'doc-012', doctor_name: 'Dr. Torres', role: 'refuerzo' },
      ],
    },
  ],
  stats: { doctors: [] },
};

const generatedRotas = [mockAcRotaResponse, mockApRotaResponse];

describe('App', () => {
  let httpTesting: HttpTestingController;

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTesting.verify();
  });

  function flushInitRequests(options?: {
    rotaStatus?: number;
    city?: string;
    doctors?: Doctor[];
    rotas?: RotaResponse[] | null;
    holidays?: unknown[];
  }) {
    const city = options?.city ?? 'Madrid';
    const doctors = options?.doctors ?? mockDoctors;
    const rotaStatus = options?.rotaStatus ?? 200;
    const rotas = options?.rotas ?? [mockAcRotaResponse];

    httpTesting.expectOne('/api/v1/teams').flush([
      { id: 1, name: 'Equipo principal', doctors },
      { id: 2, name: 'Urgencias Norte', doctors: [] },
    ]);

    const configReq = httpTesting.expectOne('/api/v1/config');
    configReq.flush({ city });

    const currentYear = new Date().getFullYear();
    const rotaReq = httpTesting.expectOne(`/api/v1/rota/${currentYear}?team_id=1`);
    if (rotaStatus === 200 && rotas) {
      rotaReq.flush(rotas);
    } else {
      rotaReq.flush({ detail: 'Not found' }, { status: 404, statusText: 'Not Found' });
    }

    const holidaysReq = httpTesting.expectOne(`/api/v1/holidays/${currentYear}`);
    holidaysReq.flush({ year: currentYear, city, holidays: options?.holidays ?? [] });
  }

  it('carga los festivos especiales de sanidad aparte de los manuales', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const year = new Date().getFullYear();
    flushInitRequests({
      rotaStatus: 404,
      holidays: [
        { id: 1, year, city: 'Madrid', date: `${year}-12-24`, name: 'Nochebuena', source: 'api', special: true },
        { id: 2, year, city: 'Madrid', date: `${year}-03-16`, name: 'Festivo Manual', source: 'manual', special: false },
      ],
    });
    fixture.detectChanges();

    const app = fixture.componentInstance;
    expect([...app.specialHolidayDates()]).toEqual([`${year}-12-24`]);
    expect([...app.manualHolidayDates()]).toEqual([`${year}-03-16`]);
    expect([...app.allHolidayDates()].sort()).toEqual([`${year}-03-16`, `${year}-12-24`]);
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    flushInitRequests({ rotaStatus: 404 });
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('should load city and display it on init', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    flushInitRequests({ city: 'Barcelona', rotaStatus: 404 });
    fixture.detectChanges();

    const cityEl = fixture.nativeElement.querySelector('.city-label');
    expect(cityEl.textContent).toContain('Barcelona');
  });

  it('should load rotas on init and populate calendar', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    flushInitRequests({ rotaStatus: 200, rotas: [mockAcRotaResponse] });
    fixture.detectChanges();

    const app = fixture.componentInstance;
    expect(app['acSchedule']()).toEqual(mockAcRotaResponse.schedule);
    expect(app['acStats']()).toEqual(mockAcRotaResponse.stats.doctors);
    expect(app['hasAcRota']()).toBe(true);
  });

  it('should default to AC pool tab', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    flushInitRequests({ rotaStatus: 404 });
    fixture.detectChanges();

    expect(fixture.componentInstance['activePoolTab']()).toBe('AC');
  });

  it('muestra un único botón «Generar cuadrante» cuando no hay cuadrantes', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    flushInitRequests({ rotaStatus: 404 });
    fixture.detectChanges();

    const generateBtn = fixture.nativeElement.querySelector('.btn-generate');
    expect(generateBtn.textContent.trim()).toBe('Generar cuadrante');
  });

  it('muestra «Regenerar cuadrante» en ambas pestañas cuando ya hay cuadrantes', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    flushInitRequests({ rotaStatus: 200, rotas: [mockAcRotaResponse] });
    fixture.detectChanges();

    const generateBtn = fixture.nativeElement.querySelector('.btn-generate');
    expect(generateBtn.textContent.trim()).toBe('Regenerar cuadrante');

    fixture.componentInstance['onPoolTabChange']('AP');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.btn-generate').textContent.trim()).toBe(
      'Regenerar cuadrante',
    );
  });

  it('genera AC y AP con una sola petición que lleva los dos grupos', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    flushInitRequests({ rotaStatus: 404 });
    fixture.detectChanges();

    const generateBtn: HTMLButtonElement = fixture.nativeElement.querySelector('.btn-generate');
    generateBtn.click();
    fixture.detectChanges();

    const genReq = httpTesting.expectOne('/api/v1/rota/generate');
    expect(genReq.request.method).toBe('POST');
    expect(genReq.request.body.ac_pool.map((doctor: { id: string }) => doctor.id)).toEqual(['doc-001', 'doc-002']);
    expect(genReq.request.body.ap_pool.map((doctor: { id: string }) => doctor.id)).toEqual(['doc-011']);
    genReq.flush(generatedRotas);
    fixture.detectChanges();

    expect(fixture.componentInstance['hasAcRota']()).toBe(true);
    expect(fixture.componentInstance['hasApRota']()).toBe(true);
    expect(fixture.componentInstance['apSchedule']()).toEqual(mockApRotaResponse.schedule);
  });

  it('should show confirm dialog when re-generating', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    flushInitRequests({ rotaStatus: 200, rotas: [mockAcRotaResponse] });
    fixture.detectChanges();

    const generateBtn: HTMLButtonElement = fixture.nativeElement.querySelector('.btn-generate');
    generateBtn.click();
    fixture.detectChanges();

    const confirmDialog = fixture.nativeElement.querySelector('.confirm-dialog-backdrop');
    expect(confirmDialog).toBeTruthy();
    expect(confirmDialog.textContent).toContain(
      `Los cuadrantes AC y AP actuales de ${new Date().getFullYear()} del equipo «Equipo principal» se sustituirán por unos nuevos.`,
    );

    const confirmBtn = confirmDialog.querySelector('.btn-confirm');
    confirmBtn.click();
    fixture.detectChanges();

    const genReq = httpTesting.expectOne('/api/v1/rota/generate');
    expect(genReq.request.method).toBe('POST');
    genReq.flush(generatedRotas);
    fixture.detectChanges();

    const dialogAfter = fixture.nativeElement.querySelector('.confirm-dialog-backdrop');
    expect(dialogAfter).toBeFalsy();
  });

  it('should reload rotas when year changes', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    flushInitRequests({ rotaStatus: 200, rotas: [mockAcRotaResponse] });
    fixture.detectChanges();

    const yearInput: HTMLInputElement = fixture.nativeElement.querySelector('.year-input');
    yearInput.value = '2025';
    yearInput.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    const rotaReq = httpTesting.expectOne('/api/v1/rota/2025?team_id=1');
    expect(rotaReq.request.method).toBe('GET');
    rotaReq.flush({ detail: 'Not found' }, { status: 404, statusText: 'Not Found' });

    const holidaysReq = httpTesting.expectOne('/api/v1/holidays/2025');
    holidaysReq.flush({ year: 2025, city: 'Madrid', holidays: [] });
    fixture.detectChanges();

    expect(fixture.componentInstance['hasAcRota']()).toBe(false);
    expect(fixture.componentInstance['acSchedule']()).toEqual([]);
  });

  it('should show loading spinner during rota generation', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    flushInitRequests({ rotaStatus: 404 });
    fixture.detectChanges();

    const generateBtn: HTMLButtonElement = fixture.nativeElement.querySelector('.btn-generate');
    generateBtn.click();
    fixture.detectChanges();

    const overlay = fixture.nativeElement.querySelector('.loading-overlay');
    expect(overlay).toBeTruthy();

    const spinner = fixture.nativeElement.querySelector('.spinner');
    expect(spinner).toBeTruthy();

    const btn: HTMLButtonElement = fixture.nativeElement.querySelector('.btn-generate');
    expect(btn.disabled).toBe(true);

    const genReq = httpTesting.expectOne('/api/v1/rota/generate');
    genReq.flush(generatedRotas);
    fixture.detectChanges();

    const overlayAfter = fixture.nativeElement.querySelector('.loading-overlay');
    expect(overlayAfter).toBeFalsy();
  });

  it('should show error notification when generation fails', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    flushInitRequests({ rotaStatus: 404 });
    fixture.detectChanges();

    const notificationService = TestBed.inject(NotificationService);

    const generateBtn: HTMLButtonElement = fixture.nativeElement.querySelector('.btn-generate');
    generateBtn.click();
    fixture.detectChanges();

    const genReq = httpTesting.expectOne('/api/v1/rota/generate');
    genReq.flush(
      {
        statusCode: 400,
        message:
          'El grupo de 8 médicos es demasiado grande para AC: el objetivo de 12960h supera la capacidad anual de cobertura de 6627h.',
        error: 'Bad Request',
      },
      { status: 400, statusText: 'Bad Request' }
    );
    fixture.detectChanges();

    const notifications = notificationService.notifications();
    expect(notifications.length).toBeGreaterThan(0);
    const errorNotif = notifications.find((n) => n.type === 'error');
    expect(errorNotif).toBeTruthy();
    expect(errorNotif!.message).toContain('No se han podido generar los cuadrantes');
    expect(errorNotif!.message).toContain('demasiado grande');
    expect(errorNotif!.message).toContain('12960h');
  });

  it('should show success notification after generation', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    flushInitRequests({ rotaStatus: 404 });
    fixture.detectChanges();

    const notificationService = TestBed.inject(NotificationService);

    const generateBtn: HTMLButtonElement = fixture.nativeElement.querySelector('.btn-generate');
    generateBtn.click();
    fixture.detectChanges();

    const genReq = httpTesting.expectOne('/api/v1/rota/generate');
    genReq.flush(generatedRotas);
    fixture.detectChanges();

    const notifications = notificationService.notifications();
    expect(notifications.length).toBeGreaterThan(0);
    const successNotif = notifications.find((n) => n.type === 'success');
    expect(successNotif).toBeTruthy();
    expect(successNotif!.message).toContain('Cuadrantes AC y AP generados correctamente');
  });

  it('muestra un aviso, no un error, cuando el cuadrante se genera con advertencias', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    flushInitRequests({ rotaStatus: 404 });
    fixture.detectChanges();

    const notificationService = TestBed.inject(NotificationService);

    const generateBtn: HTMLButtonElement = fixture.nativeElement.querySelector('.btn-generate');
    generateBtn.click();
    fixture.detectChanges();

    const genReq = httpTesting.expectOne('/api/v1/rota/generate');
    genReq.flush([
      {
        ...mockAcRotaResponse,
        warnings: [
          'El grupo de 8 médicos es demasiado grande para AC: el objetivo de 12960h supera la capacidad anual de cobertura de 6627h. 8 médicos quedan por debajo del mínimo de 1620h; faltan 6333h en total.',
        ],
      },
      mockApRotaResponse,
    ]);
    fixture.detectChanges();

    const notifications = notificationService.notifications();
    expect(notifications.find((n) => n.type === 'error')).toBeFalsy();
    expect(notifications.find((n) => n.type === 'success')).toBeFalsy();
    const warningNotif = notifications.find((n) => n.type === 'warning');
    expect(warningNotif).toBeTruthy();
    expect(warningNotif!.message).toContain('Cuadrantes AC y AP generados con advertencias');
    expect(warningNotif!.message).toContain('AC: El grupo de 8 médicos');
    expect(warningNotif!.message).toContain('faltan 6333h en total');
    expect(fixture.componentInstance['hasAcRota']()).toBe(true);
  });

  it('should show empty calendar with warning when no rota exists', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    flushInitRequests({ rotaStatus: 404 });
    fixture.detectChanges();

    // El calendario debería mostrarse incluso sin rota
    const monthView = fixture.nativeElement.querySelector('app-month-view');
    expect(monthView).toBeTruthy();

    // Debería haber un warning visible
    const warning = fixture.nativeElement.querySelector('.no-rota-warning');
    expect(warning).toBeTruthy();
    expect(warning.textContent).toContain('No hay ningún cuadrante generado');
  });

  it('should show pool tabs for AC and AP', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    flushInitRequests({ rotaStatus: 404 });
    fixture.detectChanges();

    const tabs = fixture.nativeElement.querySelectorAll('.tab-btn');
    expect(tabs.length).toBe(2);
    expect(tabs[0].textContent.trim()).toBe('AC');
    expect(tabs[1].textContent.trim()).toBe('AP');
  });

  it('should filter pool doctors by active tab', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    flushInitRequests({ rotaStatus: 404 });
    fixture.detectChanges();

    // AC tab active by default — should show 2 AC doctors
    const cards = fixture.nativeElement.querySelectorAll('app-doctor-card');
    expect(cards.length).toBe(2); // doc-001, doc-002 are AC
  });

  describe('borrar cuadrantes', () => {
    function resetButton(fixture: { nativeElement: HTMLElement }): HTMLButtonElement {
      const button = fixture.nativeElement.querySelector<HTMLButtonElement>('.app-header .btn-reset');
      if (!button) {
        throw new Error('No se ha encontrado el botón «Borrar cuadrantes»');
      }
      return button;
    }

    function openResetDialog() {
      const fixture = TestBed.createComponent(App);
      fixture.detectChanges();
      flushInitRequests({ rotas: generatedRotas });
      fixture.detectChanges();
      resetButton(fixture).click();
      fixture.detectChanges();
      return fixture;
    }

    it('deshabilita el botón cuando no hay cuadrantes', () => {
      const fixture = TestBed.createComponent(App);
      fixture.detectChanges();
      flushInitRequests({ rotaStatus: 404 });
      fixture.detectChanges();

      expect(resetButton(fixture).textContent?.trim()).toBe('Borrar cuadrantes');
      expect(resetButton(fixture).disabled).toBe(true);
    });

    it('pide confirmación antes de borrar y no lanza nada si se cancela', () => {
      const fixture = openResetDialog();

      const dialog: HTMLElement = fixture.nativeElement.querySelector('.confirm-dialog-backdrop');
      expect(dialog.querySelector('.confirm-title')?.textContent).toBe('Borrar cuadrantes');
      expect(dialog.textContent).toContain(
        `Se borrarán los cuadrantes AC y AP de ${new Date().getFullYear()}`,
      );
      expect(dialog.querySelector('.btn-confirm')?.textContent?.trim()).toBe('Borrar');

      (dialog.querySelector('.btn-cancel') as HTMLButtonElement).click();
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('.confirm-dialog-backdrop')).toBeFalsy();
      expect(fixture.componentInstance['hasData']()).toBe(true);
    });

    it('al confirmar manda el DELETE, vacía el calendario y avisa del éxito', () => {
      const fixture = openResetDialog();
      const notificationService = TestBed.inject(NotificationService);

      fixture.nativeElement.querySelector('.confirm-dialog-backdrop .btn-confirm').click();
      fixture.detectChanges();

      const year = new Date().getFullYear();
      const req = httpTesting.expectOne(`/api/v1/rota/${year}?team_id=1`);
      expect(req.request.method).toBe('DELETE');
      req.flush(null, { status: 204, statusText: 'No Content' });
      fixture.detectChanges();

      const app = fixture.componentInstance;
      expect(app['hasData']()).toBe(false);
      expect(app['mergedSchedule']()).toEqual([]);
      expect(app['acStats']()).toEqual([]);
      expect(app['apStats']()).toEqual([]);
      expect(fixture.nativeElement.querySelector('.confirm-dialog-backdrop')).toBeFalsy();
      expect(resetButton(fixture).disabled).toBe(true);
      expect(fixture.nativeElement.querySelector('.btn-generate').textContent).toContain('Generar cuadrante');
      const success = notificationService.notifications().find((n) => n.type === 'success');
      expect(success?.message).toBe(`Cuadrantes AC y AP de ${year} del equipo «Equipo principal» borrados`);
    });

    it('muestra el mensaje del backend si el borrado falla y conserva los cuadrantes', () => {
      const fixture = openResetDialog();
      const notificationService = TestBed.inject(NotificationService);

      fixture.nativeElement.querySelector('.confirm-dialog-backdrop .btn-confirm').click();
      fixture.detectChanges();

      const year = new Date().getFullYear();
      httpTesting
        .expectOne(`/api/v1/rota/${year}?team_id=1`)
        .flush(
          { statusCode: 404, message: `No se ha encontrado ningún cuadrante para el año ${year}` },
          { status: 404, statusText: 'Not Found' },
        );
      fixture.detectChanges();

      expect(fixture.componentInstance['hasData']()).toBe(true);
      const error = notificationService.notifications().find((n) => n.type === 'error');
      expect(error?.message).toBe(
        `No se han podido borrar los cuadrantes: No se ha encontrado ningún cuadrante para el año ${year}`,
      );
    });
  });

  describe('exportar a Excel', () => {
    const originalCreateObjectURL = URL.createObjectURL;
    const originalRevokeObjectURL = URL.revokeObjectURL;
    let createObjectURL: ReturnType<typeof vi.fn>;
    let revokeObjectURL: ReturnType<typeof vi.fn>;
    let anchorClick: ReturnType<typeof vi.spyOn>;
    let anchorDownloads: string[];

    beforeEach(() => {
      createObjectURL = vi.fn(() => 'blob:cuadrante');
      revokeObjectURL = vi.fn();
      URL.createObjectURL = createObjectURL as unknown as typeof URL.createObjectURL;
      URL.revokeObjectURL = revokeObjectURL as unknown as typeof URL.revokeObjectURL;
      anchorDownloads = [];
      anchorClick = vi
        .spyOn(HTMLAnchorElement.prototype, 'click')
        .mockImplementation(function (this: HTMLAnchorElement) {
          anchorDownloads.push(this.download);
        });
    });

    afterEach(() => {
      URL.createObjectURL = originalCreateObjectURL;
      URL.revokeObjectURL = originalRevokeObjectURL;
      anchorClick.mockRestore();
    });

    function exportButton(fixture: { nativeElement: HTMLElement }): HTMLButtonElement {
      const button = Array.from(
        (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('.app-header button'),
      ).find((candidate) => candidate.textContent?.trim() === 'Exportar a Excel');
      if (!button) {
        throw new Error('No se ha encontrado el botón «Exportar a Excel»');
      }
      return button;
    }

    it('should disable the export button when there is no rota', () => {
      const fixture = TestBed.createComponent(App);
      fixture.detectChanges();
      flushInitRequests({ rotaStatus: 404 });
      fixture.detectChanges();

      expect(exportButton(fixture).disabled).toBe(true);
    });

    it('should place the export button before the stats button', () => {
      const fixture = TestBed.createComponent(App);
      fixture.detectChanges();
      flushInitRequests();
      fixture.detectChanges();

      const buttons = Array.from(
        (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('.app-header button'),
      );
      expect(buttons.indexOf(exportButton(fixture))).toBeLessThan(
        buttons.indexOf(fixture.nativeElement.querySelector('.btn-stats')),
      );
    });

    it('should enable the export button when a rota exists', () => {
      const fixture = TestBed.createComponent(App);
      fixture.detectChanges();
      flushInitRequests();
      fixture.detectChanges();

      expect(exportButton(fixture).disabled).toBe(false);
    });

    it('should request the file and trigger the download on click', () => {
      const fixture = TestBed.createComponent(App);
      fixture.detectChanges();
      flushInitRequests();
      fixture.detectChanges();

      exportButton(fixture).click();
      fixture.detectChanges();
      expect(exportButton(fixture).disabled).toBe(true);

      const year = new Date().getFullYear();
      const req = httpTesting.expectOne(`/api/v1/rota/${year}/export?team_id=1`);
      expect(req.request.responseType).toBe('blob');
      req.flush(new Blob(['xlsx']));
      fixture.detectChanges();

      expect(createObjectURL).toHaveBeenCalledTimes(1);
      expect(anchorDownloads).toEqual([`cuadrante-guardias-Equipo-principal-${year}.xlsx`]);
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:cuadrante');
      expect(exportButton(fixture).disabled).toBe(false);
    });

    it('should show the backend message in Spanish when the export fails', async () => {
      const fixture = TestBed.createComponent(App);
      fixture.detectChanges();
      flushInitRequests();
      fixture.detectChanges();
      const notificationService = TestBed.inject(NotificationService);

      exportButton(fixture).click();
      const year = new Date().getFullYear();
      const body = JSON.stringify({
        message: `No se ha encontrado ningún cuadrante para el año ${year}`,
      });
      httpTesting
        .expectOne(`/api/v1/rota/${year}/export?team_id=1`)
        .flush(new Blob([body], { type: 'application/json' }), {
          status: 404,
          statusText: 'Not Found',
        });
      await fixture.whenStable();
      fixture.detectChanges();

      const [notification] = notificationService.notifications();
      expect(notification.type).toBe('error');
      expect(notification.message).toBe(
        `No se ha podido exportar el cuadrante: No se ha encontrado ningún cuadrante para el año ${year}`,
      );
      expect(notification.message).not.toContain('Http failure');
      expect(createObjectURL).not.toHaveBeenCalled();
      expect(exportButton(fixture).disabled).toBe(false);
    });

    it('should fall back to the Spanish generic message when the error body is not JSON', async () => {
      const fixture = TestBed.createComponent(App);
      fixture.detectChanges();
      flushInitRequests();
      fixture.detectChanges();
      const notificationService = TestBed.inject(NotificationService);

      exportButton(fixture).click();
      const year = new Date().getFullYear();
      httpTesting
        .expectOne(`/api/v1/rota/${year}/export?team_id=1`)
        .flush(new Blob(['<html>Bad Gateway</html>']), {
          status: 502,
          statusText: 'Bad Gateway',
        });
      await fixture.whenStable();

      const [notification] = notificationService.notifications();
      expect(notification.message).toMatch(/^No se ha podido exportar el cuadrante/);
      expect(notification.message).not.toContain('Http failure');
    });
  });

  describe('soltar un médico sobre un día', () => {
    type Ref = { doctor_id: string; doctor_name: string; role?: 'guardia' | 'refuerzo' };
    const drop = (acDoctors: Ref[], newDoctor = mockDoctors[1], apDoctors: Ref[] = []) => ({
      date: '2026-01-01',
      newDoctor,
      acDoctors,
      apDoctors,
    });
    const garcia: Ref = { doctor_id: 'doc-001', doctor_name: 'Dr. Garcia', role: 'guardia' };
    const apRefuerzo: Ref = { doctor_id: 'doc-012', doctor_name: 'Dr. Torres', role: 'refuerzo' };

    function setup() {
      const fixture = TestBed.createComponent(App);
      fixture.detectChanges();
      flushInitRequests();
      fixture.detectChanges();
      return { fixture, app: fixture.componentInstance, notifications: TestBed.inject(NotificationService) };
    }

    const optionTexts = (fixture: { nativeElement: HTMLElement }) =>
      Array.from(fixture.nativeElement.querySelectorAll('app-replace-doctor-dialog button:not(.btn-cancel)')).map(
        (b) => b.textContent?.trim(),
      );

    it('abre el diálogo con la guardia de su grupo y todos los refuerzos del día, sin lanzar nada', () => {
      const { fixture, app } = setup();

      app.onDoctorDropped(drop([garcia], mockDoctors[1], [
        { doctor_id: 'doc-011', doctor_name: 'Dr. Navarro', role: 'guardia' },
        apRefuerzo,
      ]));
      fixture.detectChanges();

      expect(app['pendingReplacement']()).not.toBeNull();
      expect(fixture.nativeElement.querySelector('.dialog-title').textContent.trim()).toBe(
        'Asignar a Dr. Lopez el jueves, 1 de enero',
      );
      expect(optionTexts(fixture)).toEqual([
        'Sustituir a Dr. Garcia en la guardia AC',
        'Sustituir a Dr. Torres en el refuerzo',
        'Añadir al refuerzo',
      ]);
      httpTesting.expectNone('/api/v1/rota/2026/AC/replace');
    });

    it('onAddDoctorToDay lanza el POST y aplica la rota devuelta', () => {
      const { fixture, app } = setup();
      app.onDoctorDropped(drop([garcia]));

      app.onAddDoctorToDay();

      expect(app['pendingReplacement']()).toBeNull();
      const req = httpTesting.expectOne((r) => r.url.endsWith('/AC/add'));
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ date: '2026-01-01', doctor_id: 'doc-002' });

      const updated: RotaResponse = {
        ...mockAcRotaResponse,
        schedule: [
          {
            ...mockAcRotaResponse.schedule[0],
            doctors: [garcia, { doctor_id: 'doc-002', doctor_name: 'Dr. Lopez', role: 'refuerzo' }],
          },
        ],
      };
      req.flush(updated);
      fixture.detectChanges();

      expect(app['acSchedule']()[0].doctors.length).toBe(2);
    });

    it('sustituir la guardia de su grupo manda el PATCH sin old_rota_type', () => {
      const { app } = setup();
      app.onDoctorDropped(drop([garcia]));

      app.onReplaceDoctorSelected({ doctor_id: 'doc-001', doctor_name: 'Dr. Garcia', rota_type: 'AC' });

      const req = httpTesting.expectOne('/api/v1/rota/2026/AC/replace?team_id=1');
      expect(req.request.body).toEqual({
        date: '2026-01-01',
        old_doctor_id: 'doc-001',
        new_doctor_id: 'doc-002',
      });
      req.flush(mockAcRotaResponse);
    });

    it('sustituir un refuerzo del otro grupo manda old_rota_type y recarga los dos cuadrantes', () => {
      const { app } = setup();
      app.onDoctorDropped(drop([garcia], mockDoctors[1], [apRefuerzo]));

      app.onReplaceDoctorSelected({ doctor_id: 'doc-012', doctor_name: 'Dr. Torres', rota_type: 'AP' });

      const req = httpTesting.expectOne('/api/v1/rota/2026/AC/replace?team_id=1');
      expect(req.request.body).toEqual({
        date: '2026-01-01',
        old_doctor_id: 'doc-012',
        new_doctor_id: 'doc-002',
        old_rota_type: 'AP',
      });
      req.flush(mockAcRotaResponse);

      httpTesting.expectOne('/api/v1/rota/2026?team_id=1').flush([mockAcRotaResponse, mockApRotaResponse]);
      expect(app['hasApRota']()).toBe(true);
    });

    it('si el médico ya tiene guardia o refuerzo ese día avisa y no abre el diálogo', () => {
      const { app, notifications } = setup();

      app.onDoctorDropped(drop([garcia], mockDoctors[0]));

      expect(app['pendingReplacement']()).toBeNull();
      const last = notifications.notifications().at(-1);
      expect(last?.type).toBe('warning');
      expect(last?.message).toBe('Ese médico ya tiene una guardia o un refuerzo este día.');
    });

    it('sin médicos de su grupo ese día mantiene el aviso actual', () => {
      const { app, notifications } = setup();

      app.onDoctorDropped(drop([]));

      expect(app['pendingReplacement']()).toBeNull();
      expect(notifications.notifications().at(-1)?.message).toBe(
        'No hay ninguna sustitución disponible para ese médico en este día.',
      );
    });
  });


  describe('método de asignación', () => {
    function selectStrategy(fixture: { nativeElement: HTMLElement; detectChanges(): void }, value: string) {
      const select = fixture.nativeElement.querySelector('.strategy-select') as HTMLSelectElement;
      select.value = value;
      select.dispatchEvent(new Event('change'));
      fixture.detectChanges();
    }

    function generate(fixture: { nativeElement: HTMLElement; detectChanges(): void }) {
      (fixture.nativeElement.querySelector('.btn-generate') as HTMLButtonElement).click();
      fixture.detectChanges();
    }

    it('debe enviar single-wheel por defecto', () => {
      const fixture = TestBed.createComponent(App);
      fixture.detectChanges();
      flushInitRequests({ rotaStatus: 404 });
      fixture.detectChanges();

      generate(fixture);

      const req = httpTesting.expectOne('/api/v1/rota/generate');
      expect(req.request.body.strategy).toBe('single-wheel');
      req.flush(generatedRotas);
    });

    it('debe enviar wheels tras elegirlo en el selector', () => {
      const fixture = TestBed.createComponent(App);
      fixture.detectChanges();
      flushInitRequests({ rotaStatus: 404 });
      fixture.detectChanges();

      selectStrategy(fixture, 'wheels');
      generate(fixture);

      const req = httpTesting.expectOne('/api/v1/rota/generate');
      expect(req.request.body.strategy).toBe('wheels');
      req.flush(generatedRotas.map((rota) => ({ ...rota, strategy: 'wheels' })));
    });

    it('debe mostrar el método con el que se generó el cuadrante', () => {
      const fixture = TestBed.createComponent(App);
      fixture.detectChanges();
      flushInitRequests({ rotaStatus: 404 });
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('.generated-with')).toBeNull();

      selectStrategy(fixture, 'single-wheel');
      generate(fixture);
      httpTesting.expectOne('/api/v1/rota/generate').flush(generatedRotas.map((rota) => ({ ...rota, strategy: 'single-wheel' })));
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('.generated-with').textContent.trim()).toBe(
        'Generado con: Rueda única',
      );
    });

    it('debe mostrar el método de un cuadrante cargado al iniciar', () => {
      const fixture = TestBed.createComponent(App);
      fixture.detectChanges();
      flushInitRequests({ rotas: [{ ...mockAcRotaResponse, strategy: 'wheels' }] });
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('.generated-with').textContent.trim()).toBe(
        'Generado con: Ruedas',
      );
    });

    it('debe tratar una respuesta sin strategy como Equilibrado (retirado)', () => {
      const fixture = TestBed.createComponent(App);
      fixture.detectChanges();
      flushInitRequests({ rotas: [mockAcRotaResponse] });
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('.generated-with').textContent.trim()).toBe(
        'Generado con: Equilibrado (retirado)',
      );
    });
  });
  describe('equipos', () => {
    const currentYear = new Date().getFullYear();

    function setup() {
      const fixture = TestBed.createComponent(App);
      fixture.detectChanges();
      flushInitRequests({ rotas: generatedRotas });
      fixture.detectChanges();
      return { fixture, app: fixture.componentInstance, notifications: TestBed.inject(NotificationService) };
    }

    it('muestra el desplegable de equipos encima de la lista de médicos con el primero seleccionado', () => {
      const { fixture } = setup();
      const pool: HTMLElement = fixture.nativeElement.querySelector('app-doctor-pool');
      const select: HTMLSelectElement = pool.querySelector('#team-select')!;
      expect([...select.options].map((option) => option.textContent?.trim())).toEqual([
        'Equipo principal',
        'Urgencias Norte',
      ]);
      expect(select.value).toBe('1');
      // El selector va antes que el título y la lista del grupo.
      expect(pool.querySelector('app-team-selector')!.compareDocumentPosition(pool.querySelector('.doctor-list')!)
        & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it('al cambiar de equipo carga su lista (la inicial si está vacía) y sus cuadrantes', () => {
      const { fixture, app } = setup();
      const select: HTMLSelectElement = fixture.nativeElement.querySelector('#team-select');
      select.value = '2';
      select.dispatchEvent(new Event('change'));
      fixture.detectChanges();

      httpTesting.expectOne('assets/doctors.json').flush([mockDoctors[2]]);
      httpTesting.expectOne('/api/v1/teams/2/doctors').flush({ id: 2, name: 'Urgencias Norte', doctors: [mockDoctors[2]] });
      httpTesting
        .expectOne(`/api/v1/rota/${currentYear}?team_id=2`)
        .flush({ message: 'No encontrado' }, { status: 404, statusText: 'Not Found' });
      fixture.detectChanges();

      expect(app['hasData']()).toBe(false);
      expect(app['teamName']()).toBe('Urgencias Norte');
      app.onPoolTabChange('AP');
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelectorAll('app-doctor-card').length).toBe(1);
      expect(localStorage.getItem('rota.selectedTeamId')).toBe('2');
    });

    it('genera los cuadrantes del equipo activo', () => {
      const { app } = setup();
      app.onTeamSelected(2);
      httpTesting.expectOne('assets/doctors.json').flush(mockDoctors);
      httpTesting.expectOne('/api/v1/teams/2/doctors').flush({ id: 2, name: 'Urgencias Norte', doctors: mockDoctors });
      httpTesting
        .expectOne(`/api/v1/rota/${currentYear}?team_id=2`)
        .flush({ message: 'No encontrado' }, { status: 404, statusText: 'Not Found' });

      app.onGenerateRota();
      const req = httpTesting.expectOne('/api/v1/rota/generate');
      expect(req.request.body.team_id).toBe(2);
      req.flush(generatedRotas);
    });

    it('al subir un fichero pide confirmación y sustituye la lista del equipo', () => {
      const { fixture, app, notifications } = setup();
      const uploaded = [
        { id: 'doc-100', name: 'Dra. Subida', department: 'Urgencias', rota_type: 'AP' as const },
        { id: 'doc-101', name: 'Dr. Subido', department: 'Urgencias', rota_type: 'AC' as const },
      ];

      app.onDoctorsFileLoaded({ fileName: 'equipo.csv', doctors: uploaded });
      fixture.detectChanges();
      const dialog: HTMLElement = fixture.nativeElement.querySelector('.confirm-dialog-backdrop');
      expect(dialog.textContent).toContain('Cargar lista de médicos');
      expect(dialog.textContent).toContain(
        'Se sustituirá la lista del equipo «Equipo principal» (3 médicos) por la de «equipo.csv»: 2 médicos, 1 AC y 1 AP. Los cuadrantes ya generados conservan sus médicos hasta que los regenere. ¿Desea continuar?',
      );

      (dialog.querySelector('.btn-confirm') as HTMLButtonElement).click();
      fixture.detectChanges();
      const req = httpTesting.expectOne('/api/v1/teams/1/doctors');
      expect(req.request.method).toBe('PUT');
      expect(req.request.body).toEqual({ doctors: uploaded });
      req.flush({ id: 1, name: 'Equipo principal', doctors: uploaded });
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('.confirm-dialog-backdrop')).toBeFalsy();
      expect(fixture.nativeElement.querySelectorAll('app-doctor-card').length).toBe(1);
      expect(notifications.notifications().at(-1)?.message).toBe(
        'Lista de médicos del equipo «Equipo principal» sustituida: 2 médicos. Regenere los cuadrantes para usarla.',
      );
    });

    it('cancelar la carga no cambia nada y un fichero inválido muestra el error', () => {
      const { fixture, app, notifications } = setup();
      app.onDoctorsFileLoaded({ fileName: 'equipo.csv', doctors: [mockDoctors[0]] });
      fixture.detectChanges();
      (fixture.nativeElement.querySelector('.btn-cancel') as HTMLButtonElement).click();
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('.confirm-dialog-backdrop')).toBeFalsy();

      app.onDoctorsFileError('No se ha podido leer «x.csv»: El fichero no contiene ningún médico.');
      const last = notifications.notifications().at(-1);
      expect(last?.type).toBe('error');
      expect(last?.message).toBe('No se ha podido leer «x.csv»: El fichero no contiene ningún médico.');
    });

    it('crea un equipo desde el diálogo y pasa a él', () => {
      const { fixture } = setup();
      (fixture.nativeElement.querySelector('.btn-new-team') as HTMLButtonElement).click();
      fixture.detectChanges();
      const input: HTMLInputElement = fixture.nativeElement.querySelector('#team-name');
      expect(fixture.nativeElement.querySelector('.dialog-title').textContent).toBe('Nuevo equipo');
      input.value = 'Pediatría';
      input.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      (fixture.nativeElement.querySelector('.btn-submit') as HTMLButtonElement).click();
      fixture.detectChanges();

      const createReq = httpTesting.expectOne('/api/v1/teams');
      expect(createReq.request.body).toEqual({ name: 'Pediatría' });
      createReq.flush({ id: 3, name: 'Pediatría', doctors: [] });
      fixture.detectChanges();

      httpTesting.expectOne('assets/doctors.json').flush(mockDoctors);
      httpTesting.expectOne('/api/v1/teams/3/doctors').flush({ id: 3, name: 'Pediatría', doctors: mockDoctors });
      httpTesting
        .expectOne(`/api/v1/rota/${currentYear}?team_id=3`)
        .flush({ message: 'No encontrado' }, { status: 404, statusText: 'Not Found' });
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('.dialog-title')).toBeFalsy();
      expect((fixture.nativeElement.querySelector('#team-select') as HTMLSelectElement).value).toBe('3');
    });

    it('muestra en el diálogo el error del servidor al crear un equipo repetido', () => {
      const { fixture } = setup();
      (fixture.nativeElement.querySelector('.btn-new-team') as HTMLButtonElement).click();
      fixture.detectChanges();
      const input: HTMLInputElement = fixture.nativeElement.querySelector('#team-name');
      input.value = 'Equipo principal';
      input.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      (fixture.nativeElement.querySelector('.btn-submit') as HTMLButtonElement).click();

      httpTesting
        .expectOne('/api/v1/teams')
        .flush({ message: 'Ya existe un equipo llamado «Equipo principal».' }, { status: 400, statusText: 'Bad Request' });
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('.field-error').textContent.trim()).toBe(
        'No se ha podido crear el equipo: Ya existe un equipo llamado «Equipo principal».',
      );
    });

    it('borra el equipo activo tras confirmar y pasa al primero', () => {
      const { fixture, app } = setup();
      app.onTeamSelected(2);
      httpTesting.expectOne('assets/doctors.json').flush(mockDoctors);
      httpTesting.expectOne('/api/v1/teams/2/doctors').flush({ id: 2, name: 'Urgencias Norte', doctors: mockDoctors });
      httpTesting
        .expectOne(`/api/v1/rota/${currentYear}?team_id=2`)
        .flush({ message: 'No encontrado' }, { status: 404, statusText: 'Not Found' });
      fixture.detectChanges();

      (fixture.nativeElement.querySelector('.btn-delete-team') as HTMLButtonElement).click();
      fixture.detectChanges();
      const dialog: HTMLElement = fixture.nativeElement.querySelector('.confirm-dialog-backdrop');
      expect(dialog.textContent).toContain(
        'Se borrará el equipo «Urgencias Norte» con su lista de médicos y todos sus cuadrantes, de todos los años.',
      );
      (dialog.querySelector('.btn-confirm') as HTMLButtonElement).click();
      httpTesting.expectOne('/api/v1/teams/2').flush(null, { status: 204, statusText: 'No Content' });
      httpTesting.expectOne(`/api/v1/rota/${currentYear}?team_id=1`).flush(generatedRotas);
      fixture.detectChanges();

      expect(app['teamName']()).toBe('Equipo principal');
      expect((fixture.nativeElement.querySelector('.btn-delete-team') as HTMLButtonElement).disabled).toBe(true);
    });
  });
});
