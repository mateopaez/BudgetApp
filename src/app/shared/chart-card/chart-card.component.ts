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
  template: `
    <div class="app-card p-5">
      <h3 class="mb-4 text-sm font-semibold uppercase tracking-wide text-brand-800">{{ title() }}</h3>
      <div class="h-56">
        <canvas #canvas></canvas>
      </div>
    </div>
  `,
})
export class ChartCardComponent implements AfterViewInit, OnDestroy {
  readonly title = input.required<string>();
  readonly labels = input<string[]>([]);
  readonly data = input<number[]>([]);
  readonly color = input('#7c3aed');

  private readonly canvasRef = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private chart?: Chart;

  constructor() {
    effect(() => {
      if (this.chart) {
        this.updateChart();
      }
    });
  }

  ngAfterViewInit(): void {
    this.chart = new Chart(this.canvasRef().nativeElement, this.buildConfig());
  }

  ngOnDestroy(): void {
    this.chart?.destroy();
  }

  private buildConfig(): ChartConfiguration<'line'> {
    return {
      type: 'line',
      data: {
        labels: this.labels(),
        datasets: [
          {
            data: this.data(),
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
            grid: { color: '#ede9fe' },
            ticks: { color: '#64748b', font: { size: 11 } },
          },
          y: {
            beginAtZero: true,
            grid: { color: '#ede9fe' },
            ticks: { color: '#64748b', font: { size: 11 } },
          },
        },
      },
    };
  }

  private updateChart(): void {
    if (!this.chart) return;
    this.chart.data.labels = this.labels();
    this.chart.data.datasets[0].data = this.data();
    this.chart.data.datasets[0].borderColor = this.color();
    this.chart.data.datasets[0].backgroundColor = `${this.color()}22`;
    this.chart.update();
  }
}
