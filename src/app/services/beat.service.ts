import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable, catchError, map, throwError } from 'rxjs';
import { API_BASE_URL } from '../config/api.config';
import { AuthService } from './auth.service';
import { asPagedArray, PagedArray } from '../shared/utils/paged-array';

export interface BeatRow { id:number; active:string; beatName:string; description:string; cityId?:string; userCount:number; customerCount:number; scheduleCount:number; }
export interface BeatOption { id:number; name:string; mobile?:string; }
export interface BeatOptions { users:BeatOption[]; customers:BeatOption[]; cities:BeatOption[]; }
export interface BeatSchedule { id?:number; userId:number; beatDate:string; active?:string; }
export interface BeatDetail { beat:BeatRow; userIds:number[]; customerIds:number[]; schedules:BeatSchedule[]; }
export interface BeatPayload { beatName:string; description:string; active:string; cityIds:number[]; userIds:number[]; customerIds:number[]; schedules:BeatSchedule[]; }

@Injectable({ providedIn: 'root' })
export class BeatService {
  constructor(private http:HttpClient, private auth:AuthService) {}
  list(search='',page=1,pageSize=10):Observable<PagedArray<BeatRow>> { let params=new HttpParams().set('page',page).set('page_size',pageSize); if(search) params=params.set('search',search); return this.http.get<any>(`${API_BASE_URL}/beats`,{headers:this.headers(),params}).pipe(map(r=>asPagedArray(this.array(r?.beats).map((x:any)=>this.row(x)),r,page,pageSize)),catchError(e=>this.error(e))); }
  options():Observable<BeatOptions> { return this.http.get<any>(`${API_BASE_URL}/beats/options`,{headers:this.headers()}).pipe(map(r=>({users:this.optionsOf(r?.users),customers:this.optionsOf(r?.customers),cities:this.optionsOf(r?.cities)})),catchError(e=>this.error(e))); }
  get(id:number):Observable<BeatDetail> { return this.http.get<any>(`${API_BASE_URL}/beats/${id}`,{headers:this.headers()}).pipe(map(r=>({beat:this.row(r.beat),userIds:this.nums(r.user_ids??r.userIds),customerIds:this.nums(r.customer_ids??r.customerIds),schedules:this.array(r.schedules).map((x:any)=>({id:+(x.id??0),userId:+(x.user_id??x.userId??0),beatDate:String(x.beat_date??x.beatDate??'').slice(0,10),active:x.active}))})),catchError(e=>this.error(e))); }
  create(p:BeatPayload){ return this.action(this.http.post<any>(`${API_BASE_URL}/beats`,this.payload(p),{headers:this.headers()})); }
  update(id:number,p:BeatPayload){ return this.action(this.http.put<any>(`${API_BASE_URL}/beats/${id}`,this.payload(p),{headers:this.headers()})); }
  status(id:number,active:string){ return this.action(this.http.patch<any>(`${API_BASE_URL}/beats/${id}/status`,{active},{headers:this.headers()})); }
  delete(id:number){ return this.action(this.http.delete<any>(`${API_BASE_URL}/beats/${id}`,{headers:this.headers()})); }
  private action(req:Observable<any>){ return req.pipe(map(r=>String(r?.message||'Completed successfully.')),catchError(e=>this.error(e))); }
  private headers(){const token=this.auth.getToken();return token?new HttpHeaders({Authorization:`Bearer ${token}`}):new HttpHeaders();}
  private array(v:any):any[]{return Array.isArray(v)?v:Array.isArray(v?.$values)?v.$values:[];}
  private nums(v:any):number[]{return this.array(v).map(Number).filter(Boolean);}
  private optionsOf(v:any):BeatOption[]{return this.array(v).map((x:any)=>({id:+(x.id??0),name:String(x.name??''),mobile:x.mobile}));}
  private row(x:any):BeatRow{return{id:+(x.id??0),active:String(x.active??'Y'),beatName:String(x.beat_name??x.beatName??''),description:String(x.description??''),cityId:x.city_id??x.cityId,userCount:+(x.user_count??x.userCount??0),customerCount:+(x.customer_count??x.customerCount??0),scheduleCount:+(x.schedule_count??x.scheduleCount??0)};}
  private payload(p:BeatPayload){return{beat_name:p.beatName,description:p.description,active:p.active,city_ids:p.cityIds,user_ids:p.userIds,customer_ids:p.customerIds,schedules:p.schedules.map(x=>({user_id:x.userId,beat_date:x.beatDate}))};}
  private error(e:any){return throwError(()=>new Error(e?.error?.message||e?.message||'Beat request failed.'));}
}
