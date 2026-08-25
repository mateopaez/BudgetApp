import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  effect,
  input,
  viewChild,
} from '@angular/core';
import { Chart, ChartConfiguration, ChartDataset, registerables } from 'chart.js';
import { chartCssColor, chartCssVariable } from '../chart-colors.util';

Chart.register(...registerables);

@Component({
  selector: 'app-chart-bar',
  standalone: true,
  host: { class: 'block' },
  template: `
    <div class="h-52" [class.hidden]="labels().length === 0">
      <canvas #canvas aria-hidden="true"></canvas>
    </div>
    @if (labels().length === 0) {
      <div class="grid min-h-24 place-items-center rounded-2xl border border-dashed border-line bg-surface-muted px-4 text-center">
        <p class="text-sm text-ink-muted">No activity in this period yet.</p>
      </div>
    } @else {
      <details class="mt-3 rounded-xl border border-line bg-surface px-3 py-2 text-sm">
        <summary class="min-h-11 cursor-pointer py-2 font-semibold text-action">View chart data</summary>
        <div class="overflow-x-auto">
          <table class="w-full text-left">
            <thead>
              <tr class="border-b border-line">
                <th class="py-2 pr-4">Period</th>
                @if (datasets().length) {
                  @for (series of datasets(); track series.label) {
                    <th class="py-2 pr-4">{{ series.label }}</th>
                  }
                } @else {
                  <th class="py-2 pr-4">Amount</th>
                }
              </tr>
            </thead>
            <tbody>
              @for (label of labels(); track $index; let rowIndex = $index) {
                <tr class="border-b border-line/60">
                  <th class="py-2 pr-4 font-medium">{{ label }}</th>
                  @if (datasets().length) {
                    @for (series of datasets(); track series.label) {
                      <td class="money py-2 pr-4">{{ formatValue(series.data[rowIndex]) }}</td>
                    }
                  } @else {
                    <td class="money py-2 pr-4">{{ formatValue(data()[rowIndex]) }}</td>
                  }
                </tr>
              }
            </tbody>
          </table>
        </div>
      </details>
    }
  `,
})
export class ChartBarComponent implements AfterViewInit, OnDestroy {
  readonly labels = input<string[]>([]);
  /** Single series — used when datasets() is empty. */
  readonly data = input<number[]>([]);
  readonly color = input('var(--chart-series-1)');
  readonly average = input<number | null>(null);
  readonly averageLabel = input('Average');
  readonly averageColor = input('var(--chart-label)');
  /** Multi-series bar groups (e.g. Income / Expenses / Savings). */
  readonly datasets = input<{ label: string; data: number[]; color: string }[]>([]);

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
      this.labels();
      this.data();
      this.color();
      this.average();
      this.datasets();
      if (!this.chart) return;
      this.applyData();
    });
  }

  ngAfterViewInit(): void {
    this.chart = new Chart(this.canvasRef().nativeElement, this.buildConfig());
    this.applyData();
  }

  ngOnDestroy(): void {
    this.chart?.destroy();
  }

  private buildConfig(): ChartConfiguration {
    const canvas = this.canvasRef().nativeElement;
    const labelColor = chartCssVariable(canvas, '--chart-label', '#66736F');
    const gridColor = chartCssVariable(canvas, '--chart-grid', '#DED8CE');
    return {
      type: 'bar',
      data: { labels: [], datasets: [] },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: true,
            position: 'bottom',
            labels: { boxWidth: 12, font: { size: 11 }, color: labelColor },
          },
        },
        scales: {
          x: {
            grid: { display: false },
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

  private applyData(): void {
    if (!this.chart) return;
    const canvas = this.canvasRef().nativeElement;
    const labels = this.labels();
    this.chart.data.labels = labels;

    const multi = this.datasets();
    const chartDatasets: ChartDataset[] = [];

    if (multi.length) {
      for (const series of multi) {
        chartDatasets.push({
          type: 'bar',
          label: series.label,
          data: series.data,
          backgroundColor: chartCssColor(canvas, series.color, '#0F766E'),
          borderRadius: 6,
          maxBarThickness: 36,
        });
      }
    } else {
      chartDatasets.push({
        type: 'bar',
        label: 'Amount',
        data: this.data(),
        backgroundColor: chartCssColor(canvas, this.color(), '#0F766E'),
        borderRadius: 6,
        maxBarThickness: 48,
      });
    }

    const avg = this.average();
    if (avg != null && labels.length) {
      chartDatasets.push({
        type: 'line',
        label: this.averageLabel(),
        data: labels.map(() => avg),
        borderColor: chartCssColor(canvas, this.averageColor(), '#66736F'),
        backgroundColor: chartCssColor(canvas, this.averageColor(), '#66736F'),
        borderWidth: 2,
        pointRadius: 0,
        tension: 0,
        order: 0,
      });
    }

    this.chart.data.datasets = chartDatasets;
    const showLegend = multi.length > 0 || avg != null;
    if (this.chart.options.plugins?.legend) {
      this.chart.options.plugins.legend.display = showLegend;
    }
    this.chart.update();
  }
}
