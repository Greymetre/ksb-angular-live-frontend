import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { finalize } from 'rxjs/operators';
import { DEALER_FEEDBACK_CATEGORIES, DealerFeedbackFilter, DealerFeedbackRow, DealerFeedbackService } from '../../services/dealer-feedback.service';
import { AuthService } from '../../services/auth.service';
import { formatKolkataDate } from '../../shared/utils/date-time';

@Component({
  standalone: false,
  selector: 'app-dealer-feedback-list',
  templateUrl: './dealer-feedback-list.component.html',
  styleUrls: ['./dealer-feedback-list.component.scss']
})
export class DealerFeedbackListComponent implements OnInit {
  readonly categories = DEALER_FEEDBACK_CATEGORIES;
  readonly stars = [1, 2, 3, 4, 5];

  rows: DealerFeedbackRow[] = [];
  total = 0;
  page = 1;
  pageSize = 10;
  lastPage = 1;

  filter: DealerFeedbackFilter = {};
  showFilters = false;
  loading = false;
  exporting = false;

  constructor(private service: DealerFeedbackService, private auth: AuthService, private cdr: ChangeDetectorRef) {}

  get canExport(): boolean {
    return this.auth.hasPermission('dealer_feedback.export');
  }

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading = true;
    const request: DealerFeedbackFilter = { ...this.filter, page: this.page, page_size: this.pageSize };
    this.service.list(request).pipe(finalize(() => { this.loading = false; this.cdr.detectChanges(); })).subscribe({
      next: result => {
        this.rows = result.rows;
        this.total = result.total;
        this.page = result.page;
        this.pageSize = result.pageSize;
        this.lastPage = result.lastPage;
        this.cdr.detectChanges();
      },
      error: () => { this.rows = []; this.total = 0; this.lastPage = 1; }
    });
  }

  applyFilters(): void {
    this.page = 1;
    this.load();
  }

  clearFilters(): void {
    this.filter = {};
    this.page = 1;
    this.load();
  }

  changePage(next: number): void {
    if (next < 1 || next > this.lastPage || next === this.page) return;
    this.page = next;
    this.load();
  }

  exportFile(): void {
    this.exporting = true;
    this.service.export(this.filter).pipe(finalize(() => { this.exporting = false; this.cdr.detectChanges(); })).subscribe({
      next: blob => {
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'dealer-feedback.xlsx';
        link.click();
        window.URL.revokeObjectURL(url);
      }
    });
  }

  displayDate(value?: string | null): string {
    return value ? formatKolkataDate(value) : '-';
  }
}
