import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable, catchError, map, throwError } from 'rxjs';
import { API_BASE_URL } from '../config/api.config';
import { AuthService } from './auth.service';

export interface CheckinRow {[key:string]:any;id:number;checkinDate?:string;checkinTime:string;checkoutDate?:string;checkoutTime:string;timeInterval:string;checkinLatitude:string;checkinLongitude:string;checkoutLatitude:string;checkoutLongitude:string;userId:number;userName:string;employeeCode:string;reportingManager:string;designation:string;division:string;branch:string;customerId:number;customerName:string;customerMobile:string;customerType:string;beatName:string;city:string;district:string;pincode:string;address:string;checkinAddress:string;checkoutAddress:string;distance:string;visitType:string;visitRemark:string;orderQty:number;orderValue:number;uniqueSku:number;uniqueOrders:number;}
export interface CheckinFilter {page:number;pageSize:number;search:string;startDate:string;endDate:string;userId:number|null;divisionId:number|null;branchId:number|null;designationIds:number[];}
export interface CheckinResult {rows:CheckinRow[];total:number;page:number;pageSize:number;}
export interface CheckinUser {id:number;name:string;mobile?:string;}
export interface CheckinOption {id:number;name:string;}
export interface CheckinOptions {users:CheckinUser[];divisions:CheckinOption[];branches:CheckinOption[];designations:CheckinOption[];}

@Injectable({providedIn:'root'})
export class CheckinReportService {
  constructor(private http:HttpClient,private auth:AuthService){}
  list(f:CheckinFilter):Observable<CheckinResult>{return this.http.get<any>(`${API_BASE_URL}/checkin-reports`,{headers:this.headers(),params:this.params(f)}).pipe(map(r=>({rows:this.array(r.rows).map(x=>this.row(x)),total:+(r.total||0),page:+(r.page||1),pageSize:+(r.page_size||25)})),catchError(e=>this.error(e)));}
  options():Observable<CheckinOptions>{return this.http.get<any>(`${API_BASE_URL}/checkin-reports/options`,{headers:this.headers()}).pipe(map(r=>({users:this.array(r.users).map(x=>({id:+x.id,name:String(x.name||''),mobile:x.mobile})),divisions:this.optionsArray(r.divisions),branches:this.optionsArray(r.branches),designations:this.optionsArray(r.designations)})),catchError(e=>this.error(e)));}
  export(f:CheckinFilter):Observable<Blob>{return this.http.get(`${API_BASE_URL}/checkin-reports/export`,{headers:this.headers(),params:this.params(f),responseType:'blob'}).pipe(catchError(e=>this.error(e)));}
  private params(f:CheckinFilter){let p=new HttpParams().set('page',f.page).set('page_size',f.pageSize);if(f.search)p=p.set('search',f.search);if(f.startDate)p=p.set('start_date',f.startDate);if(f.endDate)p=p.set('end_date',f.endDate);if(f.userId)p=p.set('user_id',f.userId);if(f.divisionId)p=p.set('division_id',f.divisionId);if(f.branchId)p=p.set('branch_id',f.branchId);for(const id of f.designationIds||[])p=p.append('designation_id',id);return p;}
  private row(x:any):CheckinRow{const r:any={};for(const [k,v] of Object.entries(x||{}))r[k.replace(/_([a-z])/g,(_,c)=>c.toUpperCase())]=v;return r as CheckinRow;}
  private array(v:any):any[]{return Array.isArray(v)?v:Array.isArray(v?.$values)?v.$values:[];}
  private optionsArray(v:any):CheckinOption[]{return this.array(v).map(x=>({id:+x.id,name:String(x.name||'')}));}
  private headers(){const t=this.auth.getToken();return t?new HttpHeaders({Authorization:`Bearer ${t}`}):new HttpHeaders();}
  private error(e:any){return throwError(()=>new Error(e?.error?.message||e?.message||'Checkin report request failed.'));}
}
