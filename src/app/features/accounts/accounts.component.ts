import { CurrencyPipe, DatePipe, TitleCasePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatIconModule } from '@angular/material/icon';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { ActivatedRoute, Router } from '@angular/router';
import { startWith } from 'rxjs/operators';
import { Account, AccountType, DEFAULT_ACCOUNTS } from '../../core/models';
import { AccountService } from '../../core/services/account.service';
import { TransactionService } from '../../core/services/transaction.service';
import {
  creditCardOpeningBalanceForForm,
  openingBalanceForStorage,
} from '../../core/utils/account-opening-balance.util';
import { computeAccountBalance } from '../../core/utils/balance.util';
import {
  buildAccountComparisonRows,
  buildNetWorthSeries,
  computeNetWorth,
  computeNetWorthAsOf,
} from '../../core/utils/balance-history.util';
import { startOfDay } from '../../core/utils/date.util';
import { clearOneShotQueryParams } from '../../core/utils/one-shot-query.util';
import { toLoadableSignal } from '../../core/utils/loadable-signal.util';
import { ChartCardComponent } from '../../shared/chart-card/chart-card.component';
import { confirmDialog } from '../../shared/confirm-dialog/confirm-dialog.component';
import { ModalSheetComponent } from '../../shared/modal-sheet/modal-sheet.component';

