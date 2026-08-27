import { formatMinutesLong, formatRemainingLife } from './duration-format.util';

export interface DeviceStatusRow {
  key: string;
  label: string;
  detail: string;
  value: string;
  warn: boolean;
  chip?: 'ok' | 'warn';
}

export interface DeviceStatus {
  pump: DeviceStatusRow[];
  sensor: DeviceStatusRow[];
}

export const EMPTY_DEVICE_STATUS: DeviceStatus = {
  pump: [
    row('battery', 'Battery', 'Insulin pump', '--', false),
    row('reservoir', 'Reservoir', 'Insulin remaining', '--', false),
  ],
  sensor: [
    row('connected', 'Connection', 'Guardian transmitter', '--', false),
    row('battery', 'Battery', 'Transmitter', '--', false),
    row('life', 'Life left', 'Wear remaining', '--', false),
    row('calib', 'Next calibration', 'Fingerstick due', '--', false),
  ],
};

function row(
  key: string,
  label: string,
  detail: string,
  value: string,
  warn: boolean,
  chip?: 'ok' | 'warn'
): DeviceStatusRow {
  return { key, label, detail, value, warn, ...(chip ? { chip } : {}) };
}

function num(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function pct(v: number | null): string {
  if (v == null || v < 0) return '--';
  return `${Math.round(v)}%`;
}

function clockHm(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** CareLink reports remaining wear, not elapsed (same as the native poll alerts). */
function remainingSensorMinutes(patientData: Record<string, unknown>): number | null {
  const minutes = num(patientData['sensorDurationMinutes']);
  if (minutes != null && minutes >= 0) return minutes;
  const hours = num(patientData['sensorDurationHours']);
  if (hours != null && hours >= 0) return Math.round(hours * 60);
  return null;
}

function calibrationMinutes(patientData: Record<string, unknown>): number | null {
  const minutes = num(patientData['timeToNextCalibrationMinutes']);
  if (minutes != null && minutes >= 0) return minutes;
  const hours = num(patientData['timeToNextCalibHours']);
  if (hours != null && hours >= 0) return Math.round(hours * 60);
  return null;
}

export function deviceStatusFromPatientData(
  patientData: unknown,
  nowMs = Date.now()
): DeviceStatus {
  if (!patientData || typeof patientData !== 'object') {
    return EMPTY_DEVICE_STATUS;
  }
  const pd = patientData as Record<string, unknown>;

  const pumpBattery =
    num(pd['pumpBatteryLevelPercent']) ?? num(pd['pumpBatteryLevel']);
  const reservoir = num(pd['reservoirRemainingUnits']);
  const connected = !!pd['conduitSensorInRange'];
  const sensorBattery = num(pd['gstBatteryLevel']);
  const lifeMin = remainingSensorMinutes(pd);
  const calMin = calibrationMinutes(pd);

  const reservoirWarn = reservoir != null && reservoir >= 0 && reservoir < 20;
  const pumpBatWarn = pumpBattery != null && pumpBattery >= 0 && pumpBattery < 20;
  const sensorBatWarn =
    sensorBattery != null && sensorBattery >= 0 && sensorBattery < 20;
  const lifeWarn = lifeMin != null && lifeMin < 1440;

  let lifeValue = '--';
  if (lifeMin != null) {
    lifeValue = lifeMin <= 0 ? 'Expired' : formatRemainingLife(lifeMin);
  }

  let calibValue = '--';
  let calibDetail = 'Fingerstick due';
  let calibWarn = false;
  if (calMin != null) {
    if (calMin === 0) {
      calibValue = 'Due now';
      calibWarn = true;
    } else {
      calibValue = clockHm(nowMs + calMin * 60_000);
      calibDetail = `In ${formatMinutesLong(calMin)}`;
      calibWarn = calMin < 10;
    }
  }

  return {
    pump: [
      row(
        'battery',
        'Battery',
        'Insulin pump',
        pct(pumpBattery),
        pumpBatWarn
      ),
      row(
        'reservoir',
        'Reservoir',
        'Insulin remaining',
        reservoir != null && reservoir >= 0 ? `${Math.round(reservoir)} u` : '--',
        reservoirWarn
      ),
    ],
    sensor: [
      row(
        'connected',
        'Connection',
        'Guardian transmitter',
        connected ? 'Connected' : 'Not connected',
        !connected,
        connected ? 'ok' : 'warn'
      ),
      row(
        'battery',
        'Battery',
        'Transmitter',
        pct(sensorBattery),
        sensorBatWarn
      ),
      row(
        'life',
        'Life left',
        'Wear remaining',
        lifeValue,
        lifeWarn || lifeMin === 0
      ),
      row('calib', 'Next calibration', calibDetail, calibValue, calibWarn),
    ],
  };
}
