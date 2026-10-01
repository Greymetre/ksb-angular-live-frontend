import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { finalize } from 'rxjs';
import { AuthService } from '../../services/auth.service';
import { BeatScheduleRow, BeatService } from '../../services/beat.service';
import { copyTable, downloadTablePdf, printTable, TableSnapshot } from '../../shared/utils/table-actions';

/// Beat Detail lists the schedules a beat produces - who goes out on which day - while the
/// Beats screen holds the master the schedules are made from.
@Component({ standalone: false, selector: 'app-beat-detail', templateUrl: './beat-detail.component.html', styleUrls: ['./beat-detail.component.scss'] })
export class BeatDetailComponent implements OnInit {
  rows: BeatScheduleRow[] = [];
  search = ''; fromDate = ''; toDate = '';
  showEntries = 10; page = 1; total = 0; loading = false; busy = '';
  toast = { visible: false, message: '', type: 'success' as 'success' | 'error' };
  private toastId?: number;

  constructor(private service: BeatService, public auth: AuthService, private cdr: ChangeDetectorRef) {}

  ngOnInit() { this.load(); }

  get canExport() { return this.auth.hasPermission('beat_detail.export'); }
  get canCopy() { return this.auth.hasPermission('beat_detail.copy'); }
  get canPdf() { return this.auth.hasPermission('beat_detail.pdf'); }
  get canPrint() { return this.auth.hasPermission('beat_detail.print'); }
  get hasTableActions() { return this.canExport || this.canCopy || this.canPdf || this.canPrint; }

  load() {
    this.loading = true;
    this.service.schedules(this.filter(), this.page, this.showEntries)
      .pipe(finalize(() => { this.loading = false; this.cdr.detectChanges(); }))
      .subscribe({ next: rows => { this.rows = rows; this.total = rows.total; }, error: e => this.notify(e.message, 'error') });
  }

  filtersChanged() { this.page = 1; this.load(); }
  pageChanged(page: number) { this.page = page; this.load(); }
  reset() { this.search = ''; this.fromDate = ''; this.toDate = ''; this.filtersChanged(); }

  exportExcel() {
    this.busy = 'export';
    this.service.schedulesExport(this.filter())
      .pipe(finalize(() => { this.busy = ''; this.cdr.detectChanges(); }))
      .subscribe({ next: blob => this.download(blob, `Beat_Detail_${new Date().toISOString().slice(0, 10)}.xlsx`), error: e => this.notify(e.message, 'error') });
  }

  copyRows() { copyTable(this.snapshot()).then(() => this.notify('Beat detail copied to clipboard.', 'success')).catch(() => this.notify('Clipboard is not available in this browser.', 'error')); }
  downloadPdf() { downloadTablePdf(this.snapshot()).catch(e => this.notify(e?.message || 'PDF could not be created.', 'error')); }
  printRows() { printTable(this.snapshot()); }

  private snapshot(): TableSnapshot {
    return {
      title: 'Beat Detail',
      headers: ['#', 'Beat Name', 'Beat Date', 'Customers', 'User Name', 'Mobile', 'Created At'],
      rows: this.rows.map((row, index) => [
        (this.page - 1) * this.showEntries + index + 1,
        row.beatName, row.beatDate || '-', row.customerCount, row.userName || '-', row.mobile || '-', row.createdAt || '-',
      ]),
    };
  }

  private filter() { return { search: this.search, fromDate: this.fromDate, toDate: this.toDate }; }

  private download(blob: Blob, name: string) {
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    link.click();
    window.URL.revokeObjectURL(url);
  }

  private notify(message: string, type: 'success' | 'error') {
    this.toast = { visible: true, message, type };
    if (this.toastId) clearTimeout(this.toastId);
    this.toastId = window.setTimeout(() => { this.toast = { ...this.toast, visible: false }; this.cdr.detectChanges(); }, 3500);
    this.cdr.detectChanges();
  }
}
