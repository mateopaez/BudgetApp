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

Chart.register(...registerables);

@Component({
  selector: 'app-chart-card',
  standalone: true,
  host: { class: 'block' },
  template: `
    <div class="panel p-5">
      <h3 class="kicker mb-4">{{ title() }}</h3>
      <div class="h-56">
        <canvas #canvas></canvas>
      </div>
      @if (labels().length === 0) {
        <p class="mt-2 text-center text-sm text-slate-500">No data for this period.</p>
      }
    </div>
  `,
})
export class ChartCardComponent implements AfterViewInit, OnDestroy {
  readonly title = input.required<string>();
  readonly labels = input<string[]>([]);
  readonly data = input<number[]>([]);
  readonly color = input('#0F766E');

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
    return {
      type: 'line',
      data: {
        labels: [],
        datasets: [
          {
            data: [],
            borderColor: this.color(),
            backgroundColor: `${this.color()}22`,
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
            grid: { color: '#DED8CE' },
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

  private applyData(labels: string[], data: number[], color: string): void {
    if (!this.chart) return;
    this.chart.data.labels = labels;
    this.chart.data.datasets[0].data = data;
    this.chart.data.datasets[0].borderColor = color;
    this.chart.data.datasets[0].backgroundColor = `${color}22`;
    this.chart.update();
  }
}
