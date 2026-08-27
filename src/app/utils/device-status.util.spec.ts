import { deviceStatusFromPatientData } from './device-status.util';

describe('deviceStatusFromPatientData', () => {
  const now = Date.parse('2026-08-27T09:00:00');

  it('maps pump battery, reservoir, sensor connection, life, and calibration', () => {
    const s = deviceStatusFromPatientData(
      {
        pumpBatteryLevelPercent: 72,
        reservoirRemainingUnits: 118.4,
        conduitSensorInRange: true,
        gstBatteryLevel: 81,
        sensorDurationMinutes: 4 * 1440 + 12 * 60 + 18,
        timeToNextCalibrationMinutes: 90,
      },
      now
    );
    expect(s.pump.find((r) => r.key === 'battery')?.value).toBe('72%');
    expect(s.pump.find((r) => r.key === 'reservoir')?.value).toBe('118 u');
    expect(s.sensor.find((r) => r.key === 'connected')?.value).toBe('Connected');
    expect(s.sensor.find((r) => r.key === 'connected')?.chip).toBe('ok');
    expect(s.sensor.find((r) => r.key === 'battery')?.value).toBe('81%');
    expect(s.sensor.find((r) => r.key === 'life')?.value).toBe('4d 12:18');
    expect(s.sensor.find((r) => r.key === 'calib')?.value).toBe('10:30');
    expect(s.sensor.find((r) => r.key === 'calib')?.detail).toBe('In 01:30');
  });

  it('warns when disconnected, low battery, low reservoir, or last day of wear', () => {
    const s = deviceStatusFromPatientData(
      {
        pumpBatteryLevelPercent: 12,
        reservoirRemainingUnits: 8,
        conduitSensorInRange: false,
        gstBatteryLevel: 15,
        sensorDurationMinutes: 200,
        timeToNextCalibrationMinutes: 0,
      },
      now
    );
    expect(s.pump.find((r) => r.key === 'battery')?.warn).toBeTrue();
    expect(s.pump.find((r) => r.key === 'reservoir')?.warn).toBeTrue();
    expect(s.sensor.find((r) => r.key === 'connected')?.value).toBe(
      'Not connected'
    );
    expect(s.sensor.find((r) => r.key === 'connected')?.chip).toBe('warn');
    expect(s.sensor.find((r) => r.key === 'battery')?.warn).toBeTrue();
    expect(s.sensor.find((r) => r.key === 'life')?.warn).toBeTrue();
    expect(s.sensor.find((r) => r.key === 'calib')?.value).toBe('Due now');
  });

  it('uses dashes when CareLink omitted the fields', () => {
    const s = deviceStatusFromPatientData({}, now);
    expect(s.pump.every((r) => r.value === '--' || r.key === 'x')).toBeTrue();
    expect(s.sensor.find((r) => r.key === 'connected')?.value).toBe(
      'Not connected'
    );
    expect(s.sensor.find((r) => r.key === 'battery')?.value).toBe('--');
    expect(s.sensor.find((r) => r.key === 'life')?.value).toBe('--');
    expect(s.sensor.find((r) => r.key === 'calib')?.value).toBe('--');
  });
});
