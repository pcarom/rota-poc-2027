import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { DoctorPoolService } from './doctor-pool.service';
import { Doctor } from '../models/doctor.model';
import { Team } from '../models/team.model';

describe('DoctorPoolService', () => {
  let service: DoctorPoolService;
  let httpTesting: HttpTestingController;

  const mockDoctors: Doctor[] = [
    { id: 'doc-001', name: 'Dr. Garcia', department: 'Medicina General', rota_type: 'AC' },
    { id: 'doc-002', name: 'Dr. Lopez', department: 'Pediatria', rota_type: 'AC' },
    { id: 'doc-011', name: 'Dr. Navarro', department: 'Urologia', rota_type: 'AP' },
  ];

  const team = (doctors: Doctor[], id = 1): Team => ({ id, name: `Equipo ${id}`, doctors });

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(DoctorPoolService);
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTesting.verify();
  });

  /** Carga un equipo vacío: pide la lista inicial y la guarda como lista del equipo. */
  function loadSeededTeam(): void {
    service.loadTeam(team([]));
    httpTesting.expectOne('assets/doctors.json').flush(mockDoctors);
    const saveReq = httpTesting.expectOne('/api/v1/teams/1/doctors');
    expect(saveReq.request.method).toBe('PUT');
    expect(saveReq.request.body).toEqual({ doctors: mockDoctors });
    saveReq.flush(team(mockDoctors));
  }

  it('carga los médicos del equipo sin pedir la lista inicial', () => {
    service.loadTeam(team(mockDoctors));

    expect(service.doctors().map((d) => d.id)).toEqual(['doc-001', 'doc-002', 'doc-011']);
  });

  it('un equipo sin médicos empieza con assets/doctors.json y la guarda', () => {
    loadSeededTeam();

    expect(service.doctors().length).toBe(3);
    expect(service.doctors()[0].name).toBe('Dr. Garcia');
  });

  it('al cambiar de equipo sustituye los médicos y olvida el orden de generación', () => {
    service.loadTeam(team(mockDoctors));
    service.applyOrder('AC', ['doc-002', 'doc-001']);

    const other: Doctor[] = [{ id: 'doc-001', name: 'Dra. Otra', department: 'X', rota_type: 'AC' }, mockDoctors[1]];
    service.loadTeam(team(other, 2));

    expect(service.doctors().map((d) => d.name)).toEqual(['Dra. Otra', 'Dr. Lopez']);
  });

  it('ignora la lista inicial si mientras llega se ha cambiado de equipo', () => {
    service.loadTeam(team([]));
    service.loadTeam(team([mockDoctors[2]], 2));
    httpTesting.expectOne('assets/doctors.json').flush(mockDoctors);

    expect(service.doctors().map((d) => d.id)).toEqual(['doc-011']);
  });

  it('reordena el grupo indicado sin tocar el otro', () => {
    service.loadTeam(team(mockDoctors));

    service.applyOrder('AC', ['doc-002', 'doc-001']);

    expect(service.doctors().map((d) => d.id)).toEqual(['doc-002', 'doc-001', 'doc-011']);
  });

  it('aplica el orden guardado si los médicos se cargan después', () => {
    service.loadTeam(team([]));
    service.applyOrder('AC', ['doc-002', 'doc-001']);
    httpTesting.expectOne('assets/doctors.json').flush(mockDoctors);
    httpTesting.expectOne('/api/v1/teams/1/doctors').flush(team(mockDoctors));

    expect(service.getDoctorsByType('AC').map((d) => d.id)).toEqual(['doc-002', 'doc-001']);
  });

  it('deja al final los médicos que no figuran en el orden', () => {
    service.loadTeam(team(mockDoctors));

    service.applyOrder('AC', ['doc-002']);

    expect(service.getDoctorsByType('AC').map((d) => d.id)).toEqual(['doc-002', 'doc-001']);
  });

  it('resetOrder vuelve al orden original y conserva las altas manuales', () => {
    service.loadTeam(team(mockDoctors));
    const newDoctor: Doctor = { id: 'doc-099', name: 'Dr. Nuevo', department: 'X', rota_type: 'AC' };
    service.addDoctor(newDoctor).subscribe();
    httpTesting.expectOne('/api/v1/teams/1/doctors').flush(team([...mockDoctors, newDoctor]));
    service.applyOrder('AC', ['doc-099', 'doc-002', 'doc-001']);

    service.resetOrder();

    expect(service.getDoctorsByType('AC').map((d) => d.id)).toEqual(['doc-001', 'doc-002', 'doc-099']);
  });

  it('resetOrder impide que un orden anterior se reaplique al cargar', () => {
    service.loadTeam(team([]));
    service.applyOrder('AC', ['doc-002', 'doc-001']);
    service.resetOrder();
    httpTesting.expectOne('assets/doctors.json').flush(mockDoctors);
    httpTesting.expectOne('/api/v1/teams/1/doctors').flush(team(mockDoctors));

    expect(service.getDoctorsByType('AC').map((d) => d.id)).toEqual(['doc-001', 'doc-002']);
  });

  it('añade un médico guardando la lista del equipo en su orden original', () => {
    service.loadTeam(team(mockDoctors));
    service.applyOrder('AC', ['doc-002', 'doc-001']);
    const newDoctor: Doctor = { id: 'doc-004', name: 'Dr. Fernandez', department: 'Neurologia', rota_type: 'AC' };

    service.addDoctor(newDoctor).subscribe();
    const req = httpTesting.expectOne('/api/v1/teams/1/doctors');
    expect(req.request.body.doctors.map((d: Doctor) => d.id)).toEqual(['doc-001', 'doc-002', 'doc-011', 'doc-004']);
    // Hasta que el servidor confirma, la lista no cambia.
    expect(service.doctors().length).toBe(3);
    req.flush(team([...mockDoctors, newDoctor]));

    expect(service.doctors().length).toBe(4);
    expect(service.doctors()[3].name).toBe('Dr. Fernandez');
  });

  it('sustituye la lista entera por la de un fichero', () => {
    loadSeededTeam();
    service.applyOrder('AC', ['doc-002', 'doc-001']);
    const uploaded: Doctor[] = [
      { id: 'doc-100', name: 'Dra. Subida', department: 'Urgencias', rota_type: 'AP' },
      { id: 'doc-101', name: 'Dr. Subido', department: 'Urgencias', rota_type: 'AC' },
    ];

    service.replaceDoctors(uploaded).subscribe();
    const req = httpTesting.expectOne('/api/v1/teams/1/doctors');
    expect(req.request.body).toEqual({ doctors: uploaded });
    req.flush(team(uploaded));

    expect(service.doctors()).toEqual(uploaded);
    expect(service.acDoctors().map((d) => d.id)).toEqual(['doc-101']);
  });

  it('should return AC and AP doctors via computed signals and by type', () => {
    service.loadTeam(team(mockDoctors));

    expect(service.acDoctors().length).toBe(2);
    expect(service.acDoctors().every((d) => d.rota_type === 'AC')).toBe(true);
    expect(service.apDoctors().map((d) => d.rota_type)).toEqual(['AP']);
    expect(service.getDoctorsByType('AC').length).toBe(2);
    expect(service.getDoctorsByType('AP').length).toBe(1);
  });
});
