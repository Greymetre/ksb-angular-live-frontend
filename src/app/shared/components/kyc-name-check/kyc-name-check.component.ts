import { ChangeDetectorRef, Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { AuthService } from '../../../services/auth.service';
import { CustomerKycService, KycGstRecord, KycNames } from '../../../services/customer-kyc.service';

/**
 * Sits in every KYC document popup. It shows the shop and owner name the system holds, so
 * the reviewer can hold them against the document, and lets them be corrected on the spot.
 * On the GST popup it also shows what the GST register says about that GSTIN.
 */
@Component({
  standalone: false,
  selector: 'app-kyc-name-check',
  templateUrl: './kyc-name-check.component.html',
  styleUrls: ['./kyc-name-check.component.scss']
})
export class KycNameCheckComponent implements OnChanges {
  @Input() customerId: number | null = null;
  @Input() documentKey: string | null = null;
  @Input() canEdit = false;
  @Output() namesSaved = new EventEmitter<KycNames>();

  names: KycNames | null = null;
  namesLoading = false;
  namesError = '';

  editing = false;
  saving = false;
  shopEdit = '';
  ownerEdit = '';
  saveError = '';

  gst: KycGstRecord | null = null;
  gstLoading = false;
  gstMessage = '';
  gstError = false;
  gstConfigured = true;

  constructor(private kycService: CustomerKycService, private authService: AuthService, private cdr: ChangeDetectorRef) {}

  /** Checking the register is a paid call, so the eye button needs its own permission. */
  get canCheckGst(): boolean {
    return this.authService.hasPermission('customer_kyc.gst_lookup');
  }

  get isGst(): boolean {
    return this.documentKey === 'gst';
  }

  /** Active on the register reads green; anything else (cancelled, suspended) reads red. */
  get gstActive(): boolean {
    return (this.gst?.status || '').trim().toLowerCase() === 'active';
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!this.customerId) return;
    if (changes['customerId']) {
      this.editing = false;
      this.loadNames();
    }
    if ((changes['customerId'] || changes['documentKey']) && this.isGst) this.loadSavedGst();
  }

  loadNames(): void {
    if (!this.customerId) return;
    this.namesLoading = true;
    this.namesError = '';
    this.kycService.names(this.customerId).subscribe({
      next: names => {
        this.names = names;
        this.namesLoading = false;
        this.cdr.detectChanges();
      },
      error: (error: Error) => {
        this.namesError = error.message || 'Names could not be loaded.';
        this.namesLoading = false;
        this.cdr.detectChanges();
      }
    });
  }

  /** Only what was saved from an earlier check - opening the popup costs nothing. */
  loadSavedGst(): void {
    if (!this.customerId) return;
    this.gst = null;
    this.gstMessage = '';
    this.gstError = false;
    this.kycService.savedGst(this.customerId).subscribe({
      next: result => {
        this.gst = result.gst;
        this.gstConfigured = result.configured;
        this.gstMessage = result.message || '';
        this.cdr.detectChanges();
      },
      error: () => this.cdr.detectChanges()
    });
  }

  /** The eye button: checks the GST register now. This is the only place the paid API is called. */
  checkGst(): void {
    if (!this.customerId || this.gstLoading) return;
    this.gstLoading = true;
    this.gstMessage = '';
    this.gstError = false;
    this.cdr.detectChanges();
    this.kycService.checkGst(this.customerId).subscribe({
      next: result => {
        this.gst = result.gst;
        this.gstConfigured = result.configured;
        this.gstMessage = result.message || '';
        this.gstError = !result.ok;
        this.gstLoading = false;
        this.cdr.detectChanges();
      },
      error: (error: Error) => {
        this.gstMessage = error.message || 'The GST register could not be checked.';
        this.gstError = true;
        this.gstLoading = false;
        this.cdr.detectChanges();
      }
    });
  }

  startEdit(): void {
    this.shopEdit = this.names?.shopName || '';
    this.ownerEdit = this.names?.ownerName || '';
    this.saveError = '';
    this.editing = true;
  }

  /** Fills the edit boxes from the GST register - still needs Save, so nothing changes by accident. */
  useGstNames(): void {
    if (!this.gst) return;
    if (!this.editing) this.startEdit();
    if (this.gst.tradeName) this.shopEdit = this.gst.tradeName;
    if (this.gst.legalName) this.ownerEdit = this.gst.legalName;
  }

  cancelEdit(): void {
    this.editing = false;
    this.saveError = '';
  }

  save(): void {
    if (!this.customerId) return;
    const shop = this.shopEdit.trim();
    const owner = this.ownerEdit.trim();
    if (!shop || !owner) {
      this.saveError = 'Shop name and owner name are both required.';
      return;
    }
    this.saving = true;
    this.saveError = '';
    this.kycService.updateNames(this.customerId, shop, owner).subscribe({
      next: names => {
        this.names = names;
        this.saving = false;
        this.editing = false;
        this.namesSaved.emit(names);
        this.cdr.detectChanges();
      },
      error: (error: Error) => {
        this.saveError = error.message || 'Names could not be saved.';
        this.saving = false;
        this.cdr.detectChanges();
      }
    });
  }

  checkedOn(value: string | null): string {
    if (!value) return '';
    const date = new Date(value);
    return isNaN(date.getTime()) ? '' : date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  }
}
