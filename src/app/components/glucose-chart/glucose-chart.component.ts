import {
  AfterViewInit,
  Component,
  ElementRef,
  Input,
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

function hatchPattern(): CanvasPattern | string {
  const c = document.createElement('canvas');
  c.width = 8;
  c.height = 8;
  const ctx = c.getContext('2d');
  if (!ctx) return 'rgba(221, 226, 233, 0.7)';
  ctx.fillStyle = '#E8ECF1';
  ctx.fillRect(0, 0, 8, 8);
  ctx.strokeStyle = '#C5CDD8';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, 8);
  ctx.lineTo(8, 0);
  ctx.stroke();
  return ctx.createPattern(c, 'repeat') || 'rgba(221, 226, 233, 0.7)';
}

@Component({
  selector: 'app-glucose-chart',
  standalone: true,
  imports: [CommonModule],
  template: `<div class="wrap"><canvas #canvas></canvas></div>`,
  styles: [
    `
      .wrap {
        position: relative;
        width: 100%;
        height: 100%;
        min-height: 180px;
      }
      canvas {
        width: 100% !important;
        height: 100% !important;
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

  private chart?: Chart;

  ngAfterViewInit() {
    this.render();
  }

  ngOnChanges() {
    if (this.canvasRef) this.render();
  }

  private render() {
    const canvas = this.canvasRef?.nativeElement;
    if (!canvas || !this.startMs || !this.endMs) return;

    const slice = this.readings.filter((r) => {
      const t = new Date(r.timestamp).getTime();
      return t >= this.startMs && t <= this.endMs && readingMmol(r) > 0;
    });
    const display = downsampleSgPoints(slice, this.sparkline ? 80 : 800);

    const gaps = detectGaps(
      this.readings,
      new Date(this.startMs),
      new Date(this.endMs)
    ).segments.filter((s) => !s.covered);

    const points = display.map((d) => ({
      x: new Date(d.timestamp).getTime(),
      y: readingMmol(d),
    }));

    const data: ({ x: number; y: number | null })[] = [];
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

    const hatch = hatchPattern();
    const annotations: Record<string, unknown> = {
      band: {
        type: 'box',
        yMin: LOW,
        yMax: HIGH,
        backgroundColor: '#E9F5F3',
        borderWidth: 0,
      },
    };

    for (let i = 0; i < gaps.length; i++) {
      annotations[`gap_${i}`] = {
        type: 'box',
        xMin: gaps[i].from.getTime(),
        xMax: gaps[i].to.getTime(),
        backgroundColor: hatch,
        borderWidth: 0,
        label: {
          display: !this.sparkline,
          content: 'praznina',
          position: 'center',
          color: '#707C91',
          font: { size: 9, family: 'IBM Plex Mono' },
        },
      };
    }

    const maxUnits = Math.max(1, ...this.boluses.map((b) => b.units));
    const bolusData = this.boluses
      .filter((b) => {
        const t = new Date(b.timestamp).getTime();
        return t >= this.startMs && t <= this.endMs;
      })
      .map((b) => ({
        x: new Date(b.timestamp).getTime(),
        y: 2 + (b.units / maxUnits) * 3.5,
      }));

    const datasets: ChartConfiguration['data']['datasets'] = [
      {
        type: 'bar',
        data: bolusData as any,
        backgroundColor: '#3344CC',
        borderRadius: 2,
        barThickness: this.sparkline ? 3 : 5,
        order: 2,
      },
      {
        type: 'line',
        data: data as any,
        borderColor: '#15213B',
        backgroundColor: '#15213B',
        borderWidth: this.sparkline ? 1.9 : 2.1,
        pointRadius: (ctx: { parsed?: { y?: number | null } }) => {
          const y = ctx.parsed?.y;
          if (y == null) return 0;
          if (y < LOW) return 2.1;
          if (y > HIGH) return 1.4;
          return 0;
        },
        pointBackgroundColor: (ctx: { parsed?: { y?: number | null } }) => {
          const y = ctx.parsed?.y;
          if (y == null) return '#15213B';
          if (y < VERY_LOW) return '#9B1B47';
          if (y < LOW) return '#C2255C';
          if (y > HIGH) return 'rgba(199, 124, 30, 0.7)';
          return '#15213B';
        },
        tension: 0.25,
        spanGaps: false,
        parsing: false,
        order: 1,
      },
    ];

    const yMax = this.sparkline ? undefined : 16;

    const cfg: ChartConfiguration = {
      type: 'line',
      data: { datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            enabled: !this.sparkline,
            callbacks: {
              title: (items) => {
                const x = items[0]?.parsed?.x;
                if (x == null) return '';
                return new Date(x).toLocaleString('sr-Latn-RS', {
                  day: '2-digit',
                  month: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit',
                });
              },
              label: (ctx) =>
                ctx.parsed.y != null ? ` ${ctx.parsed.y.toFixed(1)} mmol/L` : '',
            },
          },
          annotation: { annotations: annotations as any },
        },
        scales: {
          x: {
            type: 'linear',
            min: this.startMs,
            max: this.endMs,
            display: !this.sparkline,
            ticks: {
              maxTicksLimit: 6,
              color: '#707C91',
              font: { size: 10, family: 'IBM Plex Mono' },
              callback: (v) =>
                new Date(Number(v)).toLocaleTimeString('sr-Latn-RS', {
                  hour: '2-digit',
                  minute: '2-digit',
                }),
            },
            grid: { color: 'rgba(0,0,0,0.05)' },
          },
          y: {
            min: this.sparkline ? undefined : 2,
            max: yMax,
            display: !this.sparkline,
            ticks: {
              color: '#707C91',
              font: { size: 10, family: 'IBM Plex Mono' },
              callback: (v) => {
                const n = Number(v);
                if (n === LOW || n === HIGH || n === 16) return String(n);
                return '';
              },
            },
            grid: { color: 'rgba(0,0,0,0.06)' },
          },
        },
      },
    };

    if (this.chart) this.chart.destroy();
    this.chart = new Chart(canvas, cfg);
  }
}