@Component({
  selector: 'app-accounts',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    CurrencyPipe,
    DatePipe,
    TitleCasePipe,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatIconModule,
    MatSnackBarModule,
    ChartCardComponent,
    ModalSheetComponent,
  ],
  template: `
    <div class="flex flex-col gap-6">
      <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div class="page-header">
          <h1 class="page-title">Accounts</h1>
          <p class="page-subtitle">Balance sheet, account context, and net-worth history</p>
        </div>
        @if (!accountSheetOpen()) {
          <button mat-flat-button color="primary" type="button" class="!hidden sm:!inline-flex" (click)="startAdd()">
            <mat-icon>add</mat-icon>
            Add account
          </button>
        }
      </div>

      @if (initialLoading()) {
        <section class="panel animate-pulse p-6" role="status" aria-live="polite">
          <p class="font-semibold text-ink">Loading accounts…</p>
          <p class="mt-1 text-sm text-ink-muted">Balances will appear after your account data arrives.</p>
        </section>
      }
      @if (loadError()) {
        <p class="rounded-2xl border border-finance-expense/20 bg-finance-expenseSoft p-4 text-sm text-finance-expense" role="alert">{{ loadError() }}</p>
      }
      <div class="contents" [class.hidden]="initialLoading()">
      @if (defaultAccountsNeedReview()) {
        <section class="rounded-2xl border border-finance-warningSoft bg-finance-warningSoft p-4 sm:flex sm:items-center sm:justify-between sm:gap-4">
          <div>
            <p class="font-semibold text-finance-warning">Review your starting balances</p>
            <p class="mt-1 text-sm text-finance-warning">
              The three starter accounts still have $0 opening balances. Add each real balance and
              the date it applies before relying on net worth.
            </p>
          </div>
          <button mat-stroked-button type="button" class="!mt-3 shrink-0 sm:!mt-0" (click)="reviewOpeningBalances()">
            Review accounts
          </button>
        </section>
      }

      <div class="grid gap-3 sm:grid-cols-3">
        <div class="rounded-xl border border-line bg-action-soft px-4 py-3">
          <p class="text-xs font-medium uppercase tracking-wide text-action">Net worth today</p>
          <p
            class="text-xl font-semibold"
            [class]="netWorth() < 0 ? 'text-finance-expense' : 'text-action'"
          >
            {{ netWorth() | currency }}
          </p>
        </div>
        <div class="rounded-xl border border-line bg-surface px-4 py-3">
          <p class="text-xs font-medium uppercase tracking-wide text-ink-muted">vs Jan 1</p>
          <p
            class="text-xl font-semibold"
            [class]="ytdDelta() < 0 ? 'text-finance-expense' : 'text-finance-income'"
          >
            {{ ytdDelta() >= 0 ? '+' : '' }}{{ ytdDelta() | currency }}
          </p>
        </div>
        <div class="rounded-xl border border-line bg-surface px-4 py-3">
          <p class="text-xs font-medium uppercase tracking-wide text-ink-muted">vs start of month</p>
          <p
            class="text-xl font-semibold"
            [class]="mtdDelta() < 0 ? 'text-finance-expense' : 'text-finance-income'"
          >
            {{ mtdDelta() >= 0 ? '+' : '' }}{{ mtdDelta() | currency }}
          </p>
        </div>
      </div>

      @if (accounts().length) {
        <section class="grid gap-3 lg:grid-cols-3">
          @for (group of accountTypeSummaries(); track group.type) {
            <div class="rounded-2xl border border-line bg-surface p-4">
              <div class="flex items-start justify-between gap-3">
                <div>
                  <p class="font-semibold text-ink">{{ group.title }}</p>
                  <p class="mt-1 text-xs text-ink-muted">{{ group.description }}</p>
                </div>
                <span
                  class="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sm"
                  [class]="typeBadgeClass(group.type)"
                >
                  <mat-icon class="!text-base">{{ typeIcon(group.type) }}</mat-icon>
                </span>
              </div>
              <p
                class="money mt-3 text-2xl font-semibold"
                [class.text-finance-expense]="group.total < 0"
                [class.text-action]="group.total >= 0"
              >
                {{ group.total | currency }}
              </p>
              <p class="mt-1 text-xs text-ink-muted">
                {{ group.count }} account{{ group.count === 1 ? '' : 's' }}
              </p>
            </div>
          }
        </section>
      }

      <app-chart-card
        title="Net worth (last 90 days)"
        [labels]="netWorthLabels()"
        [data]="netWorthData()"
        color="#0F766E"
      />

      <div class="app-card overflow-hidden">
        <div class="border-b border-line px-5 py-4">
          <h3 class="text-sm font-semibold uppercase tracking-wide text-action">
            Account comparison
          </h3>
          <p class="mt-1 text-xs text-ink-muted">
            Credit card balances usually run negative when you owe money — net worth adds them as
            liabilities automatically.
          </p>
        </div>
        <div class="overflow-x-auto">
          <table class="comparison-table w-full text-sm">
            <thead class="bg-action-soft/60 text-left text-xs uppercase tracking-wide text-ink-muted">
              <tr>
                <th class="px-4 py-2 font-medium">Account</th>
                <th class="px-4 py-2 font-medium">Type</th>
                <th class="px-4 py-2 font-medium">Balance</th>
                <th class="px-4 py-2 font-medium">MTD</th>
                <th class="px-4 py-2 font-medium">YTD</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-line">
              @for (row of comparisonRows(); track row.account.id) {
                <tr>
                  <td data-label="Account" class="px-4 py-2.5 font-medium text-ink">{{ row.account.name }}</td>
                  <td data-label="Type" class="px-4 py-2.5 text-ink-muted">{{ row.account.type | titlecase }}</td>
                  <td
                    data-label="Balance"
                    class="px-4 py-2.5 font-semibold"
                    [class]="row.balanceToday < 0 ? 'text-finance-expense' : 'text-action'"
                  >
                    {{ row.balanceToday | currency }}
                  </td>
                  <td
                    data-label="MTD"
                    class="px-4 py-2.5"
                    [class]="row.changeMtd < 0 ? 'text-finance-expense' : 'text-finance-income'"
                  >
                    {{ row.changeMtd >= 0 ? '+' : '' }}{{ row.changeMtd | currency }}
                  </td>
                  <td
                    data-label="YTD"
                    class="px-4 py-2.5"
                    [class]="row.changeYtd < 0 ? 'text-finance-expense' : 'text-finance-income'"
                  >
                    {{ row.changeYtd >= 0 ? '+' : '' }}{{ row.changeYtd | currency }}
                  </td>
                </tr>
              } @empty {
                <tr>
                  <td colspan="5" class="px-4 py-6 text-center text-ink-muted">No accounts yet.</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </div>

      <div class="space-y-3">
        @for (account of accounts(); track account.id) {
          <div class="app-list-row flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div class="min-w-0">
              <div class="flex items-center gap-2">
                <span
                  class="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sm"
                  [class]="typeBadgeClass(account.type)"
                >
                  <mat-icon class="!text-base">{{ typeIcon(account.type) }}</mat-icon>
                </span>
                <p class="truncate font-semibold text-ink">{{ account.name }}</p>
              </div>
              <p class="mt-1 text-sm text-ink-muted">
                {{ account.type | titlecase }} · opened {{ account.openingDate | date: 'mediumDate' }}
              </p>
              <p
                class="text-sm font-medium"
                [class]="balanceFor(account.id) < 0 ? 'text-finance-expense' : 'text-action'"
              >
                Balance: {{ balanceFor(account.id) | currency }}
              </p>
            </div>
            <div class="flex shrink-0 gap-1 self-end sm:self-center">
              <button mat-icon-button (click)="edit(account)" [attr.aria-label]="'Edit ' + account.name">
                <mat-icon>edit</mat-icon>
              </button>
              <button mat-icon-button color="warn" (click)="remove(account.id)" [attr.aria-label]="'Delete ' + account.name">
                <mat-icon>delete</mat-icon>
              </button>
            </div>
          </div>
        } @empty {
          <div class="panel text-center">
            <p class="font-semibold text-ink">No accounts yet</p>
            <p class="mt-1 text-sm text-ink-muted">Start with checking. Add savings and credit cards after.</p>
            <button mat-flat-button color="primary" type="button" class="!mt-4" (click)="startAdd()">Add first account</button>
          </div>
        }
      </div>
      </div>
    </div>

    @if (accountSheetOpen()) {
      <app-modal-sheet
        [title]="editingId() ? 'Edit account' : 'Add account'"
        subtitle="Start with the balance from the date you want BudgetApp to begin tracking this account."
        [ariaLabel]="editingId() ? 'Edit account' : 'Add account'"
        (closed)="cancelEdit()"
      >
        <form id="account-form" class="space-y-5" [formGroup]="form" (ngSubmit)="save()">
          <section class="space-y-3">
            <p class="kicker">Account details</p>
            <div class="grid gap-3 sm:grid-cols-2">
              <mat-form-field appearance="outline">
                <mat-label>Name</mat-label>
                <input matInput formControlName="name" autocomplete="off" />
              </mat-form-field>
              <mat-form-field appearance="outline">
                <mat-label>Type</mat-label>
                <mat-select formControlName="type">
                  <mat-option value="checking">Checking</mat-option>
                  <mat-option value="savings">Savings</mat-option>
                  <mat-option value="credit_card">Credit card</mat-option>
                </mat-select>
              </mat-form-field>
            </div>
          </section>

          <section class="rounded-2xl border border-line bg-action-soft/40 p-4">
            <p class="kicker">Opening balance</p>
            <div class="mt-3 grid gap-3 sm:grid-cols-2">
              <mat-form-field appearance="outline">
                <mat-label>
                  @if (isCreditCardForm()) {
                    {{ preservesPositiveCredit() ? 'Amount currently credited' : 'Amount currently owed' }}
                  } @else {
                    Opening balance
                  }
                </mat-label>
                <input matInput type="number" step="0.01" formControlName="openingBalance" />
                <mat-hint>
                  @if (isCreditCardForm()) {
                    Enter a positive amount.
                  } @else {
                    Balance on the tracking start date.
                  }
                </mat-hint>
              </mat-form-field>
              <mat-form-field appearance="outline">
                <mat-label>Opening date</mat-label>
                <input matInput type="date" formControlName="openingDate" />
              </mat-form-field>
            </div>
            <p class="mt-3 rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink-muted">
              @if (isCreditCardForm()) {
                @if (preservesPositiveCredit()) {
                  This existing credit is stored as
                  <strong class="text-finance-income">{{ storedOpeningBalancePreview() | currency }}</strong>
                  and increases net worth.
                } @else {
                  The amount owed is stored as
                  <strong class="text-finance-expense">{{ storedOpeningBalancePreview() | currency }}</strong>
                  and reduces net worth.
                }
              } @else {
                This opening balance contributes
                <strong [class]="storedOpeningBalancePreview() < 0 ? 'text-finance-expense' : 'text-finance-income'">
                  {{ storedOpeningBalancePreview() | currency }}
                </strong>
                to net worth from the opening date.
              }
            </p>
          </section>
        </form>

        <button modalActions mat-button type="button" (click)="cancelEdit()">Cancel</button>
        <button modalActions mat-flat-button color="primary" type="submit" form="account-form" [disabled]="form.invalid">
          {{ editingId() ? 'Update account' : 'Add account' }}
        </button>
      </app-modal-sheet>
    }
  `,
  styles: `
    @media (max-width: 639px) {
      .comparison-table,
      .comparison-table tbody {
        display: block;
      }

      .comparison-table thead {
        display: none;
      }

      .comparison-table tr {
        display: grid;
        grid-template-columns: 1fr 1fr;
        margin: 0.75rem;
        overflow: hidden;
        border: 1px solid var(--color-border);
        border-radius: 0.875rem;
        background: white;
      }

      .comparison-table td {
        display: flex;
        min-height: 44px;
        align-items: center;
        justify-content: space-between;
        gap: 0.75rem;
        padding: 0.625rem 0.75rem;
      }

      .comparison-table td:first-child {
        grid-column: 1 / -1;
        border-bottom: 1px solid var(--color-border);
      }

      .comparison-table td::before {
        content: attr(data-label);
        font-size: 0.7rem;
        font-weight: 600;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        color: var(--color-muted);
      }
    }
  `,
})
export class AccountsComponent {
  private readonly fb = inject(FormBuilder);
  private readonly accountService = inject(AccountService);
  private readonly transactionService = inject(TransactionService);
  private readonly dialog = inject(MatDialog);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly snack = inject(MatSnackBar);

