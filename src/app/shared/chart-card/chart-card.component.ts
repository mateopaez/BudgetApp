import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  effect,
  input,
  viewChild,
} from '@angular/core';
import { Chart, ChartConfiguration, registerables } from 'chart.js';
import { chartCssColor, chartCssVariable, colorWithAlpha } from '../chart-colors.util';

Chart.register(...registerables);

@Component({
  selector: 'app-chart-card',
  standalone: true,
  host: { class: 'block' },
  template: `
    <div class="panel p-5">
      <h3 class="kicker mb-4">{{ title() }}</h3>
      <div class="h-56" [class.hidden]="labels().length === 0">
        <canvas #canvas aria-hidden="true"></canvas>
      </div>
      @if (labels().length === 0) {
        <div class="grid min-h-24 place-items-center rounded-2xl border border-dashed border-line bg-surface-muted px-4 text-center">
          <p class="text-sm text-ink-muted">No balance history for this period yet.</p>
        </div>
      } @else {
        <details class="mt-3 rounded-xl border border-line bg-surface px-3 py-2 text-sm">
          <summary class="min-h-11 cursor-pointer py-2 font-semibold text-action">View chart data</summary>
          <ul class="m-0 max-h-56 list-none divide-y divide-line overflow-y-auto p-0">
            @for (label of labels(); track $index; let rowIndex = $index) {
              <li class="flex min-h-11 items-center justify-between gap-3 py-2">
                <span>{{ label }}</span>
                <span class="money font-semibold">{{ formatValue(data()[rowIndex]) }}</span>
              </li>
            }
          </ul>
        </details>
      }
    </div>
  `,
})
export class ChartCardComponent implements AfterViewInit, OnDestroy {
  readonly title = input.required<string>();
  readonly labels = input<string[]>([]);
  readonly data = input<number[]>([]);
  readonly color = input('var(--chart-series-1)');

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
      // Always read inputs so the effect re-runs when data arrives from Firestore.
      const labels = this.labels();
      const data = this.data();
      const color = this.color();
      if (!this.chart) return;
      this.applyData(labels, data, color);
    });
  }

  ngAfterViewInit(): void {
    this.chart = new Chart(this.canvasRef().nativeElement, this.buildConfig());
    this.applyData(this.labels(), this.data(), this.color());
  }

  ngOnDestroy(): void {
    this.chart?.destroy();
  }

  private buildConfig(): ChartConfiguration<'line'> {
    const canvas = this.canvasRef().nativeElement;
    const color = chartCssColor(canvas, this.color(), '#0F766E');
    const gridColor = chartCssVariable(canvas, '--chart-grid', '#DED8CE');
    const labelColor = chartCssVariable(canvas, '--chart-label', '#66736F');
    return {
      type: 'line',
      data: {
        labels: [],
        datasets: [
          {
            data: [],
            borderColor: color,
            backgroundColor: colorWithAlpha(color, '22'),
            fill: true,
            tension: 0.3,
            pointRadius: 3,
            pointHoverRadius: 5,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: {
            grid: { color: gridColor },
            ticks: { color: labelColor, font: { size: 11 } },
          },
          y: {
            beginAtZero: true,
            grid: { color: gridColor },
            ticks: { color: labelColor, font: { size: 11 } },
          },
        },
      },
    };
  }

  private applyData(labels: string[], data: number[], color: string): void {
    if (!this.chart) return;
    const resolvedColor = chartCssColor(this.canvasRef().nativeElement, color, '#0F766E');
    this.chart.data.labels = labels;
    this.chart.data.datasets[0].data = data;
    this.chart.data.datasets[0].borderColor = resolvedColor;
    this.chart.data.datasets[0].backgroundColor = colorWithAlpha(resolvedColor, '22');
    this.chart.update();
  }
}
