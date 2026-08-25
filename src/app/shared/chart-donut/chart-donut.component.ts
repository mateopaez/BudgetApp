import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  effect,
  input,
  output,
  viewChild,
} from '@angular/core';
import { Chart, ChartConfiguration, ChartEvent, ActiveElement, registerables } from 'chart.js';
import { chartCssVariable } from '../chart-colors.util';

Chart.register(...registerables);

const PALETTE_VARIABLES = [
  '--chart-series-1',
  '--chart-series-2',
  '--chart-series-3',
  '--chart-series-4',
  '--chart-series-5',
  '--chart-series-6',
  '--chart-series-7',
  '--chart-series-8',
];

@Component({
  selector: 'app-chart-donut',
  standalone: true,
  host: { class: 'block' },
  template: `
    <div class="panel p-5">
      <h3 class="kicker mb-4">{{ title() }}</h3>
      <div class="mx-auto h-64 max-w-sm" [class.hidden]="labels().length === 0">
        <canvas #canvas aria-hidden="true"></canvas>
      </div>
      @if (labels().length === 0) {
        <div class="grid min-h-24 place-items-center rounded-2xl border border-dashed border-line bg-surface-muted px-4 text-center">
          <p class="text-sm text-ink-muted">No spending breakdown for this period yet.</p>
        </div>
      } @else {
        <details class="mt-3 rounded-xl border border-line bg-surface px-3 py-2 text-sm">
          <summary class="min-h-11 cursor-pointer py-2 font-semibold text-action">View {{ title().toLowerCase() }} data</summary>
          <ul class="m-0 list-none divide-y divide-line p-0">
            @for (label of labels(); track $index; let rowIndex = $index) {
              <li>
                @if (categoryIds()[rowIndex]) {
                  <button
                    type="button"
                    class="flex min-h-11 w-full items-center justify-between gap-3 py-2 text-left"
                    (click)="categoryClick.emit(categoryIds()[rowIndex])"
                  >
                    <span>{{ label }}</span>
                    <span class="money font-semibold">{{ formatValue(data()[rowIndex]) }}</span>
                  </button>
                } @else {
                  <div class="flex min-h-11 items-center justify-between gap-3 py-2">
                    <span>{{ label }}</span>
                    <span class="money font-semibold">{{ formatValue(data()[rowIndex]) }}</span>
                  </div>
                }
              </li>
            }
          </ul>
        </details>
      }
    </div>
  `,
})
export class ChartDonutComponent implements AfterViewInit, OnDestroy {
  readonly title = input.required<string>();
  readonly labels = input<string[]>([]);
  readonly data = input<number[]>([]);
  readonly categoryIds = input<string[]>([]);
  readonly categoryClick = output<string>();

  private readonly canvasRef = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private chart?: Chart;

  formatValue(value: number | undefined): string {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 2,
    }).format(value ?? 0);
  }

  constructor() {
    effect(() => {
      const labels = this.labels();
      const data = this.data();
      this.categoryIds();
      if (!this.chart) return;
      this.applyData(labels, data);
    });
  }

  ngAfterViewInit(): void {
    this.chart = new Chart(this.canvasRef().nativeElement, this.buildConfig());
    this.applyData(this.labels(), this.data());
  }

  ngOnDestroy(): void {
    this.chart?.destroy();
  }

  private buildConfig(): ChartConfiguration<'doughnut'> {
    const self = this;
    const canvas = this.canvasRef().nativeElement;
    const labelColor = chartCssVariable(canvas, '--chart-label', '#66736F');
    const surfaceColor = chartCssVariable(canvas, '--chart-surface', '#FFFFFF');
    return {
      type: 'doughnut',
      data: {
        labels: [],
        datasets: [
          {
            data: [],
            backgroundColor: [],
            borderWidth: 2,
            borderColor: surfaceColor,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom',
            labels: { boxWidth: 12, font: { size: 11 }, color: labelColor },
          },
        },
        onClick(_event: ChartEvent, elements: ActiveElement[]) {
          if (!elements.length) return;
          const index = elements[0].index;
          const id = self.categoryIds()[index];
          if (id) self.categoryClick.emit(id);
        },
      },
    };
  }

  private applyData(labels: string[], data: number[]): void {
    if (!this.chart) return;
    const canvas = this.canvasRef().nativeElement;
    this.chart.data.labels = labels;
    this.chart.data.datasets[0].data = data;
    this.chart.data.datasets[0].backgroundColor = labels.map((_, i) =>
      chartCssVariable(canvas, PALETTE_VARIABLES[i % PALETTE_VARIABLES.length], '#0F766E')
    );
    this.chart.update();
  }
}
