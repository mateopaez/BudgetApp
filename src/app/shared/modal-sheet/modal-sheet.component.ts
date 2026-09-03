import { DOCUMENT } from '@angular/common';
import { FocusTrap, FocusTrapFactory } from '@angular/cdk/a11y';
import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  ViewEncapsulation,
  inject,
  input,
  output,
  viewChild,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';

@Component({
  selector: 'app-modal-sheet',
  standalone: true,
  imports: [MatButtonModule],
  encapsulation: ViewEncapsulation.None,
  template: `
    <div
      class="modal-sheet-backdrop fixed inset-0 z-[2000] flex items-end justify-center bg-ink-scrim p-0 backdrop-blur-[2px] sm:items-center sm:p-6"
      role="presentation"
      (click)="onBackdropClick()"
      (keydown.escape)="onEscape()"
    >
      <div
        #panel
        class="modal-sheet-panel flex max-h-[min(92dvh,100%)] w-full max-w-[560px] flex-col overflow-hidden bg-surface shadow-floating sm:rounded-3xl"
        role="dialog"
        aria-modal="true"
        [attr.aria-label]="ariaLabel() ?? title()"
        tabindex="-1"
        (click)="$event.stopPropagation()"
      >
        <div class="shrink-0 px-6 pt-6">
          <h2 class="text-xl font-semibold tracking-[-0.02em] text-ink">{{ title() }}</h2>
        </div>

        <div class="modal-sheet-body min-h-0 flex-1 overflow-y-auto px-6 pb-4 pt-1">
          @if (subtitle()) {
            <p class="mb-5 text-sm leading-6 text-ink-muted">{{ subtitle() }}</p>
          }
          <ng-content />
        </div>

        <div class="modal-sheet-actions shrink-0 px-6 pb-5 pt-2">
          <ng-content select="[modalActions]" />
        </div>
      </div>
    </div>
  `,
})
export class ModalSheetComponent implements AfterViewInit, OnDestroy {
  readonly title = input.required<string>();
  readonly subtitle = input<string>();
  readonly ariaLabel = input<string>();
  readonly closeOnBackdrop = input(true);
  readonly closed = output<void>();

  private readonly doc = inject(DOCUMENT);
  private readonly focusTrapFactory = inject(FocusTrapFactory);
  private readonly panel = viewChild.required<ElementRef<HTMLElement>>('panel');
  private readonly previouslyFocused = this.doc.activeElement as HTMLElement | null;
  private focusTrap?: FocusTrap;

  constructor() {
    this.doc.body.classList.add('modal-sheet-open');
  }

  ngAfterViewInit(): void {
    this.focusTrap = this.focusTrapFactory.create(this.panel().nativeElement);
    void this.focusTrap.focusInitialElementWhenReady().then((focused) => {
      if (!focused) this.panel().nativeElement.focus();
    });
  }

  ngOnDestroy(): void {
    this.focusTrap?.destroy();
    this.doc.body.classList.remove('modal-sheet-open');
    this.previouslyFocused?.focus();
  }

  onEscape(): void {
    this.closed.emit();
  }

  onBackdropClick(): void {
    if (this.closeOnBackdrop()) {
      this.closed.emit();
    }
  }
}
