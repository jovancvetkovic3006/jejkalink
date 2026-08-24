import {
  AfterViewInit,
  ChangeDetectorRef,
  Component,
  ElementRef,
  Input,
  NgZone,
  OnChanges,
  ViewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Chart, ChartConfiguration, registerables } from 'chart.js';
import annotationPlugin from 'chartjs-plugin-annotation';
import { SgReading } from '../../services/sgs-history.service';
import { HIGH, LOW, VERY_LOW } from '../../domain/glucose';
import { detectGaps } from '../../analytics';
import { downsampleSgPoints, readingMmol } from '../../utils/chart-data.util';

Chart.register(...registerables, annotationPlugin);

export interface BolusMark {
  timestamp: string;
  units: number;
}

const MAX_GAP_ANNOTATIONS = 16;

function hatchPattern(): CanvasPattern | string {
  const c = document.createElement('canvas');
  c.width = 5;
  c.height = 5;
  const ctx = c.getContext('2d');
  if (!ctx) return 'rgba(221, 226, 233, 0.45)';
  ctx.fillStyle = 'rgba(221, 226, 233, 0.35)';
  ctx.fillRect(0, 0, 5, 5);
  ctx.strokeStyle = 'rgba(197, 205, 216, 0.7)';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(0, 5);
  ctx.lineTo(5, 0);
  ctx.stroke();
  return ctx.createPattern(c, 'repeat') || 'rgba(221, 226, 233, 0.45)';
}

