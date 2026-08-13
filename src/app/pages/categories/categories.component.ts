import { Component } from '@angular/core';

interface Category {
  no: number;
  categoryName: string;
  categoryImage: string;
  createdBy: string;
  createdAt: string;
  active: boolean;
}

@Component({
  standalone: false,
  selector: 'app-categories',
  templateUrl: './categories.component.html',
  styleUrls: ['./categories.component.scss']
})
export class CategoriesComponent {
  showEntries = 10;
  currentPage = 1;
  searchQuery = '';
  appliedSearchQuery = '';
  private searchTimeoutId?: number;
  showModal = false;
  editModal = false;
  modalData = { categoryName: '', sapCode: '' };

  categories: Category[] = [
    { no: 1, categoryName: 'Conticable', categoryImage: '', createdBy: 'Gajendra Rajput', createdAt: '12-Mar-26 11:44 AM', active: false },
    { no: 2, categoryName: 'Agriculture', categoryImage: '', createdBy: 'Gajendra Rajput', createdAt: '12-Mar-26 11:43 AM', active: false },
    { no: 3, categoryName: 'Domestic', categoryImage: '', createdBy: 'Gajendra Rajput', createdAt: '11-Mar-26 12:47 PM', active: true }
  ];

  get filtered() {
    if (!this.appliedSearchQuery) return this.categories;
    const q = this.appliedSearchQuery.toLowerCase();
    return this.categories.filter(c => c.categoryName.toLowerCase().includes(q) || c.createdBy.toLowerCase().includes(q));
  }

  get pagedCategories(): Category[] {
    return this.filtered.slice(this.pageStart, this.pageStart + this.safeShowEntries);
  }

  get pageStart(): number {
    return (this.currentPage - 1) * this.safeShowEntries;
  }

  resetPage(): void {
    this.currentPage = 1;
  }

  scheduleSearch(): void {
    if (this.searchTimeoutId) window.clearTimeout(this.searchTimeoutId);
    this.searchTimeoutId = window.setTimeout(() => {
      this.appliedSearchQuery = this.searchQuery;
      this.currentPage = 1;
    }, 400);
  }

  openAddModal() { this.modalData = { categoryName: '', sapCode: '' }; this.showModal = true; }
  closeModal() { this.showModal = false; }
  submitCategory() {
    if (this.modalData.categoryName) {
      this.categories.push({
        no: this.categories.length + 1,
        categoryName: this.modalData.categoryName,
        categoryImage: '',
        createdBy: 'Gajendra Rajput',
        createdAt: new Date().toLocaleDateString(),
        active: true
      });
      this.closeModal();
    }
  }
  deleteCategory(c: Category) { this.categories = this.categories.filter(x => x.no !== c.no); }
  toggleActive(c: Category) { c.active = !c.active; }

  private get safeShowEntries(): number {
    const value = Number(this.showEntries);
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : 10;
  }
}
