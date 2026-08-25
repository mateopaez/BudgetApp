import { Component, computed, signal } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { allIdeaIds, PROJECT_IDEAS } from './project-ideas';

const STORAGE_KEY = 'budget-app-project-ideas-completed';

@Component({
  selector: 'app-todos',
  standalone: true,
  imports: [MatCardModule, MatCheckboxModule, MatProgressBarModule],
  template: `
    <div class="flex flex-col gap-6">
      <div class="page-header">
        <h1 class="page-title">Internal project ideas</h1>
        <p class="page-subtitle">
          Feature roadmap for Budget Tracker
          · {{ completedCount() }} of {{ totalCount }} done
        </p>
      </div>

      <mat-progress-bar mode="determinate" [value]="progressPercent()" />

      <mat-card class="app-card">
        <mat-card-header>
          <mat-card-title class="!text-ink">Roadmap</mat-card-title>
          <mat-card-subtitle>Check items off as you ship them. Saved in this browser only.</mat-card-subtitle>
        </mat-card-header>
        <mat-card-content>
          <ul class="divide-y divide-line overflow-hidden rounded-xl border border-line">
            @for (idea of ideas; track idea.id) {
              <li>
                <div class="flex items-start gap-3 px-4 py-3">
                  <mat-checkbox
                    class="!mt-0.5"
                    [checked]="isDone(idea.id)"
                    (change)="setDone(idea.id, $event.checked)"
                  />
                  <span
                    class="min-w-0 flex-1 pt-1 font-medium"
                    [class.text-slate-400]="isDone(idea.id)"
                    [class.line-through]="isDone(idea.id)"
                    [class.text-ink]="!isDone(idea.id)"
                  >
                    {{ idea.title }}
                  </span>
                </div>

                @for (child of idea.children ?? []; track child.id) {
                  <div class="flex items-start gap-3 border-t border-action-soft px-4 py-2.5 pl-12">
                    <mat-checkbox
                      class="!mt-0.5"
                      [checked]="isDone(child.id)"
                      (change)="setDone(child.id, $event.checked)"
                    />
                    <span
                      class="min-w-0 flex-1 pt-1 text-sm"
                      [class.text-slate-400]="isDone(child.id)"
                      [class.line-through]="isDone(child.id)"
                      [class.text-slate-700]="!isDone(child.id)"
                    >
                      {{ child.title }}
                    </span>
                  </div>
                }
              </li>
            }
          </ul>
        </mat-card-content>
      </mat-card>
    </div>
  `,
})
export class TodosComponent {
  readonly ideas = PROJECT_IDEAS;
  readonly totalCount = allIdeaIds(PROJECT_IDEAS).length;

  private readonly completed = signal<Set<string>>(this.loadCompleted());

  readonly completedCount = computed(() => this.completed().size);
  readonly progressPercent = computed(() => (this.completedCount() / this.totalCount) * 100);

  isDone(id: string): boolean {
    return this.completed().has(id);
  }

  setDone(id: string, done: boolean): void {
    const next = new Set(this.completed());
    if (done) {
      next.add(id);
    } else {
      next.delete(id);
    }
    this.completed.set(next);
    this.saveCompleted(next);
  }

  private loadCompleted(): Set<string> {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return new Set();
      const ids = JSON.parse(raw) as string[];
      const valid = new Set(allIdeaIds(PROJECT_IDEAS));
      return new Set(ids.filter((id) => valid.has(id)));
    } catch {
      return new Set();
    }
  }

  private saveCompleted(completed: Set<string>): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...completed]));
  }
}
