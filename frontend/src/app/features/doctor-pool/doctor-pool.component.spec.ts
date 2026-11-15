import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DoctorPoolComponent } from './doctor-pool.component';
import { Doctor } from '../../core/models/doctor.model';

describe('DoctorPoolComponent', () => {
  let component: DoctorPoolComponent;
  let fixture: ComponentFixture<DoctorPoolComponent>;

  const mockDoctors: Doctor[] = [
    { id: 'doc-001', name: 'Dr. Garcia', department: 'Medicina General', rota_type: 'AC' },
    { id: 'doc-002', name: 'Dr. Lopez', department: 'Pediatria', rota_type: 'AC' },
    { id: 'doc-003', name: 'Dr. Martinez', department: 'Cardiologia', rota_type: 'AC' },
  ];

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DoctorPoolComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(DoctorPoolComponent);
    component = fixture.componentInstance;
  });

  it('should display doctor cards from pool', () => {
    fixture.componentRef.setInput('doctors', mockDoctors);
    fixture.componentRef.setInput('activeTab', 'AC');
    fixture.componentRef.setInput('hasExistingRota', false);
    fixture.detectChanges();

    const cards = fixture.nativeElement.querySelectorAll('app-doctor-card');
    expect(cards.length).toBe(3);
  });

  it('should show AC and AP tabs', () => {
    fixture.componentRef.setInput('doctors', mockDoctors);
    fixture.componentRef.setInput('activeTab', 'AC');
    fixture.componentRef.setInput('hasExistingRota', false);
    fixture.detectChanges();

    const tabs = fixture.nativeElement.querySelectorAll('.tab-btn');
    expect(tabs.length).toBe(2);
    expect(tabs[0].textContent.trim()).toBe('AC');
    expect(tabs[1].textContent.trim()).toBe('AP');
  });

  it('should highlight active AC tab', () => {
    fixture.componentRef.setInput('doctors', mockDoctors);
    fixture.componentRef.setInput('activeTab', 'AC');
    fixture.componentRef.setInput('hasExistingRota', false);
    fixture.detectChanges();

    const tabs = fixture.nativeElement.querySelectorAll('.tab-btn');
    expect(tabs[0].classList.contains('tab-active')).toBe(true);
    expect(tabs[1].classList.contains('tab-active')).toBe(false);
  });

  it('should show Add Doctor button', () => {
    fixture.componentRef.setInput('doctors', mockDoctors);
    fixture.componentRef.setInput('activeTab', 'AC');
    fixture.componentRef.setInput('hasExistingRota', false);
    fixture.detectChanges();

    const addButton = fixture.nativeElement.querySelector('.btn-add-doctor');
    expect(addButton).toBeTruthy();
    expect(addButton.textContent.trim()).toContain('Añadir médico');
  });

  it('should show Generate AC Rota button when no rota exists', () => {
    fixture.componentRef.setInput('doctors', mockDoctors);
    fixture.componentRef.setInput('activeTab', 'AC');
    fixture.componentRef.setInput('hasExistingRota', false);
    fixture.detectChanges();

    const generateButton = fixture.nativeElement.querySelector('.btn-generate');
    expect(generateButton).toBeTruthy();
    expect(generateButton.textContent.trim()).toBe('Generar cuadrante');
  });

  it('should show Re-generate AC Rota button when rota exists', () => {
    fixture.componentRef.setInput('doctors', mockDoctors);
    fixture.componentRef.setInput('activeTab', 'AC');
    fixture.componentRef.setInput('hasExistingRota', true);
    fixture.detectChanges();

    const generateButton = fixture.nativeElement.querySelector('.btn-generate');
    expect(generateButton).toBeTruthy();
    expect(generateButton.textContent.trim()).toBe('Regenerar cuadrante');
  });

  it('should emit generateRota event when button clicked', () => {
    fixture.componentRef.setInput('doctors', mockDoctors);
    fixture.componentRef.setInput('activeTab', 'AC');
    fixture.componentRef.setInput('hasExistingRota', false);
    fixture.detectChanges();

    const spy = vi.fn();
    component.generateRota.subscribe(spy);

    const generateButton = fixture.nativeElement.querySelector('.btn-generate');
    generateButton.click();
    expect(spy).toHaveBeenCalled();
  });

  it('should emit poolTabChange when tab is clicked', () => {
    fixture.componentRef.setInput('doctors', mockDoctors);
    fixture.componentRef.setInput('activeTab', 'AC');
    fixture.componentRef.setInput('hasExistingRota', false);
    fixture.detectChanges();

    const spy = vi.fn();
    component.poolTabChange.subscribe(spy);

    const tabs = fixture.nativeElement.querySelectorAll('.tab-btn');
    tabs[1].click(); // Click AP tab
    expect(spy).toHaveBeenCalledWith('AP');
  });

  it('should emit addDoctor event when Add Doctor clicked', () => {
    fixture.componentRef.setInput('doctors', mockDoctors);
    fixture.componentRef.setInput('activeTab', 'AC');
    fixture.componentRef.setInput('hasExistingRota', false);
    fixture.detectChanges();

    const spy = vi.fn();
    component.addDoctorClick.subscribe(spy);

    const addButton = fixture.nativeElement.querySelector('.btn-add-doctor');
    addButton.click();
    expect(spy).toHaveBeenCalled();
  });

  describe('cargar lista de médicos', () => {
    function setup() {
      fixture.componentRef.setInput('doctors', mockDoctors);
      fixture.componentRef.setInput('activeTab', 'AC');
      fixture.detectChanges();
    }

    function chooseFile(file: File) {
      const input: HTMLInputElement = fixture.nativeElement.querySelector('input[type=file]');
      Object.defineProperty(input, 'files', { value: [file], configurable: true });
      return component.onFileSelected(input);
    }

    it('muestra el botón «Cargar lista» con un selector de ficheros JSON o CSV oculto', () => {
      setup();
      const button: HTMLButtonElement = fixture.nativeElement.querySelector('.btn-upload');
      expect(button.textContent?.trim()).toBe('Cargar lista');
      const input: HTMLInputElement = fixture.nativeElement.querySelector('input[type=file]');
      expect(input.accept).toContain('.json');
      expect(input.accept).toContain('.csv');
    });

    it('emite los médicos leídos del fichero', async () => {
      setup();
      const spy = vi.fn();
      component.doctorsFileLoaded.subscribe(spy);

      await chooseFile(new File(['Nombre;Departamento;Grupo\nDra. Muñoz;Urgencias;AP'], 'equipo.csv'));

      expect(spy).toHaveBeenCalledWith({
        fileName: 'equipo.csv',
        doctors: [{ id: 'doc-001', name: 'Dra. Muñoz', department: 'Urgencias', rota_type: 'AP' }],
      });
    });

    it('emite el motivo cuando el fichero no es válido', async () => {
      setup();
      const loaded = vi.fn();
      const failed = vi.fn();
      component.doctorsFileLoaded.subscribe(loaded);
      component.doctorsFileError.subscribe(failed);

      await chooseFile(new File(['Nombre;Grupo\nDr. A;XX'], 'malo.csv'));

      expect(loaded).not.toHaveBeenCalled();
      expect(failed).toHaveBeenCalledWith(
        'No se ha podido leer «malo.csv»: Línea 2: el grupo debe ser AC o AP (se ha leído «XX»).',
      );
    });
  });

  describe('método de asignación', () => {
    function setup(extra: Record<string, unknown> = {}) {
      fixture.componentRef.setInput('doctors', mockDoctors);
      fixture.componentRef.setInput('activeTab', 'AC');
      for (const [k, v] of Object.entries(extra)) {
        fixture.componentRef.setInput(k, v);
      }
      fixture.detectChanges();
    }

    it('no debe mostrar ningún selector de método de asignación', () => {
      setup();
      expect(fixture.nativeElement.querySelector('select')).toBeNull();
      expect(fixture.nativeElement.querySelector('.strategy-field')).toBeNull();
      expect(fixture.nativeElement.textContent).not.toContain('Método de asignación');
    });

    it('debe mostrar "Generado con: Ruedas (retirado)" para un cuadrante antiguo wheels', () => {
      setup({ hasExistingRota: true, generatedStrategy: 'wheels' });
      const note = fixture.nativeElement.querySelector('.generated-with');
      expect(note.textContent?.trim()).toBe('Generado con: Ruedas (retirado)');
    });

    it('debe mostrar "Generado con: Equilibrado (retirado)" para un cuadrante antiguo balanced', () => {
      setup({ hasExistingRota: true, generatedStrategy: 'balanced' });
      const note = fixture.nativeElement.querySelector('.generated-with');
      expect(note.textContent?.trim()).toBe('Generado con: Equilibrado (retirado)');
    });

    it('no debe mostrar "Generado con" para single-wheel', () => {
      setup({ hasExistingRota: true, generatedStrategy: 'single-wheel' });
      expect(fixture.nativeElement.querySelector('.generated-with')).toBeNull();
    });

    it('no debe mostrar "Generado con" sin cuadrante', () => {
      setup({ hasExistingRota: false, generatedStrategy: null });
      expect(fixture.nativeElement.querySelector('.generated-with')).toBeNull();
    });
  });
});
