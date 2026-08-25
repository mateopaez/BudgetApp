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
  host: { class: 'block w-full min-w-0 max-w-full' },
  template: `
    <div
      class="relative h-52 w-full min-w-0 max-w-full overflow-hidden"
      [class.hidden]="labels().length === 0"
    >
      <canvas #canvas aria-hidden="true"></canvas>
    </div>
    @if (labels().length === 0) {
      <div class="grid min-h-24 place-items-center rounded-2xl border border-dashed border-line bg-surface-muted px-4 text-center">
        <p class="text-sm text-ink-muted">No activity in this period yet.</p>
      </div>
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
            ticks: {
              color: labelColor,
              font: { size: 11 },
              maxRotation: 0,
              autoSkip: true,
            },
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
    if (labels.length) {
      this.chart.resize();
    }
    this.chart.update();
  }
}
