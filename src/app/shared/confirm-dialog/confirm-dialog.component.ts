import { Component, inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { firstValueFrom } from 'rxjs';

export interface ConfirmDialogData {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'danger' | 'default';
  detail?: string;
}

@Component({
  selector: 'app-confirm-dialog',
  standalone: true,
  imports: [MatDialogModule, MatButtonModule, MatIconModule],
  template: `
    <div class="p-1">
      <h2 mat-dialog-title class="!flex !items-center !gap-3 !text-ink">
        <span
          class="grid h-10 w-10 shrink-0 place-items-center rounded-full"
          [class]="data.tone === 'danger' ? 'bg-red-50 text-red-700' : 'bg-action-soft text-action'"
          aria-hidden="true"
        >
          <mat-icon>{{ data.tone === 'danger' ? 'warning' : 'help_outline' }}</mat-icon>
        </span>
        <span>{{ data.title }}</span>
      </h2>

      <mat-dialog-content class="!pt-0">
        <p class="text-sm leading-6 text-ink-muted">{{ data.message }}</p>
        @if (data.detail) {
          <p class="mt-3 rounded-xl border border-line bg-canvas px-3 py-2 text-xs leading-5 text-ink-muted">
            {{ data.detail }}
          </p>
        }
      </mat-dialog-content>

      <mat-dialog-actions align="end" class="!gap-2">
        <button mat-button [mat-dialog-close]="false">
          {{ data.cancelLabel ?? 'Cancel' }}
        </button>
        <button
          mat-flat-button
          [color]="data.tone === 'danger' ? 'warn' : 'primary'"
          [mat-dialog-close]="true"
          cdkFocusInitial
        >
          {{ data.confirmLabel ?? 'Confirm' }}
        </button>
      </mat-dialog-actions>
    </div>
  `,
})
export class ConfirmDialogComponent {
  readonly data = inject<ConfirmDialogData>(MAT_DIALOG_DATA);
}

export async function confirmDialog(dialog: MatDialog, data: ConfirmDialogData): Promise<boolean> {
  const ref = dialog.open(ConfirmDialogComponent, {
    width: 'min(92vw, 420px)',
    data,
    autoFocus: false,
    restoreFocus: true,
  });
  return !!(await firstValueFrom(ref.afterClosed()));
}
