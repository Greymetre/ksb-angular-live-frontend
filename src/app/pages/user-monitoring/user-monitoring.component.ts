import { ChangeDetectorRef, Component, ElementRef, OnInit, ViewChild } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { ActivatedRoute } from '@angular/router';
import { API_BASE_URL, GOOGLE_MAPS_API_KEY } from '../../config/api.config';
import { AuthService } from '../../services/auth.service';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { finalize } from 'rxjs/operators';
import { normalizeMapCoordinates } from '../../shared/utils/map-coordinates';

@Component({selector:'app-user-monitoring',standalone:false,templateUrl:'./user-monitoring.component.html',styleUrls:['./user-monitoring.component.scss','./user-monitoring-actions.component.scss']})
export class UserMonitoringComponent implements OnInit {
  @ViewChild('routeMapCanvas') routeMapElement?:ElementRef<HTMLDivElement>;
  mode:'apps'|'live'='apps'; users:any[]=[]; allUsers:any[]=[]; branches:any[]=[]; divisions:any[]=[]; departments:any[]=[];
  rows:any[]=[]; locations:any[]=[]; activities:any[]=[]; selectedPoint:any=null; selectedMapUrl:SafeResourceUrl|null=null;
  userId=''; branchId=''; divisionId=''; departmentId=''; date=new Date().toISOString().slice(0,10); toDate=this.date;
  page=1;pageSize=10;total=0;lastPage=1;
  loading=false; optionsLoading=false; error=''; success=''; action:'details'|'complete'|'track'='details';
  confirmAction:'logout'|'uuid'|null=null; confirmRow:any=null; actionLoading=false;
  private requestSequence=0;
  private static mapsLoader?:Promise<void>;
  constructor(private http:HttpClient,private route:ActivatedRoute,private auth:AuthService,private sanitizer:DomSanitizer,private cdr:ChangeDetectorRef){}
  ngOnInit(){this.mode=this.route.snapshot.data['mode']||'apps';this.options();if(this.mode==='apps')this.load();}
  headers(){const token=this.auth.getToken();return token?new HttpHeaders({Authorization:`Bearer ${token}`}):new HttpHeaders();}
  get canForceLogout(){return this.auth.hasPermission('user_app_force_logout');}
  get canResetUuid(){return this.auth.hasPermission('user_app_uuid_reset');}
  canLogoutRow(row:any){return row?.login_status==='1'&&this.canForceLogout;}
  canResetUuidRow(row:any){return !!row?.unique_id&&this.canResetUuid;}
  options(){
    this.optionsLoading=true;
    this.http.get<any>(`${API_BASE_URL}/user-monitoring/options`,{headers:this.headers()}).subscribe({
      next:r=>{this.allUsers=r.users||[];this.users=[...this.allUsers];this.branches=r.branches||[];this.divisions=r.divisions||[];this.departments=r.departments||[];this.optionsLoading=false;this.refreshView();},
      error:e=>{this.optionsLoading=false;this.fail(e);}
    });
  }
  filtersChanged(){
    this.users=this.allUsers.filter(u=>(!this.branchId||this.hasId(u.branch_id,this.branchId))&&(!this.divisionId||this.hasId(u.division_id,this.divisionId))&&(!this.departmentId||this.hasId(u.department_id,this.departmentId)));
    if(this.userId&&!this.users.some(u=>String(u.id)===String(this.userId)))this.userId='';
  }
  private hasId(value:any,selected:any){return String(value??'').split(',').map(x=>x.trim()).includes(String(selected));}
  load(){
    const requestId=++this.requestSequence;this.loading=true;this.error='';
    if(this.mode==='apps'){
      let p=new HttpParams().set('page',this.page).set('page_size',this.pageSize);if(this.userId)p=p.set('user_id',this.userId);
      this.http.get<any>(`${API_BASE_URL}/user-app-details`,{headers:this.headers(),params:p}).pipe(finalize(()=>this.finishLoading(requestId))).subscribe({next:r=>{this.rows=r.data||[];this.page=Number(r.pagination?.current_page||1);this.pageSize=Number(r.pagination?.page_size||this.pageSize);this.total=Number(r.pagination?.total||0);this.lastPage=Number(r.pagination?.last_page||1);},error:e=>this.fail(e,false)});return;
    }
    this.runAction('details');
  }
  runAction(action:'details'|'complete'|'track'){
    if(!this.userId){this.error='Please select a user.';this.locations=[];this.activities=[];this.loading=false;return;}
    const requestId=++this.requestSequence;this.action=action;this.loading=true;this.error='';this.locations=[];this.activities=[];this.selectedPoint=null;this.selectedMapUrl=null;
    if(action==='details'){
      const p=new HttpParams().set('user_id',this.userId).set('date',this.date);
      this.http.get<any>(`${API_BASE_URL}/user/activity`,{headers:this.headers(),params:p}).pipe(finalize(()=>this.finishLoading(requestId))).subscribe({next:r=>{if(requestId===this.requestSequence)this.activities=r.data||[];},error:e=>this.fail(e,false)});return;
    }
    let p=new HttpParams().set('user_id',this.userId).set('mode',action);
    if(action==='complete')p=p.set('date',this.date).set('to_date',this.toDate);
    this.http.get<any>(`${API_BASE_URL}/user-live-activity/map`,{headers:this.headers(),params:p}).pipe(finalize(()=>this.finishLoading(requestId))).subscribe({next:r=>{if(requestId===this.requestSequence){this.locations=r.locations||[];setTimeout(()=>this.drawRouteMap(action==='track'),0);}},error:e=>this.fail(e,false)});
  }
  normalized(point:any){const coordinates=normalizeMapCoordinates(point?.latitude,point?.longitude);return coordinates?{...point,...coordinates}:{...point,latitude:Number.NaN,longitude:Number.NaN};}
  selectPoint(point:any){
    const selected=this.normalized(point),latitude=Number(selected.latitude),longitude=Number(selected.longitude);
    if(!Number.isFinite(latitude)||!Number.isFinite(longitude)||Math.abs(latitude)>90||Math.abs(longitude)>180){
      this.error='Valid location coordinates are not available for this activity.';this.selectedPoint=null;this.selectedMapUrl=null;return;
    }
    this.error='';this.selectedPoint={...selected,latitude,longitude};
    this.selectedMapUrl=this.sanitizer.bypassSecurityTrustResourceUrl(`https://maps.google.com/maps?q=${latitude},${longitude}&z=15&output=embed`);
    setTimeout(()=>this.routeMapElement?.nativeElement?.scrollIntoView({behavior:'smooth',block:'center'}),0);
  }
  map(lat:any,lng:any){const coordinates=normalizeMapCoordinates(lat,lng);if(!coordinates)return;window.open(`https://www.google.com/maps/search/?api=1&query=${coordinates.latitude},${coordinates.longitude}`,'_blank','noopener');}
  routeMap(){
    const valid=this.locations.map(x=>this.normalized(x)).filter(x=>Number.isFinite(Number(x.latitude))&&Number.isFinite(Number(x.longitude))&&Math.abs(Number(x.latitude))<=90&&Math.abs(Number(x.longitude))<=180).slice(0,10);if(!valid.length)return;
    const first=valid[0],last=valid[valid.length-1],waypoints=valid.slice(1,-1).map(x=>`${x.latitude},${x.longitude}`).join('|');
    let url=`https://www.google.com/maps/dir/?api=1&origin=${first.latitude},${first.longitude}&destination=${last.latitude},${last.longitude}`;if(waypoints)url+=`&waypoints=${encodeURIComponent(waypoints)}`;window.open(url,'_blank','noopener');
  }
  private loadGoogleMaps(){
    const w=window as any;if(w.google?.maps)return Promise.resolve();if(UserMonitoringComponent.mapsLoader)return UserMonitoringComponent.mapsLoader;
    if(!GOOGLE_MAPS_API_KEY)return Promise.reject(new Error('Google Maps API key is not configured.'));
    UserMonitoringComponent.mapsLoader=new Promise<void>((resolve,reject)=>{const callback=`ksbMapReady${Date.now()}`;w[callback]=()=>{delete w[callback];resolve();};const script=document.createElement('script');script.async=true;script.defer=true;script.onerror=()=>reject(new Error('Unable to load Google Maps.'));script.src=`https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(GOOGLE_MAPS_API_KEY)}&callback=${callback}`;document.head.appendChild(script);});
    return UserMonitoringComponent.mapsLoader;
  }
  private async drawRouteMap(roadWise:boolean){
    const points=this.locations.map(x=>this.normalized(x)).filter(x=>Number.isFinite(x.latitude)&&Number.isFinite(x.longitude)&&Math.abs(x.latitude)<=90&&Math.abs(x.longitude)<=180);
    if(!points.length||!this.routeMapElement)return;
    try{
      await this.loadGoogleMaps();const g=(window as any).google;const map=new g.maps.Map(this.routeMapElement.nativeElement,{zoom:14,center:{lat:points[0].latitude,lng:points[0].longitude},mapTypeId:g.maps.MapTypeId.ROADMAP});
      const bounds=new g.maps.LatLngBounds();points.forEach((p:any,index:number)=>{const position={lat:p.latitude,lng:p.longitude};bounds.extend(position);const marker=new g.maps.Marker({map,position,label:String(index+1),title:`${p.name||'Location'} ${p.time||''}`});const formattedTime=p.time?new Date(p.time).toLocaleString('en-IN',{dateStyle:'medium',timeStyle:'short'}):'-';const info=new g.maps.InfoWindow({content:`<div style="min-width:180px"><strong>${p.name||'Location'}</strong><br><span>${formattedTime}</span>${p.address?`<br><span>${p.address}</span>`:''}<br><small>${p.latitude}, ${p.longitude}</small></div>`});marker.addListener('mouseover',()=>info.open({map,anchor:marker}));marker.addListener('mouseout',()=>info.close());marker.addListener('click',()=>info.open({map,anchor:marker}));});
      if(points.length>1&&roadWise){const service=new g.maps.DirectionsService();for(let i=0;i<points.length-1;i+=25){const chunk=points.slice(i,i+26);if(chunk.length<2)continue;const renderer=new g.maps.DirectionsRenderer({map,suppressMarkers:true,preserveViewport:true});service.route({origin:{lat:chunk[0].latitude,lng:chunk[0].longitude},destination:{lat:chunk[chunk.length-1].latitude,lng:chunk[chunk.length-1].longitude},waypoints:chunk.slice(1,-1).map((p:any)=>({location:{lat:p.latitude,lng:p.longitude},stopover:true})),travelMode:g.maps.TravelMode.WALKING},(result:any,status:any)=>{if(status==='OK')renderer.setDirections(result);});}}
      else if(points.length>1)new g.maps.Polyline({map,path:points.map((p:any)=>({lat:p.latitude,lng:p.longitude})),geodesic:true,strokeColor:'#1976d2',strokeOpacity:.9,strokeWeight:4});
      map.fitBounds(bounds);
    }catch(e:any){this.error=e?.message||'Unable to render route map.';}
  }
  finishLoading(requestId:number){if(requestId===this.requestSequence){this.loading=false;this.refreshView();}}
  applyAppFilter(){this.page=1;this.load();}
  changePage(page:number){if(page<1||page>this.lastPage||page===this.page)return;this.page=page;this.load();}
  changePageSize(){this.page=1;this.load();}
  openConfirmation(row:any,action:'logout'|'uuid'){this.confirmRow=row;this.confirmAction=action;this.error='';this.success='';}
  closeConfirmation(){if(this.actionLoading)return;this.confirmAction=null;this.confirmRow=null;}
  confirmDeviceAction(){
    if(!this.confirmRow||!this.confirmAction||this.actionLoading)return;
    const row=this.confirmRow,action=this.confirmAction;
    const url=action==='logout'?`${API_BASE_URL}/user-app-details/${row.user_id}/force-logout`:`${API_BASE_URL}/user-app-details/${row.user_id}/unique-id`;
    this.actionLoading=true;this.error='';this.success='';
    const request=action==='logout'?this.http.post<any>(url,{}, {headers:this.headers()}):this.http.delete<any>(url,{headers:this.headers()});
    request.pipe(finalize(()=>this.actionLoading=false)).subscribe({next:r=>{row.login_status='0';if(action==='uuid')row.unique_id='';this.success=r?.message||(action==='logout'?'User logged out successfully.':'Device UUID removed successfully.');this.confirmAction=null;this.confirmRow=null;this.refreshView();},error:e=>this.fail(e)});
  }
  get visiblePages(){const count=Math.min(5,this.lastPage);let start=Math.max(1,this.page-Math.floor(count/2));start=Math.min(start,Math.max(1,this.lastPage-count+1));return Array.from({length:count},(_,i)=>start+i);}
  private refreshView(){queueMicrotask(()=>{if(!(this.cdr as any).destroyed)this.cdr.detectChanges();});}
  fail(e:any,stopLoading=true){this.error=e?.status===401?'Your session has expired. Please log in again.':(e?.error?.message||e?.message||'Request failed');if(stopLoading)this.loading=false;}
}
