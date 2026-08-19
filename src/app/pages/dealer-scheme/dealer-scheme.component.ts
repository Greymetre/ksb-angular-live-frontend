import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { finalize } from 'rxjs/operators';
import { DashboardService, DealerSchemeDetail, DealerSchemeSlab } from '../../services/dashboard.service';

@Component({
  standalone: false,
  selector: 'app-dealer-scheme',
  templateUrl: './dealer-scheme.component.html',
  styleUrls: ['./dealer-scheme.component.scss']
})
export class DealerSchemeComponent implements OnInit {
  detail: DealerSchemeDetail | null = null;
  loading = true;
  error = '';

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private dashboardService: DashboardService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    const id = Number(this.route.snapshot.paramMap.get('id') || 0);
    if (!id) { this.loading = false; this.error = 'Scheme not found.'; return; }

    this.dashboardService.scheme(id).pipe(finalize(() => {
      this.loading = false;
      this.cdr.detectChanges();
    })).subscribe({
      next: detail => { this.detail = detail; this.cdr.detectChanges(); },
      error: error => { this.error = error.message; this.cdr.detectChanges(); }
    });
  }

  back(): void { this.router.navigate(['/dashboard']); }

  money(value: number): string {
    return `₹${Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
  }

  points(value: number): string {
    return Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });
  }

  date(value: string): string {
    if (!value) return '';
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime())
      ? value
      : parsed.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  slabRange(slab: DealerSchemeSlab): string {
    return `${this.money(slab.valueFrom)} — ${slab.valueTo === null ? 'and above' : this.money(slab.valueTo)}`;
  }

  slabReward(slab: DealerSchemeSlab): string {
    return this.detail?.basedOn === 'Percentage' ? `${slab.rewardValue}%` : this.money(slab.rewardValue);
  }
}
