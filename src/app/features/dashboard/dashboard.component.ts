import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { AccountService } from '../../core/services/account.service';
import { DashboardService } from '../../core/services/dashboard.service';
import { TransactionService } from '../../core/services/transaction.service';
import { ChartCardComponent } from '../../shared/chart-card/chart-card.component';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [ChartCardComponent, MatSlideToggleModule],
  template: `
    <div class="space-y-6">
      <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div class="page-header">
          <h1 class="page-title">Dashboard</h1>
          <p class="page-subtitle">Monthly overview of spending, income, and savings</p>
        </div>
        <mat-slide-toggle
          class="shrink-0"
          [checked]="refundsOffset()"
          (change)="refundsOffset.set($event.checked)"
        >
          Refunds offset spending
        </mat-slide-toggle>
      </div>

      <div class="grid gap-4 lg:grid-cols-2">
        <app-chart-card
          title="Total Expenses by Month"
          [labels]="totals().labels"
          [data]="totals().expenses"
          color="#dc2626"
        />
        <app-chart-card
          title="Total Income by Month (manual only)"
          [labels]="totals().labels"
          [data]="totals().income"
          color="#7c3aed"
        />
        <app-chart-card
          class="lg:col-span-2"
          title="Total Savings by Month"
          [labels]="totals().labels"
          [data]="totals().savings"
          color="#16a34a"
        />
      </div>
    </div>
  `,
})
export class DashboardComponent {
  private readonly accountService = inject(AccountService);
  private readonly transactionService = inject(TransactionService);
  private readonly dashboardService = inject(DashboardService);

  readonly refundsOffset = signal(false);

  private readonly accounts = toSignal(this.accountService.watchAccounts(), { initialValue: [] });
  private readonly transactions = toSignal(this.transactionService.watchAllTransactions(), {
    initialValue: [],
  });

  readonly totals = computed(() =>
    this.dashboardService.computeMonthlyTotals(
      this.transactions(),
      this.accounts(),
      this.refundsOffset()
    )
  );
}
