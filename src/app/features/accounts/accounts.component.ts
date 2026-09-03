import { CurrencyPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
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
import { formatShortDate } from '../../core/utils/format.util';
import { clearOneShotQueryParams } from '../../core/utils/one-shot-query.util';
import { toLoadableSignal } from '../../core/utils/loadable-signal.util';
import { confirmDialog } from '../../shared/confirm-dialog/confirm-dialog.component';
import { ModalSheetComponent } from '../../shared/modal-sheet/modal-sheet.component';

interface AccountRow {
  account: Account;
  balance: number;
  displayAmount: number;
  displayTone: 'expense' | 'positive' | 'muted';
  balanceCaption: string | null;
  typeLabel: string;
  lastActivityLabel: string | null;
}

interface AccountGroup {
  id: 'cash' | 'credit';
  label: string;
  rows: AccountRow[];
}

@Component({
  selector: 'app-accounts',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    CurrencyPipe,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatIconModule,
    MatSnackBarModule,
    ModalSheetComponent,
  ],
  template: `
    <div class="page !space-y-10">
      <header class="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div class="page-header">
          <h1 class="page-title">Accounts</h1>
          <p class="page-subtitle">
            Where your money sits — cash accounts and credit cards.
          </p>
        </div>
        @if (!accountSheetOpen() && !initialLoading()) {
          <button mat-flat-button color="primary" type="button" (click)="startAdd()">
            <mat-icon>add</mat-icon>
            Add account
          </button>
        }
      </header>

      @if (initialLoading()) {
        <section class="empty-state animate-pulse" role="status" aria-live="polite">
          <p class="font-medium text-ink">Loading accounts…</p>
          <p class="mt-1 text-sm text-ink-muted">Balances will appear after your account data arrives.</p>
        </section>
      } @else if (loadError()) {
        <p class="status-banner status-banner--error" role="alert">{{ loadError() }}</p>
      } @else {
        @if (defaultAccountsNeedReview()) {
          <section class="status-banner status-banner--warning sm:flex sm:items-center sm:justify-between sm:gap-4">
            <div>
              <p class="font-semibold">Review your starting balances</p>
              <p class="mt-1 text-sm">
                At least one cash account still has a $0 opening balance. Add each real balance and
                the date it applies before relying on these figures.
              </p>
            </div>
            <button
              mat-stroked-button
              type="button"
              class="!mt-3 shrink-0 sm:!mt-0"
              (click)="reviewOpeningBalances()"
            >
              Review accounts
            </button>
          </section>
        }

        @if (accounts().length) {
          <section aria-labelledby="accounts-summary-heading" class="border-b border-line pb-6">
            <h2 id="accounts-summary-heading" class="sr-only">Cash and credit summary</h2>
            <div class="flex flex-wrap gap-x-10 gap-y-3 text-sm">
              <div>
                <p class="kicker">Total cash</p>
                <p
                  class="money mt-1 text-xl font-semibold"
                  [class.text-finance-expense]="totalCash() < 0"
                  [class.text-action]="totalCash() >= 0"
                >
                  {{ totalCash() | currency }}
                </p>
              </div>
              <div>
                <p class="kicker">Credit owed</p>
                <p
                  class="money mt-1 text-xl font-semibold"
                  [class.text-finance-expense]="creditOwed() > 0"
                  [class.text-ink-muted]="creditOwed() === 0"
                >
                  {{ creditOwed() | currency }}
                </p>
              </div>
            </div>
          </section>

          @for (group of accountGroups(); track group.id) {
            @if (group.rows.length) {
              <section [attr.aria-labelledby]="'group-' + group.id">
                <h2 [id]="'group-' + group.id" class="section-title">{{ group.label }}</h2>
                <ul class="list-shell mt-4 list-none p-0">
                  @for (row of group.rows; track row.account.id) {
                    <li class="list-row">
                      <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div class="min-w-0 flex-1">
                          <p class="truncate font-medium text-ink">{{ row.account.name }}</p>
                          <p class="mt-0.5 text-sm text-ink-muted">
                            {{ row.typeLabel }}
                            @if (row.balanceCaption) {
                              · {{ row.balanceCaption }}
                            }
                            @if (row.lastActivityLabel) {
                              · Last activity {{ row.lastActivityLabel }}
                            }
                          </p>
                        </div>
                        <div class="flex shrink-0 items-center justify-between gap-2 sm:justify-end">
                          <p
                            class="money text-base font-semibold sm:text-right"
                            [class.text-finance-expense]="row.displayTone === 'expense'"
                            [class.text-action]="row.displayTone === 'positive'"
                            [class.text-ink-muted]="row.displayTone === 'muted'"
                          >
                            {{ row.displayAmount | currency }}
                          </p>
                          <div class="flex">
                            <button
                              mat-icon-button
                              type="button"
                              (click)="edit(row.account)"
                              [attr.aria-label]="'Edit ' + row.account.name"
                            >
                              <mat-icon>edit</mat-icon>
                            </button>
                            <button
                              mat-icon-button
                              color="warn"
                              type="button"
                              (click)="remove(row.account.id)"
                              [attr.aria-label]="'Delete ' + row.account.name"
                            >
                              <mat-icon>delete</mat-icon>
                            </button>
                          </div>
                        </div>
                      </div>
                    </li>
                  }
                </ul>
              </section>
            }
          }
        } @else {
          <section class="empty-state space-y-4">
            <h2 class="section-title">No accounts yet</h2>
            <p class="mx-auto max-w-md text-sm leading-6 text-ink-muted">
              Start with checking. Add savings and credit cards after so you can see where your money
              sits.
            </p>
            <button mat-flat-button color="primary" type="button" (click)="startAdd()">
              <mat-icon>add</mat-icon>
              Add account
            </button>
          </section>
        }
      }
    </div>

    @if (accountSheetOpen()) {
      <app-modal-sheet
        [title]="editingId() ? 'Edit account' : 'Add account'"
        subtitle="Start with the balance from the date you want Ledger to begin tracking this account."
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

          <section class="rounded-2xl border border-line bg-action-soft40 p-4">
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
            <p class="mt-3 rounded-xl border border-line bg-surface px-3 py-2 text-sm text-ink-muted">
              @if (isCreditCardForm()) {
                @if (preservesPositiveCredit()) {
                  This existing credit is stored as
                  <strong class="text-finance-income">{{ storedOpeningBalancePreview() | currency }}</strong>
                  on the card.
                } @else {
                  The amount owed is stored as
                  <strong class="text-finance-expense">{{ storedOpeningBalancePreview() | currency }}</strong>
                  on the card.
                }
              } @else {
                This opening balance starts at
                <strong [class]="storedOpeningBalancePreview() < 0 ? 'text-finance-expense' : 'text-finance-income'">
                  {{ storedOpeningBalancePreview() | currency }}
                </strong>
                from the opening date.
              }
            </p>
          </section>
        </form>

        <button modalActions mat-button type="button" (click)="cancelEdit()">Cancel</button>
        <button
          modalActions
          mat-flat-button
          color="primary"
          type="submit"
          form="account-form"
          [disabled]="form.invalid"
        >
          {{ editingId() ? 'Update account' : 'Add account' }}
        </button>
      </app-modal-sheet>
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

  private readonly lastActivityByAccount = computed(() => {
    const latest = new Map<string, Date>();
    for (const tx of this.transactions()) {
      const prev = latest.get(tx.accountId);
      if (!prev || tx.postedAt > prev) {
        latest.set(tx.accountId, tx.postedAt);
      }
    }
    return latest;
  });

  readonly defaultAccountsNeedReview = computed(() => {
    return this.accounts().some(
      (account) =>
        (account.type === 'checking' || account.type === 'savings') &&
        account.openingBalance === 0
    );
  });

  readonly totalCash = computed(() =>
    this.accounts()
      .filter((account) => account.type === 'checking' || account.type === 'savings')
      .reduce((sum, account) => sum + this.balanceFor(account.id), 0)
  );

  readonly creditOwed = computed(() =>
    this.accounts()
      .filter((account) => account.type === 'credit_card')
      .reduce((sum, account) => {
        const balance = this.balanceFor(account.id);
        return sum + (balance < 0 ? Math.abs(balance) : 0);
      }, 0)
  );

  readonly accountGroups = computed((): AccountGroup[] => {
    const rows = this.accounts().map((account) => this.toRow(account));
    return [
      {
        id: 'cash',
        label: 'Cash',
        rows: rows.filter(
          (row) => row.account.type === 'checking' || row.account.type === 'savings'
        ),
      },
      {
        id: 'credit',
        label: 'Credit cards',
        rows: rows.filter((row) => row.account.type === 'credit_card'),
      },
    ];
  });

  balanceFor(accountId: string): number {
    return this.balances().get(accountId) ?? 0;
  }

  private toRow(account: Account): AccountRow {
    const last = this.lastActivityByAccount().get(account.id);
    const balance = this.balanceFor(account.id);
    const isCard = account.type === 'credit_card';

    let displayAmount = balance;
    let displayTone: AccountRow['displayTone'] = balance < 0 ? 'expense' : 'positive';
    let balanceCaption: string | null = null;

    if (isCard) {
      if (balance < 0) {
        displayAmount = Math.abs(balance);
        displayTone = 'expense';
        balanceCaption = 'Owed';
      } else if (balance > 0) {
        displayAmount = balance;
        displayTone = 'positive';
        balanceCaption = 'Credit on card';
      } else {
        displayAmount = 0;
        displayTone = 'muted';
        balanceCaption = 'Nothing owed';
      }
    }

    return {
      account,
      balance,
      displayAmount,
      displayTone,
      balanceCaption,
      typeLabel: this.typeLabel(account.type),
      lastActivityLabel: last ? formatShortDate(last) : null,
    };
  }

  private typeLabel(type: AccountType): string {
    switch (type) {
      case 'checking':
        return 'Checking';
      case 'savings':
        return 'Savings';
      case 'credit_card':
        return 'Credit card';
    }
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
      detail:
        'Transactions that reference this account may lose important context in reports. Only delete accounts you no longer need.',
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
    ref.onAction().subscribe(() => void this.router.navigate(['/activity']));
  }
}
