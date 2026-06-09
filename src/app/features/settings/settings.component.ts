import { Component, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { Category } from '../../core/models';
import { CategoryService } from '../../core/services/category.service';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
  ],
  template: `
    <div class="space-y-6">
      <div class="page-header">
        <h1 class="page-title">Settings</h1>
        <p class="page-subtitle">Manage your categories and preferences</p>
      </div>

      <mat-card class="app-card">
        <mat-card-header>
          <mat-card-title class="!text-midnight-900">Categories</mat-card-title>
          <mat-card-subtitle>Rename or remove your categories. System categories are read-only.</mat-card-subtitle>
        </mat-card-header>
        <mat-card-content class="space-y-4">
          <form class="flex flex-col gap-3 sm:flex-row sm:items-start" [formGroup]="addForm" (ngSubmit)="addCategory()">
            <mat-form-field class="flex-1">
              <mat-label>New category</mat-label>
              <input matInput formControlName="name" />
            </mat-form-field>
            <button mat-flat-button color="primary" type="submit" class="!mt-1 shrink-0">Add</button>
          </form>

          <ul class="divide-y divide-brand-100 overflow-hidden rounded-xl border border-brand-100">
            @for (cat of categories(); track cat.id) {
              <li class="flex items-center gap-2 px-4 py-3">
                @if (editingId() === cat.id) {
                  <mat-form-field class="flex-1">
                    <mat-label>Category name</mat-label>
                    <input
                      matInput
                      [value]="editName()"
                      (input)="editName.set($any($event.target).value)"
                      (keydown.enter)="saveEdit(cat.id)"
                      (keydown.escape)="cancelEdit()"
                    />
                  </mat-form-field>
                  <button mat-icon-button color="primary" (click)="saveEdit(cat.id)" aria-label="Save">
                    <mat-icon>check</mat-icon>
                  </button>
                  <button mat-icon-button (click)="cancelEdit()" aria-label="Cancel">
                    <mat-icon>close</mat-icon>
                  </button>
                } @else {
                  <span class="min-w-0 flex-1 truncate font-medium text-midnight-900">{{ cat.name }}</span>
                  @if (cat.isSystem) {
                    <span class="shrink-0 rounded-full bg-brand-100 px-2.5 py-0.5 text-xs font-medium text-brand-700">
                      System
                    </span>
                  } @else {
                    <button mat-icon-button (click)="startEdit(cat)" aria-label="Edit category">
                      <mat-icon>edit</mat-icon>
                    </button>
                    <button mat-icon-button color="warn" (click)="remove(cat)" aria-label="Delete category">
                      <mat-icon>delete</mat-icon>
                    </button>
                  }
                }
              </li>
            }
          </ul>
        </mat-card-content>
      </mat-card>

      <mat-card class="app-card">
        <mat-card-header>
          <mat-card-title class="!text-midnight-900">Auto-categorization rules</mat-card-title>
        </mat-card-header>
        <mat-card-content>
          <p class="text-sm text-slate-500">
            Placeholder for future rules (e.g. "AMAZON → Shopping"). Not implemented in MVP.
          </p>
        </mat-card-content>
      </mat-card>
    </div>
  `,
})
export class SettingsComponent {
  private readonly fb = inject(FormBuilder);
  private readonly categoryService = inject(CategoryService);

  readonly categories = toSignal(this.categoryService.watchCategories(), { initialValue: [] });
  readonly editingId = signal<string | null>(null);
  readonly editName = signal('');

  readonly addForm = this.fb.nonNullable.group({ name: ['', Validators.required] });

  async addCategory(): Promise<void> {
    if (this.addForm.invalid) return;
    await this.categoryService.create(this.addForm.value.name!);
    this.addForm.reset({ name: '' });
  }

  startEdit(cat: Category): void {
    this.editingId.set(cat.id);
    this.editName.set(cat.name);
  }

  cancelEdit(): void {
    this.editingId.set(null);
    this.editName.set('');
  }

  async saveEdit(id: string): Promise<void> {
    const name = this.editName().trim();
    if (!name) return;
    await this.categoryService.update(id, name);
    this.cancelEdit();
  }

  async remove(cat: Category): Promise<void> {
    if (confirm(`Delete category "${cat.name}"? Transactions using it will keep the reference.`)) {
      await this.categoryService.remove(cat.id);
    }
  }
}
