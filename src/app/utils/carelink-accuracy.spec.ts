import {
  CARELINK_SERVER_SKEW_MS,
  applyCarelinkOffset,
  carelinkOffsetMin,
  carelinkTsMs,
  carelinkWallClock,
  filterAcceptedSgs,
  isUnreliablePumpClock,
  latestAcceptedSg,
  offsetMinFromClockAndServer,
  serverCutoffMs,
} from './carelink-time.util';
import {
  eventsFromCareLinkMarkers,
  insulinAmountFromMarker,
} from './carelink-markers.util';
import {
  carelinkAlertLabel,
  eventsFromCareLinkAlerts,
} from './carelink-alerts.util';
import {
  mapCareLinkTrend,
  slopePerMinWindow,
  trendFromSlope,
} from './glucose-slope.util';
import { SgReading } from '../services/sgs-history.service';

describe('carelink-time', () => {
  // Naive ISO timestamps are parsed as local — build cutoff from the same clock.
  const at1650 = new Date('2026-08-25T16:50:00').getTime();

  it('accepts SG at server time and rejects post-server points', () => {
    const cutoff = at1650 + CARELINK_SERVER_SKEW_MS;
    const sgs = [
      { sg: 130, timestamp: '2026-08-25T16:50:00' },
      { sg: 121, timestamp: '2026-08-25T16:55:00' },
      { sg: 78, timestamp: '2026-08-25T17:45:00' },
      { sg: 0, timestamp: '2026-08-25T16:40:00' },
    ];
    const accepted = filterAcceptedSgs(sgs, cutoff);
    expect(accepted.map((s) => s.timestamp)).toEqual(['2026-08-25T16:50:00']);
  });

  it('latestAcceptedSg prefers real last over future lastSG', () => {
    const cutoff = serverCutoffMs({ currentServerTime: at1650 });
    const lastSG = { sg: 78, timestamp: '2026-08-25T17:45:00' };
    const sgs = [
      { sg: 140, timestamp: '2026-08-25T16:45:00' },
      { sg: 130, timestamp: '2026-08-25T16:50:00' },
      { sg: 78, timestamp: '2026-08-25T17:45:00' },
    ];
    const best = latestAcceptedSg(sgs, cutoff, lastSG);
    expect(best?.sg).toBe(130);
    expect(best?.timestamp).toBe('2026-08-25T16:50:00');
  });
});

describe('carelink conduit offset', () => {
  const serverMs = Date.parse('2026-08-25T19:20:00.000Z');

  it('infers CET (+01) from conduit clock vs server epoch', () => {
    expect(
      offsetMinFromClockAndServer('2026-08-25T20:20:00', serverMs)
    ).toBe(60);
    expect(
      carelinkOffsetMin({
        lastConduitDateTime: '2026-08-25T20:20:00',
        lastConduitUpdateServerDateTime: serverMs,
      })
    ).toBe(60);
  });

  it('infers CEST (+02) when conduit digits are summer time', () => {
    expect(
      offsetMinFromClockAndServer('2026-08-25T21:20:00.000+02:00', serverMs)
    ).toBe(120);
  });

  it('stamps naive SG so the instant matches server, not the phone TZ', () => {
    const offset = 60;
    const stamped = applyCarelinkOffset('2026-08-25T20:15:00', offset);
    expect(stamped).toBe('2026-08-25T20:15:00+01:00');
    expect(carelinkTsMs(stamped)).toBe(Date.parse('2026-08-25T19:15:00.000Z'));
    expect(serverMs - carelinkTsMs(stamped)).toBe(5 * 60 * 1000);
  });

  it('replaces a lying Z suffix with the conduit offset', () => {
    expect(applyCarelinkOffset('2026-08-25T20:15:00.000Z', 60)).toBe(
      '2026-08-25T20:15:00.000+01:00'
    );
    expect(carelinkWallClock('2026-08-25T20:15:00+01:00')).toBe(
      '2026-08-25T20:15:00'
    );
  });

  it('does not take offset from a phantom future lastSG', () => {
    expect(
      carelinkOffsetMin({
        lastConduitDateTime: '2026-08-25T20:20:00',
        lastConduitUpdateServerDateTime: serverMs,
        lastSG: { timestamp: '2026-08-25T21:15:00' },
      } as any)
    ).toBe(60);
  });
});

