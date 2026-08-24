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
  '#0F766E',
  '#2563EB',
  '#B45309',
  '#7C2D12',
  '#475569',
  '#15803D',
  '#0369A1',
  '#64748B',
  '#92400E',
  '#115E59',
];

@Component({
  selector: 'app-chart-donut',
  standalone: true,
  host: { class: 'block' },
  template: `
    <div class="panel p-5">
      <h3 class="kicker mb-4">{{ title() }}</h3>
      <div class="mx-auto h-64 max-w-sm">
        <canvas #canvas role="img" [attr.aria-label]="title() + ' chart'"></canvas>
      </div>
      @if (labels().length === 0) {
        <p class="mt-2 text-center text-sm text-ink-muted">No spending breakdown for this period yet.</p>
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
            labels: { boxWidth: 12, font: { size: 11 }, color: '#66736F' },
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
