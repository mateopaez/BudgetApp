import { DOCUMENT } from '@angular/common';
import { Component, OnDestroy, ViewEncapsulation, inject, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';

@Component({
  selector: 'app-modal-sheet',
  standalone: true,
  imports: [MatButtonModule],
  encapsulation: ViewEncapsulation.None,
  template: `
    <div
      class="modal-sheet-backdrop fixed inset-0 z-[2000] flex items-end justify-center bg-ink/35 p-0 backdrop-blur-[2px] sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      [attr.aria-label]="ariaLabel() ?? title()"
      (click)="onBackdropClick()"
    >
      <div
        class="modal-sheet-panel flex max-h-[min(92dvh,100%)] w-full max-w-[560px] flex-col overflow-hidden bg-surface shadow-floating sm:rounded-3xl"
        (click)="$event.stopPropagation()"
      >
        <div class="shrink-0 px-6 pt-6">
          <h2 class="text-xl font-semibold tracking-[-0.02em] text-ink">{{ title() }}</h2>
        </div>

        <div class="modal-sheet-body min-h-0 flex-1 overflow-y-auto px-6 pb-4 pt-1">
          @if (subtitle()) {
            <p class="mb-5 text-sm leading-6 text-slate-600">{{ subtitle() }}</p>
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
export class ModalSheetComponent implements OnDestroy {
  readonly title = input.required<string>();
  readonly subtitle = input<string>();
  readonly ariaLabel = input<string>();
  readonly closeOnBackdrop = input(true);
  readonly closed = output<void>();

  private readonly doc = inject(DOCUMENT);

  constructor() {
    this.doc.body.classList.add('modal-sheet-open');
  }

  ngOnDestroy(): void {
    this.doc.body.classList.remove('modal-sheet-open');
  }

  onBackdropClick(): void {
    if (this.closeOnBackdrop()) {
      this.closed.emit();
    }
  }
}
