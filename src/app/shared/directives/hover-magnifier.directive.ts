import { Directive, ElementRef, HostListener, Input, OnDestroy } from '@angular/core';

/**
 * A magnifying lens that follows the mouse over an image, the way product photos work on
 * shopping sites - so a faint GST certificate or a small Aadhaar number can be read without
 * zooming the whole page.
 *
 * The lens is attached to <body> with fixed positioning, so neither the scrolling frame
 * around the image nor a transformed modal can shift it. It follows the image's own
 * rotation and whatever zoom the viewer's buttons have applied, and it only covers the
 * part of the element where the picture is actually drawn.
 */
@Directive({
  standalone: false,
  selector: 'img[appHoverMagnifier]'
})
export class HoverMagnifierDirective implements OnDestroy {
  /** Degrees the image is rotated by with CSS, so the lens shows it the same way up. */
  @Input() magnifierRotation = 0;
  /** How much larger than the image on screen the lens shows it. */
  @Input() magnifierZoom = 2.5;
  /** Lens diameter in pixels. */
  @Input() magnifierSize = 200;

  private lens: HTMLDivElement | null = null;

  constructor(private host: ElementRef<HTMLImageElement>) {
    this.host.nativeElement.style.cursor = 'crosshair';
  }

  @HostListener('mousemove', ['$event'])
  onMove(event: MouseEvent): void {
    const image = this.host.nativeElement;
    if (!image.complete || !image.naturalWidth) {
      this.hide();
      return;
    }

    // Undo the rotation: take the pointer relative to the image centre and turn it back.
    const rect = image.getBoundingClientRect();
    const angle = (-this.magnifierRotation * Math.PI) / 180;
    const dx = event.clientX - (rect.left + rect.width / 2);
    const dy = event.clientY - (rect.top + rect.height / 2);
    const rx = dx * Math.cos(angle) - dy * Math.sin(angle);
    const ry = dx * Math.sin(angle) + dy * Math.cos(angle);

    // Where the picture sits inside the element (object-fit: contain may leave bands).
    const boxWidth = image.offsetWidth;
    const boxHeight = image.offsetHeight;
    const scale = Math.min(boxWidth / image.naturalWidth, boxHeight / image.naturalHeight);
    const drawnWidth = image.naturalWidth * scale;
    const drawnHeight = image.naturalHeight * scale;
    const x = rx + boxWidth / 2 - (boxWidth - drawnWidth) / 2;
    const y = ry + boxHeight / 2 - (boxHeight - drawnHeight) / 2;

    if (x < 0 || y < 0 || x > drawnWidth || y > drawnHeight) {
      this.hide();
      return;
    }

    const lens = this.ensureLens();
    const zoom = this.magnifierZoom;
    const size = this.magnifierSize;
    lens.style.width = `${size}px`;
    lens.style.height = `${size}px`;
    lens.style.left = `${event.clientX - size / 2}px`;
    lens.style.top = `${event.clientY - size / 2}px`;
    lens.style.backgroundImage = `url("${(image.currentSrc || image.src).replace(/"/g, '\\"')}")`;
    lens.style.backgroundSize = `${drawnWidth * zoom}px ${drawnHeight * zoom}px`;
    lens.style.backgroundPosition = `${size / 2 - x * zoom}px ${size / 2 - y * zoom}px`;
    lens.style.transform = `rotate(${this.magnifierRotation}deg)`;
    lens.style.display = 'block';
  }

  @HostListener('mouseleave')
  @HostListener('wheel')
  hide(): void {
    if (this.lens) this.lens.style.display = 'none';
  }

  ngOnDestroy(): void {
    this.lens?.remove();
    this.lens = null;
  }

  private ensureLens(): HTMLDivElement {
    if (this.lens) return this.lens;
    const lens = document.createElement('div');
    Object.assign(lens.style, {
      position: 'fixed',
      zIndex: '10000',
      display: 'none',
      borderRadius: '50%',
      border: '3px solid #ffffff',
      boxShadow: '0 0 0 1px rgba(15, 23, 42, 0.25), 0 10px 28px rgba(15, 23, 42, 0.35)',
      backgroundColor: '#ffffff',
      backgroundRepeat: 'no-repeat',
      pointerEvents: 'none'
    } as Partial<CSSStyleDeclaration>);
    document.body.appendChild(lens);
    this.lens = lens;
    return lens;
  }
}
