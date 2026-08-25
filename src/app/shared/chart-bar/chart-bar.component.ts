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

Chart.register(...registerables);

@Component({
  selector: 'app-chart-bar',
  standalone: true,
  host: { class: 'block' },
  template: `
    <div class="h-52">
      <canvas #canvas role="img" aria-label="Financial bar chart"></canvas>
    </div>
    @if (labels().length === 0) {
      <p class="mt-2 text-center text-sm text-ink-muted">No activity in this period yet.</p>
    }
  `,
})
export class ChartBarComponent implements AfterViewInit, OnDestroy {
  readonly labels = input<string[]>([]);
  /** Single series — used when datasets() is empty. */
  readonly data = input<number[]>([]);
  readonly color = input('#0F766E');
  readonly average = input<number | null>(null);
  readonly averageLabel = input('Average');
  readonly averageColor = input('#66736F');
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
            labels: { boxWidth: 12, font: { size: 11 }, color: '#66736F' },
          },
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: '#66736F', font: { size: 11 } },
          },
          y: {
            beginAtZero: true,
            grid: { color: '#DED8CE' },
            ticks: { color: '#66736F', font: { size: 11 } },
          },
        },
      },
    };
  }

  private applyData(): void {
    if (!this.chart) return;
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
          backgroundColor: series.color,
          borderRadius: 6,
          maxBarThickness: 36,
        });
      }
    } else {
      chartDatasets.push({
        type: 'bar',
        label: 'Amount',
        data: this.data(),
        backgroundColor: this.color(),
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
        borderColor: this.averageColor(),
        backgroundColor: this.averageColor(),
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
