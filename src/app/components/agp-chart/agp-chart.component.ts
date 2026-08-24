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
import { AgpBucket } from '../../analytics/agp';
import { HIGH, LOW } from '../../domain/glucose';
import { placeholderAgpBuckets } from '../../utils/placeholder-data.util';

Chart.register(...registerables, annotationPlugin);

@Component({
  selector: 'app-agp-chart',
  standalone: true,
  imports: [CommonModule],
  template: `<div class="wrap"><canvas #canvas></canvas></div>`,
  styles: [
    `
      .wrap {
        height: 190px;
        width: 100%;
      }
      canvas {
        width: 100% !important;
        height: 100% !important;
      }
    `,
  ],
})
export class AgpChartComponent implements AfterViewInit, OnChanges {
  @ViewChild('canvas') canvasRef?: ElementRef<HTMLCanvasElement>;
  @Input() buckets: AgpBucket[] = [];
  @Input() usePlaceholder = false;

  private chart?: Chart;

  ngAfterViewInit() {
    this.render();
  }

  ngOnChanges() {
    if (this.canvasRef) this.render();
  }

  private displayBuckets(): AgpBucket[] {
    if (this.buckets.length) return this.buckets;
    if (this.usePlaceholder) return placeholderAgpBuckets();
    return [];
  }

  private render() {
    const canvas = this.canvasRef?.nativeElement;
    const data = this.displayBuckets();
    if (!canvas || !data.length) {
      if (this.chart) this.chart.destroy();
      return;
    }

    const median = data.map((b) => ({ x: b.slotMin, y: b.median }));
    const p75 = data.map((b) => ({ x: b.slotMin, y: b.p75 }));
    const p25 = data.map((b) => ({ x: b.slotMin, y: b.p25 }));
    const p90 = data.map((b) => ({ x: b.slotMin, y: b.p90 }));
    const p10 = data.map((b) => ({ x: b.slotMin, y: b.p10 }));

    const hourTicks = [0, 360, 720, 1080, 1440];

    const cfg: ChartConfiguration = {
      type: 'line',
      data: {
        datasets: [
          {
            data: p90 as any,
            borderWidth: 0,
            pointRadius: 0,
            fill: '+1',
            backgroundColor: 'rgba(21, 33, 59, 0.08)',
            parsing: false,
          },
          {
            data: p10 as any,
            borderWidth: 0,
            pointRadius: 0,
            fill: false,
            parsing: false,
          },
          {
            data: p75 as any,
            borderWidth: 0,
            pointRadius: 0,
            fill: '+1',
            backgroundColor: 'rgba(21, 33, 59, 0.15)',
            parsing: false,
          },
          {
            data: p25 as any,
            borderWidth: 0,
            pointRadius: 0,
            fill: false,
            parsing: false,
          },
          {
            data: median as any,
            borderColor: '#15213B',
            borderWidth: 2.2,
            pointRadius: 0,
            tension: 0.35,
            parsing: false,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        plugins: {
          legend: { display: false },
          annotation: {
            annotations: {
              band: {
                type: 'box',
                yMin: LOW,
                yMax: HIGH,
                backgroundColor: '#E9F5F3',
                borderWidth: 0,
              },
            },
          },
        },
        scales: {
          x: {
            type: 'linear',
            min: 0,
            max: 1440,
            afterBuildTicks: (axis) => {
              axis.ticks = hourTicks.map((v) => ({ value: v }));
            },
            ticks: {
              color: '#707C91',
              font: { size: 8.5, family: 'IBM Plex Mono' },
              callback: (v) => {
                const m = Number(v);
                if (!hourTicks.includes(m)) return '';
                return `${String(Math.floor(m / 60)).padStart(2, '0')}`;
              },
            },
            grid: { color: 'rgba(227, 231, 237, 1)', drawTicks: false },
          },
          y: {
            min: 2.5,
            max: 16,
            ticks: {
              color: '#707C91',
              font: { size: 8.5, family: 'IBM Plex Mono' },
              callback: (v) => {
                const n = Number(v);
                if (n === LOW || n === HIGH) return n.toFixed(1);
                if (n === 15 || n === 16) return '15';
                return '';
              },
            },
            grid: {
              color: (ctx) =>
                ctx.tick.value === LOW || ctx.tick.value === HIGH
                  ? 'rgba(227, 231, 237, 1)'
                  : 'transparent',
              drawTicks: false,
            },
          },
        },
      },
    };

    if (this.chart) this.chart.destroy();
    this.chart = new Chart(canvas, cfg);
  }
}