  readonly showAccountForm = signal(false);
  readonly accountSheetOpen = computed(() => this.showAccountForm() || !!this.editingId());
  private readonly accountState = toLoadableSignal(
    this.accountService.watchAccounts(),
    [],
    'Could not load accounts. Check your connection and try again.'
  );
  private readonly transactionState = toLoadableSignal(
    this.transactionService.watchAllTransactions(),
    [],
    'Could not load account activity. Balances may be incomplete.'
  );
  readonly accounts = this.accountState.value;
  private readonly transactions = this.transactionState.value;
  readonly initialLoading = computed(
    () => this.accountState.loading() || this.transactionState.loading()
  );
  readonly loadError = computed(
    () => this.accountState.error() ?? this.transactionState.error()
  );

  private readonly balances = computed(() => {
    const txs = this.transactions();
    return new Map(
      this.accounts().map((account) => [account.id, computeAccountBalance(account, txs)])
    );
  });

  readonly netWorth = computed(() => computeNetWorth(this.accounts(), this.transactions()));
  readonly defaultAccountsNeedReview = computed(() => {
    const accounts = this.accounts();
    return (
      accounts.length === DEFAULT_ACCOUNTS.length &&
      DEFAULT_ACCOUNTS.every((expected) =>
        accounts.some(
          (account) =>
            account.name === expected.name &&
            account.type === expected.type &&
            account.openingBalance === 0
        )
      )
    );
  });

