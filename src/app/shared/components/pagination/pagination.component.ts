import { Component, EventEmitter, Input, OnChanges, Output } from '@angular/core';

@Component({
  standalone: false,
  selector: 'app-pagination',
  templateUrl: './pagination.component.html',
  styleUrls: ['./pagination.component.scss']
})
export class PaginationComponent implements OnChanges {
  @Input() total = 0;
  @Input() pageSize = 10;
  @Input() page = 1;
  @Output() pageChange = new EventEmitter<number>();

  ngOnChanges(): void {
    const nextPage = this.clampPage(this.page);
    if (nextPage !== this.page) {
      this.page = nextPage;
      this.pageChange.emit(nextPage);
    }
  }

  get totalPages(): number {
    return Math.max(1, Math.ceil(this.safeTotal / this.safePageSize));
  }

  get start(): number {
    return this.safeTotal === 0 ? 0 : (this.currentPage - 1) * this.safePageSize + 1;
  }

  get end(): number {
    return Math.min(this.safeTotal, this.currentPage * this.safePageSize);
  }

  get currentPage(): number {
    return this.clampPage(this.page);
  }

  get pages(): number[] {
    const total = this.totalPages;
    const current = this.currentPage;
    const width = 5;
    let start = Math.max(1, current - Math.floor(width / 2));
    const end = Math.min(total, start + width - 1);
    start = Math.max(1, end - width + 1);

    return Array.from({ length: end - start + 1 }, (_, index) => start + index);
  }

  previous(): void {
    this.go(this.currentPage - 1);
  }

  next(): void {
    this.go(this.currentPage + 1);
  }

  go(page: number): void {
    const nextPage = this.clampPage(page);
    if (nextPage === this.currentPage) return;
    this.page = nextPage;
    this.pageChange.emit(nextPage);
  }

  private get safeTotal(): number {
    const value = Number(this.total);
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
  }

  private get safePageSize(): number {
    const value = Number(this.pageSize);
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : 10;
  }

  private clampPage(page: number): number {
    const value = Number(page);
    const numericPage = Number.isFinite(value) && value > 0 ? Math.floor(value) : 1;
    return Math.min(Math.max(numericPage, 1), this.totalPages);
  }
}
