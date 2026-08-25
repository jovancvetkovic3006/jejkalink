import { carelinkWallClock } from './carelink-time.util';

export type CareLinkAlertEvent = {
  id: string;
  kind: 'alarm' | 'sensor' | 'other';
  timestamp: string;
  label: string;
  detail?: string;
};

/** xDrip NGP TextMap — pump/sensor notification copy, historical only. */
const NGP_TEXT: Record<string, string> = {
  '002': 'Pump error. Delivery stopped',
  '006': 'Pump battery out limit',
  '007': 'Delivery stopped. Check BG',
  '011': 'Replace pump battery now',
  '012': 'Auto suspend limit reached. Delivery stopped',
  '024': 'Critical pump error. Stop pump use',
  '025': 'Pump power error. Record settings',
  '029': 'Pump restarted. Delivery stopped',
  '037': 'Pump motor error. Delivery stopped',
  '051': 'Bolus stopped',
  '052': 'Delivery limit exceeded. Check BG',
  '057': 'Pump battery not compatible',
  '058': 'Insert a new AA battery',
  '061': 'Pump button error. Delivery stopped',
  '062': 'New notification from pump',
  '066': 'No reservoir detected',
  '069': 'Loading incomplete',
  '073': 'Replace pump battery now',
  '077': 'Pump settings error. Delivery stopped',
  '084': 'Pump battery removed. Replace battery',
  '100': 'Bolus entry timed out',
  '103': 'BG check reminder',
  '104': 'Replace pump battery soon',
  '105': 'Reservoir low. Change reservoir soon',
  '107': 'Missed meal bolus reminder',
  '109': 'Set change reminder',
  '110': 'Silenced sensor alert',
  '113': 'Reservoir empty. Change reservoir now',
  '117': 'Active insulin cleared',
  '130': 'Rewind required. Delivery stopped',
  '140': 'Delivery suspended. Connect infusion set',
  '775': 'Calibrate now',
  '776': 'Calibration error',
  '777': 'Change sensor',
  '779': 'Recharge transmitter now',
  '780': 'Lost sensor signal',
  '784': 'SG rising rapidly',
  '794': 'Sensor expired. Change sensor',
  '795': 'Lost sensor signal. Check transmitter',
  '796': 'No sensor signal',
  '797': 'Sensor connected',
  '801': 'Do not calibrate. Wait up to 3 hours',
  '802': 'Low sensor glucose',
  '803': 'Low sensor glucose. Check BG',
  '805': 'Alert before low. Check BG',
  '807': 'Basal delivery resumed. Check BG',
  '809': 'Suspend on low. Delivery stopped',
  '810': 'Suspend before low. Delivery stopped',
  '812': 'Call emergency assistance',
  '814': 'Basal resumed. SG still under low limit',
  '815': 'Low limit changed. Basal manually resumed',
  '816': 'High sensor glucose',
  '817': 'Alert before high. Check BG',
  '819': 'Auto mode exit. Basal started. BG required',
  '821': 'Minimum delivery timeout. BG required',
  '822': 'Maximum delivery timeout. BG required',
  '823': 'High sensor glucose for over 1 hour',
  '827': 'Urgent low sensor glucose. Check BG',
  '829': 'BG required',
  '832': 'Calibration required',
  '833': 'Correction bolus recommended',
  '869': 'Calibration reminder',
  '870': 'Recharge transmitter soon',
};

const NGP_ALIAS: Record<string, string> = {
  '003': '002',
  '004': '002',
  '008': '007',
  '073': '011',
  '106': '105',
  '778': '777',
  '781': '780',
  '798': '797',
  '803': '803',
  '808': '807',
  '811': '810',
  '820': '819',
  '824': '823',
  '830': '829',
  '831': '829',
};

const GM_TEXT: Record<string, string> = {
  'alert.sg.threshold.low.urgent': 'Urgent low sensor glucose',
  'alert.sg.threshold.low': 'Low sensor glucose',
  'alert.sg.predictive.low': 'Low predicted',
  'alert.sg.rate.falling': 'Fall alert',
  'alert.sg.threshold.high': 'High sensor glucose',
  'alert.sg.predictive.high': 'High predicted',
  'alert.sg.rate.rising': 'Rise alert',
  'alert.transmitter.battery': 'Transmitter battery empty',
  'alert.sensor.replace.lifetime': 'Sensor end of life',
  'alert.transmitter.signal': 'Lost sensor communication',
  'alert.sensor.connection': 'Sensor connected',
  'alert.sensor.calibration.rejected': 'Calibration not accepted',
  'alert.sensor.calibration.calibrate_now': 'Calibrate now',
  'alert.sensor.error': 'Sensor glucose not available',
  'alert.calibration.reminder': 'Calibration reminder',
};