@Component({
  selector: 'app-glucose-chart',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="chart-shell" [class.sparkline]="sparkline">
      <div class="chart-title numeral" *ngIf="titleEnabled">{{ displayTitle }}</div>
      <div class="wrap" [class.sparkline]="sparkline">
        <canvas #canvas></canvas>
      </div>
    </div>
  `,
  host: { class: 'glucose-chart-host' },
  styles: [
    `
      :host {
        display: block;
        width: 100%;
        height: 100%;
      }
      .chart-shell {
        display: flex;
        flex-direction: column;
        width: 100%;
        height: 100%;
        min-height: inherit;
      }
      .chart-title {
        font-family: var(--font-data);
        font-size: 12px;
        color: var(--muted);
        padding: 0 4px 6px;
        min-height: 18px;
        letter-spacing: -0.01em;
        font-variant-numeric: tabular-nums;
      }
      .chart-shell:not(.sparkline) .chart-title {
        font-size: 13px;
        color: var(--ink);
        font-weight: 500;
      }
      .wrap {
        position: relative;
        width: 100%;
        flex: 1;
        min-height: 180px;
      }
      .wrap.sparkline {
        min-height: 0;
      }
      canvas {
        display: block;
        width: 100% !important;
        height: 100% !important;
        touch-action: none;
      }
      .sparkline canvas {
        touch-action: pan-y;
      }
    `,
  ],
})
export class GlucoseChartComponent implements AfterViewInit, OnChanges {
  @ViewChild('canvas') canvasRef?: ElementRef<HTMLCanvasElement>;
  @Input() readings: SgReading[] = [];
  @Input() startMs = 0;
  @Input() endMs = 0;
  @Input() sparkline = false;
  @Input() boluses: BolusMark[] = [];
  @Input() targetLow = LOW;
  @Input() targetHigh = HIGH;
  /** Default label above the chart; updates while scrubbing. */
  @Input() title = '';
  @Input() showTitle = true;

  displayTitle = '';
  private chart?: Chart;
  private scrubbing = false;
  private readonly onPointerLeave = () => {
    this.scrubbing = false;
    this.setDisplayTitle(this.title);
  };

  constructor(
    private readonly cdr: ChangeDetectorRef,
    private readonly zone: NgZone
  ) {}

  get titleEnabled(): boolean {
    return this.showTitle && (!!this.title || !!this.displayTitle);
  }

  ngAfterViewInit() {
    this.render();
  }

  ngOnChanges() {
    if (!this.scrubbing) {
      this.displayTitle = this.title;
    }
    if (this.canvasRef) this.render();
  }

  private maxPoints(): number {
    if (this.sparkline) return 64;
    const hours = Math.max(1, (this.endMs - this.startMs) / 3_600_000);
    if (hours <= 6) return 120;
    if (hours <= 24) return 240;
    if (hours <= 72) return 360;
    return 480;
  }

  private setDisplayTitle(text: string) {
    if (this.displayTitle === text) return;
    this.zone.run(() => {
      this.displayTitle = text;
      this.cdr.markForCheck();
    });
  }

  private formatScrub(x: number, y: number): string {
    const when = new Date(x).toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
    });
    return `${when} · ${y.toFixed(1)} mmol/L`;
  }

  private render() {
    const canvas = this.canvasRef?.nativeElement;
    if (!canvas || !this.startMs || !this.endMs) return;

    if (!this.scrubbing) {
      this.displayTitle = this.title;
    }

    const slice = this.readings.filter((r) => {
      const t = new Date(r.timestamp).getTime();
      return t >= this.startMs && t <= this.endMs && readingMmol(r) > 0;
    });
    const display = downsampleSgPoints(slice, this.maxPoints());

    const gaps = detectGaps(
      this.readings,
      new Date(this.startMs),
      new Date(this.endMs)
    )
      .segments.filter((s) => !s.covered)
      .slice(0, MAX_GAP_ANNOTATIONS);

    const points = display.map((d) => ({
      x: new Date(d.timestamp).getTime(),
      y: readingMmol(d),
    }));

    const data: { x: number; y: number | null }[] = [];
    for (let i = 0; i < points.length; i++) {
      if (i > 0) {
        const gap = gaps.find(
          (g) =>
            g.from.getTime() >= points[i - 1].x &&
            g.to.getTime() <= points[i].x
        );
        if (gap) {
          data.push({ x: gap.from.getTime(), y: null });
        }
      }
      data.push(points[i]);
    }

    const low = this.targetLow;
    const high = this.targetHigh;
    const hatch = hatchPattern();
    const annotations: Record<string, unknown> = {};

    for (let i = 0; i < gaps.length; i++) {
      annotations[`gap_${i}`] = {
        type: 'box',
        xMin: gaps[i].from.getTime(),
        xMax: gaps[i].to.getTime(),
        backgroundColor: hatch,
        borderWidth: 0,
        drawTime: 'beforeDatasetsDraw',
        label: {
          display: !this.sparkline,
          content: 'gap',
          position: 'start',
          yAdjust: 8,
          color: '#707C91',
          font: { size: 8.5, family: 'IBM Plex Mono' },
        },
      };
    }

    annotations['band'] = {
      type: 'box',
      yMin: low,
      yMax: high,
      backgroundColor: 'rgba(233, 245, 243, 0.85)',
      borderWidth: 0,
      drawTime: 'beforeDatasetsDraw',
    };

    const bolusData = this.boluses
      .filter((b) => {
        const t = new Date(b.timestamp).getTime();
        return t >= this.startMs && t <= this.endMs;
      })
      .map((b) => ({
        x: new Date(b.timestamp).getTime(),
        y: Math.min(5.5, 2.2 + b.units * 0.45),
      }));

    const lastIdx = data.length - 1;
    const lineDatasetIndex = 1;
    const datasets: ChartConfiguration['data']['datasets'] = [
      {
        type: 'bar',
        data: bolusData as any,
        backgroundColor: 'rgba(51, 68, 204, 0.82)',
        borderRadius: 1.6,
        barThickness: this.sparkline ? 3 : 4.8,
        order: 2,
      },
      {
        type: 'line',
        data: data as any,
        borderColor: '#15213B',
        backgroundColor: '#15213B',
        borderWidth: this.sparkline ? 2 : 1.9,
        pointRadius: (ctx: { dataIndex?: number; parsed?: { y?: number | null } }) => {
          const y = ctx.parsed?.y;
          if (y == null) return 0;
          if (this.sparkline && ctx.dataIndex === lastIdx) return 4;
          if (y < low) return 2.1;
          if (y > high) return 1.7;
          return 0;
        },
        pointBackgroundColor: (ctx: {
          dataIndex?: number;
          parsed?: { y?: number | null };
        }) => {
          const y = ctx.parsed?.y;
          if (y == null) return '#15213B';
          if (this.sparkline && ctx.dataIndex === lastIdx) return '#0E9B8A';
          if (y < VERY_LOW) return '#9B1B47';
          if (y < low) return '#C2255C';
          if (y > high) return 'rgba(199, 124, 30, 0.75)';
          return '#15213B';
        },
        pointBorderColor: '#fff',
        pointBorderWidth: (ctx: { dataIndex?: number; parsed?: { y?: number | null } }) =>
          this.sparkline && ctx.dataIndex === lastIdx ? 2 : 0,
        tension: 0.2,
        spanGaps: false,
        parsing: false,
        order: 1,
      },
    ];

    const daySpan = this.endMs - this.startMs >= 20 * 60 * 60 * 1000;
    const xTicks = daySpan
      ? {
          color: '#707C91',
          font: { size: 8.5, family: 'IBM Plex Mono' },
          autoSkip: false,
          callback: (_v: string | number, i: number, ticks: { value: number }[]) => {
            const hours = [0, 6, 12, 18, 24];
            const t = ticks[i]?.value;
            if (t == null) return '';
            const h = Math.round(((t - this.startMs) / (this.endMs - this.startMs)) * 24);
            return hours.includes(h) ? String(h).padStart(2, '0') : '';
          },
        }
      : {
          maxTicksLimit: 5,
          color: '#707C91',
          font: { size: 10, family: 'IBM Plex Mono' },
          callback: (v: string | number) =>
            new Date(Number(v)).toLocaleTimeString('en-GB', {
              hour: '2-digit',
              minute: '2-digit',
            }),
        };

    const cfg: ChartConfiguration = {
      type: 'line',
      data: { datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        interaction: {
          mode: 'nearest',
          axis: 'x',
          intersect: false,
        },
        onHover: (_event, elements) => {
          const hit = elements.find((e) => e.datasetIndex === lineDatasetIndex);
          if (!hit) return;
          const pt = data[hit.index];
          if (pt?.y == null) return;
          this.scrubbing = true;
          this.setDisplayTitle(this.formatScrub(pt.x, pt.y));
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            enabled: false,
          },
          annotation: { annotations: annotations as any },
        },
        scales: {
          x: {
            type: 'linear',
            min: this.startMs,
            max: this.endMs,
            display: !this.sparkline,
            ticks: xTicks as any,
            grid: { color: 'rgba(227, 231, 237, 1)', drawTicks: false },
          },
          y: {
            min: 2.5,
            max: this.sparkline ? 15 : 16,
            display: true,
            ticks: {
              color: '#707C91',
              font: { size: 8.5, family: 'IBM Plex Mono' },
              padding: this.sparkline ? 0 : 3,
              callback: (v) => {
                const n = Number(v);
                if (Math.abs(n - low) < 0.05) return low.toFixed(1);
                if (Math.abs(n - high) < 0.05) return high.toFixed(1);
                if (!this.sparkline && (n === 15 || n === 16)) return '15';
                return '';
              },
            },
            grid: {
              color: (ctx) =>
                Math.abs(ctx.tick.value - low) < 0.05 ||
                Math.abs(ctx.tick.value - high) < 0.05
                  ? 'rgba(227, 231, 237, 1)'
                  : 'transparent',
              drawTicks: false,
            },
          },
        },
        layout: {
          padding: this.sparkline
            ? { top: 4, bottom: 4, left: 0, right: 0 }
            : { top: 0, bottom: 0, left: 0, right: 0 },
        },
      },
    };

    if (this.chart) {
      canvas.removeEventListener('mouseleave', this.onPointerLeave);
      canvas.removeEventListener('touchend', this.onPointerLeave);
      canvas.removeEventListener('touchcancel', this.onPointerLeave);
      this.chart.destroy();
    }
    this.chart = new Chart(canvas, cfg);
    canvas.addEventListener('mouseleave', this.onPointerLeave);
    canvas.addEventListener('touchend', this.onPointerLeave);
    canvas.addEventListener('touchcancel', this.onPointerLeave);
  }
}
