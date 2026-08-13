import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { finalize } from 'rxjs';
import { CheckinFilter, CheckinOption, CheckinReportService, CheckinRow, CheckinUser } from '../../services/checkin-report.service';
import { SearchableSelectOption } from '../../shared/components/searchable-select/searchable-select.component';

@Component({standalone:false,selector:'app-checkin-reports',templateUrl:'./checkin-reports.component.html',styleUrls:['./checkin-reports.component.scss']})
export class CheckinReportsComponent implements OnInit {
  rows:CheckinRow[]=[];users:CheckinUser[]=[];divisions:CheckinOption[]=[];branches:CheckinOption[]=[];designations:CheckinOption[]=[];userOptions:SearchableSelectOption[]=[];designationOptions:SearchableSelectOption[]=[];total=0;loading=false;exporting=false;error='';searchTimer?:number;
  filter:CheckinFilter={page:1,pageSize:25,search:'',startDate:'',endDate:'',userId:null,divisionId:null,branchId:null,designationIds:[]};
  constructor(private service:CheckinReportService,private cdr:ChangeDetectorRef){}
  ngOnInit(){this.service.options().subscribe({next:x=>{this.users=x.users;this.divisions=x.divisions;this.branches=x.branches;this.designations=x.designations;this.userOptions=x.users.map(u=>({id:u.id,label:`${u.name}${u.mobile?` (${u.mobile})`:''}`}));this.designationOptions=x.designations.map(d=>({id:d.id,label:d.name}));this.filter.designationIds=x.designations.filter(d=>['ASR','DSR'].includes(d.name.trim().toUpperCase())).map(d=>d.id);this.load();this.cdr.detectChanges();},error:e=>{this.error=e.message;this.load();}});}
  load(){this.loading=true;this.error='';this.service.list(this.filter).pipe(finalize(()=>{this.loading=false;this.cdr.detectChanges();})).subscribe({next:r=>{this.rows=r.rows;this.total=r.total;this.filter.page=r.page;},error:e=>this.error=e.message});}
  apply(){this.filter.page=1;this.load();}
  search(){if(this.searchTimer)clearTimeout(this.searchTimer);this.searchTimer=window.setTimeout(()=>this.apply(),450);}
  page(p:number){this.filter.page=p;this.load();}
  designationChange(values:Array<number|string>){this.filter.designationIds=(values||[]).map(Number).filter(x=>Number.isFinite(x)&&x>0);this.apply();}
  clear(){this.filter={page:1,pageSize:25,search:'',startDate:'',endDate:'',userId:null,divisionId:null,branchId:null,designationIds:[]};this.load();}
  download(){this.exporting=true;this.service.export(this.filter).pipe(finalize(()=>{this.exporting=false;this.cdr.detectChanges();})).subscribe({next:b=>{const u=URL.createObjectURL(b),a=document.createElement('a');a.href=u;a.download='checkin-checkout.xlsx';a.click();URL.revokeObjectURL(u);},error:e=>this.error=e.message});}
  date(v:any){return v?String(v).slice(0,10):'-';} money(v:any){return Number(v||0).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2});}
}
