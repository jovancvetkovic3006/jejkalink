export { detectGaps, formatCoverageCaptionEn, formatCoverageCaptionSr } from './coverage';
export type { CoverageSegment, CoverageResult } from './coverage';
export { collectorPollCoverage } from './collector-coverage';
export type { PollEvent } from './collector-coverage';
export { alignTrendPeriod } from './period-align';
export type { WeekStart } from './period-align';
export { isUnusualDay } from './unusual-day';
export { periodMetrics } from './metrics';
export type { PeriodMetrics, MetricTargets } from './metrics';
export { buildWeeklyRead } from './weekly-read';
export type { WeeklyReadCopy } from './weekly-read';
export { detectTrendPatterns, formatTrendPattern } from './trend-patterns';
export type { TrendPattern } from './trend-patterns';
export { agpBuckets } from './agp';
export type { AgpBucket } from './agp';
export {
  detectHypoEpisodes,
  detectVeryLowEpisodes,
  postMealRises,
  summarizePostMealRises,
  formatHypoEpisode,
} from './episodes';
export type { HypoEpisode, PostMealRise, BolusAnchor } from './episodes';
export { splitByDayType, hourlyTirBySlot } from './day-split';
export type { DaySplitMetrics, HourlyTir } from './day-split';
