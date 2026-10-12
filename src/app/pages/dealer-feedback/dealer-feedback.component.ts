import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { finalize } from 'rxjs/operators';
import { DEALER_FEEDBACK_CATEGORIES, DealerFeedbackRow, DealerFeedbackService } from '../../services/dealer-feedback.service';
import { formatKolkataDate } from '../../shared/utils/date-time';

@Component({
  standalone: false,
  selector: 'app-dealer-feedback',
  templateUrl: './dealer-feedback.component.html',
  styleUrls: ['./dealer-feedback.component.scss']
})
export class DealerFeedbackComponent implements OnInit {
  readonly categories = DEALER_FEEDBACK_CATEGORIES;

  category = '';
  message = '';
  rating = 3;        // default 3 gold stars
  hoverRating = 0;   // preview while the pointer is over the stars
  readonly stars = [1, 2, 3, 4, 5];

  submitting = false;
  loading = false;
  error = '';
  success = '';

  mine: DealerFeedbackRow[] = [];

  constructor(private service: DealerFeedbackService, private cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
    this.loadMine();
  }

  loadMine(): void {
    this.loading = true;
    this.service.mine().pipe(finalize(() => { this.loading = false; this.cdr.detectChanges(); })).subscribe({
      next: rows => { this.mine = rows; this.cdr.detectChanges(); },
      error: () => { this.mine = []; }
    });
  }

  setRating(value: number): void {
    this.rating = value;
  }

  // The value the stars paint: the hovered one while the pointer is over them, otherwise
  // the committed rating.
  starValue(): number {
    return this.hoverRating || this.rating;
  }

  submit(): void {
    this.error = '';
    this.success = '';
    if (!this.category) { this.error = 'Please choose a category.'; return; }
    if (!this.message.trim()) { this.error = 'Please write your feedback.'; return; }

    this.submitting = true;
    this.service.submit(this.category, this.message.trim(), this.rating)
      .pipe(finalize(() => { this.submitting = false; this.cdr.detectChanges(); }))
      .subscribe({
        next: message => {
          this.success = message;
          this.category = '';
          this.message = '';
          this.rating = 3;
          this.hoverRating = 0;
          this.loadMine();
          this.cdr.detectChanges();
        },
        error: err => {
          this.error = err?.error?.message || 'Could not send your feedback. Please try again.';
          this.cdr.detectChanges();
        }
      });
  }

  displayDate(value?: string | null): string {
    return value ? formatKolkataDate(value) : '-';
  }
}