  readonly comparisonRows = computed(() =>
    buildAccountComparisonRows(this.accounts(), this.transactions())
  );

  readonly accountTypeSummaries = computed(() => {
    const accounts = this.accounts();
    const groups: { type: AccountType; title: string; description: string }[] = [
      { type: 'checking', title: 'Checking', description: 'Daily cash and bill-pay accounts' },
      { type: 'savings', title: 'Savings', description: 'Reserves and money set aside' },
      { type: 'credit_card', title: 'Credit cards', description: 'Liabilities reduce net worth when balances are negative' },
    ];
    return groups.map((group) => {
      const matching = accounts.filter((account) => account.type === group.type);
      return {
        ...group,
        count: matching.length,
        total: matching.reduce((sum, account) => sum + this.balanceFor(account.id), 0),
      };
    });
  });

  private readonly netWorthSeries = computed(() => {
    const end = startOfDay(new Date());
    const start = new Date(end);
    start.setDate(start.getDate() - 90);
    return buildNetWorthSeries(this.accounts(), this.transactions(), start, end);
  });

  readonly netWorthLabels = computed(() => this.netWorthSeries().map((p) => p.label));
  readonly netWorthData = computed(() => this.netWorthSeries().map((p) => p.netWorth));

  readonly ytdDelta = computed(() => {
    const today = startOfDay(new Date());
    const jan1 = new Date(today.getFullYear(), 0, 1);
    const startWorth = computeNetWorthAsOf(
      this.accounts(),
      this.transactions(),
      new Date(jan1.getTime() - 1)
    );
    return this.netWorth() - startWorth;
  });

  readonly mtdDelta = computed(() => {
    const today = startOfDay(new Date());
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    const startWorth = computeNetWorthAsOf(
      this.accounts(),
      this.transactions(),
      new Date(monthStart.getTime() - 1)
    );
    return this.netWorth() - startWorth;
  });

  balanceFor(accountId: string): number {
    return this.balances().get(accountId) ?? 0;
  }
  readonly editingId = signal<string | null>(null);