function padCode(raw: string): string {
  if (/^\d+$/.test(raw)) return raw.padStart(3, '0');
  return raw.replace(/^N/i, '');
}

export function carelinkAlertLabel(opts: {
  deviceFamily?: string | null;
  messageId?: string | null;
  faultId?: string | null;
  kind?: string | null;
  code?: string | null;
}): string | null {
  const fam = String(opts.deviceFamily || '').toUpperCase();
  const guardian =
    fam === 'GUARDIAN' ||
    String(opts.messageId || opts.kind || '').startsWith('alert.');
  if (guardian) {
    const key = String(opts.messageId || opts.kind || '')
      .replace(/^GM_/i, '')
      .replace(/^Nalert\./, 'alert.');
    return GM_TEXT[key] || null;
  }
  const raw = String(opts.faultId || opts.code || opts.messageId || '');
  if (!raw) return null;
  const code = padCode(raw);
  const mapped = NGP_ALIAS[code] || code;
  return NGP_TEXT[mapped] || NGP_TEXT[code] || null;
}

function alertKind(label: string): CareLinkAlertEvent['kind'] {
  const l = label.toLowerCase();
  if (
    l.includes('sensor') ||
    l.includes('calibrat') ||
    l.includes('transmitter') ||
    l.includes('sg ')
  ) {
    return 'sensor';
  }
  if (
    l.includes('suspend') ||
    l.includes('low') ||
    l.includes('urgent') ||
    l.includes('delivery stopped') ||
    l.includes('emergency')
  ) {
    return 'alarm';
  }
  return 'other';
}

function pickTs(...vals: unknown[]): string | null {
  for (const v of vals) {
    if (typeof v === 'string' && v) return v;
    if (typeof v === 'number' && v > 1e11) return new Date(v).toISOString();
  }
  return null;
}

function stampEvent(
  ts: string,
  label: string,
  code: string,
  detail: string
): CareLinkAlertEvent {
  const tsId = carelinkWallClock(ts);
  return {
    id: `alert-${code}-${tsId}`,
    kind: alertKind(label),
    timestamp: ts,
    label,
    detail,
  };
}

/** lastAlarm + notificationHistory → events (xDrip follower parity). */
export function eventsFromCareLinkAlerts(patientData: any): CareLinkAlertEvent[] {
  if (!patientData) return [];
  const family = patientData.medicalDeviceFamily;
  const out: CareLinkAlertEvent[] = [];
  const seen = new Set<string>();

  const push = (ev: CareLinkAlertEvent | null) => {
    if (!ev) return;
    if (seen.has(ev.id)) return;
    seen.add(ev.id);
    out.push(ev);
  };

  const last = patientData.lastAlarm;
  if (last && (last.code || last.kind || last.messageId || last.faultId)) {
    const label = carelinkAlertLabel({
      deviceFamily: family,
      messageId: last.messageId || last.kind,
      faultId: last.faultId || last.code,
      kind: last.kind,
      code: last.code,
    });
    const ts = pickTs(
      last.datetime,
      last.dateTime,
      last.timestamp,
      last.datetimeAsDate
    );
    if (label && ts) {
      push(
        stampEvent(
          ts,
          label,
          padCode(String(last.faultId || last.code || last.kind || 'alarm')),
          'Pump notification'
        )
      );
    }
  }

  const hist = patientData.notificationHistory || {};
  const addNotes = (rows: any[] | undefined, cleared: boolean) => {
    if (!rows?.length) return;
    for (const n of rows) {
      if (!n) continue;
      const label = carelinkAlertLabel({
        deviceFamily: family,
        messageId: n.messageId || n.kind,
        faultId: n.faultId || n.code,
        kind: n.kind,
        code: n.code,
      });
      const ts = pickTs(
        n.triggeredDateTime,
        n.dateTime,
        n.datetime,
        n.timestamp
      );
      if (!label || !ts) continue;
      push(
        stampEvent(
          ts,
          label,
          padCode(String(n.faultId || n.code || n.messageId || 'note')),
          cleared ? 'Cleared pump notification' : 'Pump notification'
        )
      );
    }
  };
  addNotes(hist.activeNotifications, false);
  addNotes(hist.clearedNotifications, true);

  return out;
}