describe('carelink-markers', () => {
  it('extracts INSULIN deliveredFastAmount boluses', () => {
    const events = eventsFromCareLinkMarkers([
      {
        type: 'INSULIN',
        timestamp: '2026-08-25T09:03:02',
        data: {
          dataValues: {
            deliveredFastAmount: '5.3',
            programmedFastAmount: '5.3',
            bolusType: 'FAST',
          },
        },
      },
      {
        type: 'LOW_GLUCOSE_SUSPENDED',
        timestamp: '2026-08-25T04:29:38',
        data: { dataValues: {} },
      },
      {
        type: 'CALIBRATION',
        timestamp: '2026-08-25T12:54:58',
        data: {
          dataValues: {
            unitValue: '166',
            bgUnits: 'MMOL_L',
            calibrationSuccess: true,
            calibrationType: 'CALIBRATION_COMPLETE',
          },
        },
      },
    ]);
    const bolus = events.find((e) => e.kind === 'bolus');
    expect(bolus?.units).toBe(5.3);
    expect(bolus?.id).toBe('insulin-2026-08-25T09:03:02');
    expect(events.some((e) => e.id.startsWith('lgs-'))).toBe(true);
    const cal = events.find((e) => e.id.startsWith('cal-'));
    expect(cal?.label).toBe('Calibration accepted');
    expect(cal?.detail).toContain('mmol/L');
  });

  it('adds fast + extended insulin amounts', () => {
    expect(
      insulinAmountFromMarker({
        type: 'INSULIN',
        data: {
          dataValues: {
            deliveredFastAmount: 3.15,
            deliveredExtendedAmount: 1.85,
          },
        },
      })
    ).toBe(5);
  });

  it('pairs MEAL carbs onto INSULIN with the same index', () => {
    const events = eventsFromCareLinkMarkers([
      {
        type: 'MEAL',
        index: 4,
        timestamp: '2026-08-25T12:00:00',
        amount: 40,
      },
      {
        type: 'INSULIN',
        index: 4,
        timestamp: '2026-08-25T12:00:02',
        data: { dataValues: { deliveredFastAmount: 4.5 } },
      },
    ]);
    expect(events.filter((e) => e.kind === 'meal').length).toBe(0);
    expect(events.length).toBe(1);
    expect(events[0].kind).toBe('bolus');
    expect(events[0].units).toBe(4.5);
    expect(events[0].detail).toContain('40 g carbs');
  });

  it('maps BG_READING finger sticks in mmol/L', () => {
    const events = eventsFromCareLinkMarkers([
      {
        type: 'BG_READING',
        displayTime: '2026-08-25T08:10:00',
        data: { dataValues: { unitValue: '108' } },
      },
    ]);
    expect(events.length).toBe(1);
    expect(events[0].id).toBe('bg-2026-08-25T08:10:00');
    expect(events[0].label).toContain('Finger BG');
    expect(events[0].label).toContain('mmol/L');
  });
});

describe('carelink-alerts', () => {
  it('maps NGP 809 to suspend on low', () => {
    expect(
      carelinkAlertLabel({ deviceFamily: 'NGP', faultId: '809' })
    ).toBe('Suspend on low. Delivery stopped');
    const events = eventsFromCareLinkAlerts({
      medicalDeviceFamily: 'NGP',
      lastAlarm: {
        code: '809',
        datetime: '2026-08-25T03:12:00',
      },
    });
    expect(events[0]?.label).toBe('Suspend on low. Delivery stopped');
    expect(events[0]?.kind).toBe('alarm');
  });
});

describe('unreliable pump clock', () => {
  it('skips NGP/CC snapshots when the pump is unreachable', () => {
    expect(
      isUnreliablePumpClock({
        medicalDeviceFamily: 'NGP',
        pumpCommunicationState: false,
      })
    ).toBe(true);
    expect(
      isUnreliablePumpClock({
        medicalDeviceFamily: 'CC',
        pumpCommunicationState: false,
      })
    ).toBe(true);
    expect(
      isUnreliablePumpClock({
        medicalDeviceFamily: 'NGP',
        pumpCommunicationState: true,
      })
    ).toBe(false);
    expect(
      isUnreliablePumpClock({
        medicalDeviceFamily: 'GUARDIAN',
        pumpCommunicationState: false,
      })
    ).toBe(false);
  });
});

describe('glucose-slope trend fallback', () => {
  it('maps NONE to slope-based down trend', () => {
    expect(mapCareLinkTrend('NONE')).toBeNull();
    expect(mapCareLinkTrend('DOWN')).toBe(-1);
    const readings: SgReading[] = [
      { mmol: 9.3, timestamp: '2026-08-25T16:25:00' },
      { mmol: 9.3, timestamp: '2026-08-25T16:30:00' },
      { mmol: 9.1, timestamp: '2026-08-25T16:35:00' },
      { mmol: 8.5, timestamp: '2026-08-25T16:40:00' },
      { mmol: 7.8, timestamp: '2026-08-25T16:45:00' },
      { mmol: 7.2, timestamp: '2026-08-25T16:50:00' },
    ];
    const slope = slopePerMinWindow(readings, 15);
    expect(slope).not.toBeNull();
    expect(slope!).toBeLessThan(0);
    expect(trendFromSlope(slope)).toBe(-1);
  });
});