  readonly form = this.fb.nonNullable.group({
    name: ['', Validators.required],
    type: ['checking' as AccountType, Validators.required],
    openingBalance: [0, Validators.required],
    openingDate: [new Date().toISOString().slice(0, 10), Validators.required],
  });
  readonly preservesPositiveCredit = signal(false);
  private readonly formValues = toSignal(
    this.form.valueChanges.pipe(startWith(this.form.getRawValue())),
    { initialValue: this.form.getRawValue() }
  );
  readonly isCreditCardForm = computed(() => this.formValues().type === 'credit_card');
  readonly storedOpeningBalancePreview = computed(() => {
    const value = this.formValues();
    return openingBalanceForStorage(
      value.type ?? 'checking',
      Number(value.openingBalance ?? 0),
      this.preservesPositiveCredit() && value.type === 'credit_card'
    );
  });

  constructor() {
    this.route.queryParamMap.subscribe((params) => {
      if (params.get('action') !== 'add') return;
      queueMicrotask(() => this.startAdd());
      void clearOneShotQueryParams(this.router, this.route, ['action']);
    });
  }

  typeIcon(type: AccountType): string {
    switch (type) {
      case 'checking':
        return 'account_balance';
      case 'savings':
        return 'savings';
      case 'credit_card':
        return 'credit_card';
    }
  }

  typeBadgeClass(type: AccountType): string {
    switch (type) {
      case 'checking':
        return 'bg-action-soft text-action';
      case 'savings':
        return 'bg-finance-incomeSoft text-finance-income';
      case 'credit_card':
        return 'bg-finance-warningSoft text-finance-warning';
    }
  }

  startAdd(): void {
    this.editingId.set(null);
    this.preservesPositiveCredit.set(false);
    this.showAccountForm.set(true);
    this.form.reset({
      name: '',
      type: 'checking',
      openingBalance: 0,
      openingDate: new Date().toISOString().slice(0, 10),
    });
  }

  async save(): Promise<void> {
    if (this.form.invalid) return;
    const value = this.form.getRawValue();
    const input = {
      name: value.name,
      type: value.type,
      openingBalance: openingBalanceForStorage(
        value.type,
        value.openingBalance,
        this.preservesPositiveCredit() && value.type === 'credit_card'
      ),
      openingDate: new Date(value.openingDate),
    };
    const id = this.editingId();
    if (id) {
      await this.accountService.update(id, input);
    } else {
      await this.accountService.create(input);
    }
    this.cancelEdit();
    this.snack.open(id ? 'Account updated.' : 'Account added.', 'Dismiss', {
      duration: 3000,
      panelClass: ['snackbar-success'],
    });
  }

  edit(account: Account): void {
    this.showAccountForm.set(true);
    this.editingId.set(account.id);
    this.preservesPositiveCredit.set(
      account.type === 'credit_card' && account.openingBalance > 0
    );
    this.form.patchValue({
      name: account.name,
      type: account.type,
      openingBalance:
        account.type === 'credit_card'
          ? creditCardOpeningBalanceForForm(account.openingBalance)
          : account.openingBalance,
      openingDate: account.openingDate.toISOString().slice(0, 10),
    });
  }

  cancelEdit(): void {
    this.showAccountForm.set(false);
    this.editingId.set(null);
    this.preservesPositiveCredit.set(false);
    this.form.reset({
      name: '',
      type: 'checking',
      openingBalance: 0,
      openingDate: new Date().toISOString().slice(0, 10),
    });
  }

  reviewOpeningBalances(): void {
    const firstDefault = DEFAULT_ACCOUNTS.map((expected) =>
      this.accounts().find(
        (account) => account.name === expected.name && account.type === expected.type
      )
    ).find((account): account is Account => !!account);
    if (firstDefault) this.edit(firstDefault);
  }

  async remove(id: string): Promise<void> {
    const confirmed = await confirmDialog(this.dialog, {
      title: 'Delete account?',
      message: 'This account will be removed from your account list.',
      detail: 'Transactions that reference this account may lose important context in reports. Only delete accounts you no longer need.',
      confirmLabel: 'Delete account',
      tone: 'danger',
    });
    if (!confirmed) return;
    await this.accountService.remove(id);
    const ref = this.snack.open(
      'Account deleted. Review Activity for transactions that may now show unknown account context.',
      'Review Activity',
      { duration: 8000 }
    );
    ref.onAction().subscribe(() => void this.router.navigate(['/transactions']));
  }
}
