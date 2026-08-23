import {
  Directive,
  ElementRef,
  EventEmitter,
  Input,
  NgZone,
  OnDestroy,
  OnInit,
  Output,
} from '@angular/core';
import { Router } from '@angular/router';

const TAB_ORDER = ['now', 'day', 'trends', 'alarms', 'settings'] as const;
const MIN_SWIPE_PX = 72;

/**
 * Horizontal swipe navigation.
 * - Default: switch main tabs (Sada → Dan → Trendovi → Alarmi → Podešavanja).
 * - Day mode: swipe between calendar days; at today, swipe left advances to next tab.
 */
@Directive({
  selector: 'ion-content[appTabSwipe]',
  standalone: true,
})
export class TabSwipeDirective implements OnInit, OnDestroy {
  @Input() swipeMode: 'tabs' | 'day' = 'tabs';
  @Input() forwardDisabled = false;
  @Output() swipePrev = new EventEmitter<void>();
  @Output() swipeNext = new EventEmitter<void>();

  private startX = 0;
  private startY = 0;
  private tracking = false;

  private readonly onTouchStart = (ev: TouchEvent) => {
    if (ev.touches.length !== 1) return;
    if (this.shouldIgnore(ev.target)) return;
    this.startX = ev.touches[0].clientX;
    this.startY = ev.touches[0].clientY;
    this.tracking = true;
  };

  private readonly onTouchEnd = (ev: TouchEvent) => {
    if (!this.tracking) return;
    this.tracking = false;
    const touch = ev.changedTouches[0];
    const dx = touch.clientX - this.startX;
    const dy = touch.clientY - this.startY;
    if (Math.abs(dx) < MIN_SWIPE_PX || Math.abs(dx) < Math.abs(dy) * 1.2) return;

    if (this.swipeMode === 'day') {
      if (dx < 0) {
        if (this.forwardDisabled) this.navigateTab(1);
        else this.swipeNext.emit();
      } else {
        this.swipePrev.emit();
      }
      return;
    }

    this.navigateTab(dx < 0 ? 1 : -1);
  };

  constructor(
    private readonly el: ElementRef<HTMLElement>,
    private readonly router: Router,
    private readonly zone: NgZone
  ) {}

  ngOnInit() {
    const node = this.el.nativeElement;
    node.addEventListener('touchstart', this.onTouchStart, { passive: true });
    node.addEventListener('touchend', this.onTouchEnd, { passive: true });
  }

  ngOnDestroy() {
    const node = this.el.nativeElement;
    node.removeEventListener('touchstart', this.onTouchStart);
    node.removeEventListener('touchend', this.onTouchEnd);
  }

  private shouldIgnore(target: EventTarget | null): boolean {
    if (!target || !(target instanceof Element)) return false;
    return Boolean(
      target.closest(
        'canvas, ion-segment, input, textarea, button, .stepper, a, ion-refresher, .nav-btn, .sw'
      )
    );
  }

  private currentTab(): string {
    const match = this.router.url.match(/\/tabs\/([^/?#]+)/);
    return match?.[1] ?? TAB_ORDER[0];
  }

  private navigateTab(delta: number) {
    const idx = TAB_ORDER.indexOf(this.currentTab() as typeof TAB_ORDER[number]);
    if (idx < 0) return;
    const next = idx + delta;
    if (next < 0 || next >= TAB_ORDER.length) return;
    this.zone.run(() => {
      void this.router.navigate(['/tabs', TAB_ORDER[next]]);
    });
  }
}
