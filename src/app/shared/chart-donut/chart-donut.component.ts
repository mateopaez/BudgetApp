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

Chart.register(...registerables);

const PALETTE = [
  '#7c3aed',
  '#dc2626',
  '#16a34a',
  '#2563eb',
  '#d97706',
  '#db2777',
  '#0891b2',
  '#4f46e5',
  '#65a30d',
  '#9333ea',
];

@Component({
  selector: 'app-chart-donut',
  standalone: true,
  host: { class: 'block' },
  template: `
    <div class="app-card p-5">
      <h3 class="mb-4 text-sm font-semibold uppercase tracking-wide text-brand-800">{{ title() }}</h3>
      <div class="mx-auto h-64 max-w-sm">
        <canvas #canvas></canvas>
      </div>
      @if (labels().length === 0) {
        <p class="mt-2 text-center text-sm text-slate-500">No spending in this period.</p>
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
    return {
      type: 'doughnut',
      data: {
        labels: [],
        datasets: [
          {
            data: [],
            backgroundColor: [],
            borderWidth: 2,
            borderColor: '#ffffff',
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom',
            labels: { boxWidth: 12, font: { size: 11 }, color: '#64748b' },
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
    this.chart.data.labels = labels;
    this.chart.data.datasets[0].data = data;
    this.chart.data.datasets[0].backgroundColor = labels.map(
      (_, i) => PALETTE[i % PALETTE.length]
    );
    this.chart.update();
  }
}
