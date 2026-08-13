import { Component, ElementRef, EventEmitter, HostListener, Input, Output } from '@angular/core';
import { firstCaps } from '../../pipes/first-caps.pipe';

export interface SearchableSelectOption {
  id: number | string;
  label?: string;
  name?: string;
}

@Component({
  standalone: false,
  selector: 'app-searchable-select',
  templateUrl: './searchable-select.component.html',
  styleUrls: ['./searchable-select.component.scss']
})
export class SearchableSelectComponent {
  @Input() options: SearchableSelectOption[] = [];
  @Input() labelKey = 'label';
  @Input() selected: number | string | Array<number | string> | null = null;
  @Input() placeholder = 'Select';
  @Input() multiple = false;
  @Input() disabled = false;
  @Input() allowClear = true;
  @Input() loading = false;
  @Input() loadingText = 'Loading...';
  @Input() pageSize = 0;

  @Output() selectedChange = new EventEmitter<any>();

  opened = false;
  search = '';
  page = 1;

  constructor(private elementRef: ElementRef<HTMLElement>) {}

  get selectedArray(): Array<number | string> {
    if (Array.isArray(this.selected)) return this.selected;
    return this.selected === null || this.selected === undefined || this.selected === '' ? [] : [this.selected];
  }

  get selectedText(): string {
    const selectedOptions = this.options.filter(option => this.isSelected(option.id));
    if (selectedOptions.length === 0) return this.placeholder;
    if (!this.multiple) return firstCaps(this.optionLabel(selectedOptions[0]));
    return selectedOptions.length === 1 ? firstCaps(this.optionLabel(selectedOptions[0])) : `${selectedOptions.length} selected`;
  }

  get filteredOptions(): SearchableSelectOption[] {
    const q = this.search.trim().toLowerCase();
    if (!q) return this.options;
    return this.options.filter(option => {
      const values = option as unknown as Record<string, unknown>;
      const searchable = [this.optionLabel(option), option.id, values['mobile'], values['email'], values['code'], values['customerCode']];
      return searchable.some(value => String(value ?? '').toLowerCase().includes(q));
    });
  }

  get visibleOptions(): SearchableSelectOption[] {
    if (this.pageSize <= 0) return this.filteredOptions;
    const start = (this.page - 1) * this.pageSize;
    return this.filteredOptions.slice(start, start + this.pageSize);
  }

  get totalPages(): number {
    return this.pageSize > 0 ? Math.max(1, Math.ceil(this.filteredOptions.length / this.pageSize)) : 1;
  }

  onSearchChange(value: string): void {
    this.search = value;
    this.page = 1;
  }

  changePage(nextPage: number, event: Event): void {
    event.stopPropagation();
    this.page = Math.min(this.totalPages, Math.max(1, nextPage));
  }

  displayLabel(value: string): string {
    return firstCaps(value);
  }

  optionLabel(option: SearchableSelectOption): string {
    const values = option as unknown as Record<string, unknown>;
    return String(values[this.labelKey] ?? option.label ?? option.name ?? option.id ?? '');
  }

  toggleOpen(): void {
    if (this.disabled) return;
    this.opened = !this.opened;
    if (this.opened) {
      this.search = '';
      this.page = 1;
    }
  }

  choose(option: SearchableSelectOption, event?: Event): void {
    event?.stopPropagation();
    if (this.multiple) {
      const selected = this.selectedArray;
      const next = this.isSelected(option.id)
        ? selected.filter(value => String(value) !== String(option.id))
        : [...selected, option.id];
      this.selectedChange.emit(next);
      return;
    }

    this.selectedChange.emit(option.id);
    this.opened = false;
  }

  clear(event: Event): void {
    event.stopPropagation();
    this.selectedChange.emit(this.multiple ? [] : null);
  }

  isSelected(id: number | string): boolean {
    return this.selectedArray.some(value => String(value) === String(id));
  }

  @HostListener('document:click', ['$event'])
  closeOutside(event: Event): void {
    if (!this.elementRef.nativeElement.contains(event.target as Node)) this.opened = false;
  }
}
