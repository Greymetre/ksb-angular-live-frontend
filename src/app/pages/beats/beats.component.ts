import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { finalize } from 'rxjs';
import { AuthService } from '../../services/auth.service';
import { BeatDetail, BeatImportResult, BeatOption, BeatPayload, BeatRow, BeatSchedule, BeatService } from '../../services/beat.service';
import { copyTable, downloadTablePdf, printTable, TableSnapshot } from '../../shared/utils/table-actions';
import { SearchableSelectOption } from '../../shared/components/searchable-select/searchable-select.component';

@Component({standalone:false,selector:'app-beats',templateUrl:'./beats.component.html',styleUrls:['./beats.component.scss']})
export class BeatsComponent implements OnInit {
  rows:BeatRow[]=[]; options={users:[] as BeatOption[],customers:[] as BeatOption[],cities:[] as BeatOption[]};
  citySelectOptions:SearchableSelectOption[]=[]; userSelectOptions:SearchableSelectOption[]=[]; customerSelectOptions:SearchableSelectOption[]=[];
  form:BeatPayload & {id:number|null}=this.empty(); search=''; showEntries=10; page=1; loading=false; saving=false; showForm=false; showDetail=false; detail:BeatDetail|null=null;
  total=0; busy=''; importResult:BeatImportResult|null=null;
  toast={visible:false,message:'',type:'success' as 'success'|'error'}; private toastId?:number;
  constructor(private service:BeatService,public auth:AuthService,private cdr:ChangeDetectorRef){}
  ngOnInit(){this.load();this.service.options().subscribe({next:x=>{this.options=x;this.citySelectOptions=this.toSelectOptions(x.cities);this.userSelectOptions=this.toSelectOptions(x.users,true);this.customerSelectOptions=this.toSelectOptions(x.customers,true);this.cdr.detectChanges();},error:e=>this.notify(e.message,'error')});}
  get filtered(){return this.rows;}
  get visible(){return this.rows;}
  get canCreate(){return this.auth.hasPermission('beat.create');} get canEdit(){return this.auth.hasPermission('beat.edit');} get canDelete(){return this.auth.hasPermission('beat.delete');}
  get canExport(){return this.auth.hasPermission('beat.export');} get canImport(){return this.auth.hasPermission('beat.import');}
  get canCopy(){return this.auth.hasPermission('beat.copy');} get canPdf(){return this.auth.hasPermission('beat.pdf');} get canPrint(){return this.auth.hasPermission('beat.print');}
  get hasTableActions(){return this.canExport||this.canImport||this.canCopy||this.canPdf||this.canPrint;}
  get assignedUserSelectOptions(){return this.userSelectOptions.filter(option=>this.form.userIds.some(id=>String(id)===String(option.id)));}
  load(){this.loading=true;this.service.list(this.search,this.page,this.showEntries).pipe(finalize(()=>{this.loading=false;this.cdr.detectChanges();})).subscribe({next:x=>{this.rows=x;this.total=x.total;},error:e=>this.notify(e.message,'error')});}
  pageChanged(page:number){this.page=page;this.load();}
  filtersChanged(){this.page=1;this.load();}
  create(){this.form=this.empty();this.showForm=true;}
  edit(row:BeatRow){this.service.get(row.id).subscribe({next:d=>{this.form={id:row.id,beatName:d.beat.beatName,description:d.beat.description,active:d.beat.active,cityIds:this.csv(d.beat.cityId),userIds:d.userIds,customerIds:d.customerIds,schedules:d.schedules.map(x=>({...x}))};this.showForm=true;this.cdr.detectChanges();},error:e=>this.notify(e.message,'error')});}
  view(row:BeatRow){this.service.get(row.id).subscribe({next:d=>{this.detail=d;this.showDetail=true;this.cdr.detectChanges();},error:e=>this.notify(e.message,'error')});}
  save(){if(this.form.beatName.trim().length<2){this.notify('Beat name is required (minimum 2 characters).','error');return;} if(this.form.schedules.some(x=>!x.userId||!x.beatDate)){this.notify('Select user and date for every schedule.','error');return;} this.saving=true;const {id,...payload}=this.form;const req=id?this.service.update(id,payload):this.service.create(payload);req.pipe(finalize(()=>{this.saving=false;this.cdr.detectChanges();})).subscribe({next:m=>{this.showForm=false;this.notify(m,'success');this.load();},error:e=>this.notify(e.message,'error')});}
  remove(row:BeatRow){if(!confirm(`Delete beat "${row.beatName}" and its assignments/schedules?`))return;this.service.delete(row.id).subscribe({next:m=>{this.notify(m,'success');this.load();},error:e=>this.notify(e.message,'error')});}
  toggle(row:BeatRow,e:Event){const old=row.active;row.active=(e.target as HTMLInputElement).checked?'Y':'N';this.service.status(row.id,row.active).subscribe({next:m=>this.notify(m,'success'),error:x=>{row.active=old;this.notify(x.message,'error');}});}
  addSchedule(){this.form.schedules.push({userId:this.form.userIds[0]||0,beatDate:new Date().toISOString().slice(0,10)});}
  removeSchedule(i:number){this.form.schedules.splice(i,1);}
  selection(e:Event):number[]{return Array.from((e.target as HTMLSelectElement).selectedOptions).map(x=>+x.value);}
  names(ids:number[],list:BeatOption[]){const set=new Set(ids);return list.filter(x=>set.has(x.id)).map(x=>x.name).join(', ')||'-';}
  userName(id:number){return this.options.users.find(x=>x.id===id)?.name||String(id);}
  /** Excel comes from the server so it carries every beat in the current search, with the
   *  ids the import needs. Copy, PDF and print are what is on screen, nothing more. */
  exportExcel(){this.busy='export';this.service.export(this.search).pipe(finalize(()=>{this.busy='';this.cdr.detectChanges();})).subscribe({next:blob=>this.download(blob,`Beats_${new Date().toISOString().slice(0,10)}.xlsx`),error:e=>this.notify(e.message,'error')});}
  chooseFile(input:HTMLInputElement){input.value='';input.click();}
  importFile(event:Event){const input=event.target as HTMLInputElement;const file=input.files?.[0];if(!file)return;this.busy='import';this.importResult=null;this.service.import(file).pipe(finalize(()=>{this.busy='';input.value='';this.cdr.detectChanges();})).subscribe({next:result=>{this.importResult=result;this.notify(result.message,result.skipped?'error':'success');this.load();},error:e=>this.notify(e.message,'error')});}
  copyRows(){copyTable(this.snapshot()).then(()=>this.notify('Beats copied to clipboard.','success')).catch(()=>this.notify('Clipboard is not available in this browser.','error'));}
  downloadPdf(){downloadTablePdf(this.snapshot()).catch(e=>this.notify(e?.message||'PDF could not be created.','error'));}
  printRows(){printTable(this.snapshot());}
  private snapshot():TableSnapshot{return{title:'Beats',headers:['#','Beat','Description','Users','Customers','Schedules','Status'],
    rows:this.visible.map((row,index)=>[(this.page-1)*this.showEntries+index+1,row.beatName,row.description||'-',row.userCount,row.customerCount,row.scheduleCount,row.active==='Y'?'Active':'Inactive'])};}
  private download(blob:Blob,name:string){const url=window.URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download=name;link.click();window.URL.revokeObjectURL(url);}
  close(){if(!this.saving)this.showForm=false;this.showDetail=false;this.importResult=null;}
  csv(v?:string){return String(v||'').split(',').map(Number).filter(Boolean);}
  private toSelectOptions(rows:BeatOption[],includeMobile=false):SearchableSelectOption[]{return rows.map(x=>({id:x.id,label:`${x.name}${includeMobile&&x.mobile?` (${x.mobile})`:''}`}));}
  private empty():BeatPayload&{id:number|null}{return{id:null,beatName:'',description:'',active:'Y',cityIds:[],userIds:[],customerIds:[],schedules:[]};}
  private notify(message:string,type:'success'|'error'){this.toast={visible:true,message,type};if(this.toastId)clearTimeout(this.toastId);this.toastId=window.setTimeout(()=>{this.toast.visible=false;this.cdr.detectChanges();},3500);this.cdr.detectChanges();}
}
