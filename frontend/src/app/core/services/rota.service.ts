import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { AddDoctorRequest, GenerateRequest, ReplaceRequest, RotaResponse } from '../models/rota.model';
import { Doctor, RotaType } from '../models/doctor.model';

/** Todas las operaciones van sobre los cuadrantes de un equipo. */
@Injectable({ providedIn: 'root' })
export class RotaService {
  private readonly http = inject(HttpClient);

  getRota(teamId: number, year: number, rotaType: RotaType): Observable<RotaResponse> {
    return this.http.get<RotaResponse>(`/api/v1/rota/${year}/${rotaType}`, { params: { team_id: teamId } });
  }

  getRotas(teamId: number, year: number): Observable<RotaResponse[]> {
    return this.http.get<RotaResponse[]>(`/api/v1/rota/${year}`, { params: { team_id: teamId } });
  }

  exportRotas(teamId: number, year: number): Observable<Blob> {
    return this.http.get(`/api/v1/rota/${year}/export`, { params: { team_id: teamId }, responseType: 'blob' });
  }

  /** Genera de una vez los cuadrantes AC y AP del año; devuelve [AC, AP]. */
  generateRotas(teamId: number, year: number, acPool: Doctor[], apPool: Doctor[],
  ): Observable<RotaResponse[]> {
    const toInput = (doctor: Doctor) => ({
      id: doctor.id,
      name: doctor.name,
      department: doctor.department,
    });
    const request: GenerateRequest = {
      year,
      ac_pool: acPool.map(toInput),
      ap_pool: apPool.map(toInput),
      team_id: teamId,
    };
    return this.http.post<RotaResponse[]>('/api/v1/rota/generate', request);
  }

  /** Borra los cuadrantes AC y AP del año; los festivos se conservan. */
  deleteRotas(teamId: number, year: number): Observable<void> {
    return this.http.delete<void>(`/api/v1/rota/${year}`, { params: { team_id: teamId } });
  }

  addDoctor(teamId: number, year: number, rotaType: RotaType, request: AddDoctorRequest): Observable<RotaResponse> {
    return this.http.post<RotaResponse>(`/api/v1/rota/${year}/${rotaType}/add`, request, {
      params: { team_id: teamId },
    });
  }

  replaceDoctor(teamId: number, year: number, rotaType: RotaType, request: ReplaceRequest): Observable<RotaResponse> {
    return this.http.patch<RotaResponse>(`/api/v1/rota/${year}/${rotaType}/replace`, request, {
      params: { team_id: teamId },
    });
  }

  getRotaByDoctor(teamId: number, year: number, rotaType: RotaType, doctorId: string): Observable<RotaResponse> {
    return this.http.get<RotaResponse>(`/api/v1/rota/${year}/${rotaType}`, {
      params: { doctor_id: doctorId, team_id: teamId },
    });
  }
}
