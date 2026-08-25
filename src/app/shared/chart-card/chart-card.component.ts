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
  host: { class: 'block w-full min-w-0 max-w-full' },
  template: `
    <div class="panel w-full min-w-0 max-w-full overflow-hidden p-4 sm:p-5">
      <h3 class="kicker mb-3 sm:mb-4">{{ title() }}</h3>
      <div
        class="relative h-56 w-full min-w-0 max-w-full overflow-hidden"
        [class.hidden]="labels().length === 0"
      >
        <canvas #canvas aria-hidden="true"></canvas>
      </div>
      @if (labels().length === 0) {
        <div class="grid min-h-24 place-items-center rounded-2xl border border-dashed border-line bg-surface-muted px-4 text-center">
          <p class="text-sm text-ink-muted">No balance history for this period yet.</p>
        </div>
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

  private applyData(labels: string[], data: number[], color: string): void {
    if (!this.chart) return;
    const resolvedColor = chartCssColor(this.canvasRef().nativeElement, color, '#0F766E');
    this.chart.data.labels = labels;
    this.chart.data.datasets[0].data = data;
    this.chart.data.datasets[0].borderColor = resolvedColor;
    this.chart.data.datasets[0].backgroundColor = colorWithAlpha(resolvedColor, '22');
    if (labels.length) {
      this.chart.resize();
    }
    this.chart.update();
  }
}
