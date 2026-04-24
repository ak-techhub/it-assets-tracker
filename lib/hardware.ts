import * as XLSX from 'xlsx';
import { HardwareAsset, HardwareStatus, HardwareSubstatus } from './types';

const HW_KEY = 'it_assets_hardware';

// ── Storage ────────────────────────────────────────────────────────────────

export function getHardwareAssets(): HardwareAsset[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(HW_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export function saveHardwareAssets(assets: HardwareAsset[]): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(HW_KEY, JSON.stringify(assets));
}

export function clearHardwareAssets(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(HW_KEY);
}

export function updateHardwareAsset(updated: HardwareAsset): void {
  const all = getHardwareAssets();
  const idx = all.findIndex((a) => a.id === updated.id);
  if (idx !== -1) all[idx] = { ...updated, lastUpdated: new Date().toISOString() };
  else all.push({ ...updated, lastUpdated: new Date().toISOString() });
  saveHardwareAssets(all);
}

// ── Helpers ────────────────────────────────────────────────────────────────

/** Days elapsed since a given ISO date string. */
export function daysSince(isoDate: string): number {
  return Math.floor((Date.now() - new Date(isoDate).getTime()) / 86_400_000);
}

/** Days until a given ISO date (negative = already past). */
export function daysUntil(isoDate: string): number {
  return Math.ceil((new Date(isoDate).getTime() - Date.now()) / 86_400_000);
}

/** Returns assets in legal hold for > 45 days where alert not dismissed. */
export function getBStockAlerts(assets: HardwareAsset[]): HardwareAsset[] {
  return assets.filter(
    (a) =>
      a.status === 'Legal Hold' &&
      a.legalHoldDate &&
      daysSince(a.legalHoldDate) >= 45 &&
      !a.bStockAlertDismissed
  );
}

/** Returns assets with warranty expiring within `days` days (or already expired). */
export function getWarningAssets(assets: HardwareAsset[], days = 60): HardwareAsset[] {
  return assets.filter(
    (a) => a.status === 'Active' && daysUntil(a.warrantyExpiry) <= days
  );
}

// ── Excel parsing ──────────────────────────────────────────────────────────

export interface HardwareImportResult {
  added: number;
  updated: number;
  total: number;
  skipped: number;
}

function str(v: unknown): string {
  return String(v ?? '').trim();
}

function parseDate(v: unknown): string {
  if (!v) return '';
  // Excel serial number
  if (typeof v === 'number') {
    const d = XLSX.SSF.parse_date_code(v);
    if (d) return new Date(d.y, d.m - 1, d.d).toISOString().split('T')[0];
  }
  const s = String(v).trim();
  if (!s) return '';
  // Try direct parse
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
  // dd/mm/yyyy
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (m) {
    const year = m[3].length === 2 ? '20' + m[3] : m[3];
    return new Date(`${year}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`).toISOString().split('T')[0];
  }
  return s;
}

function findCol(row: Record<string, unknown>, ...candidates: string[]): string | null {
  const keys = Object.keys(row);
  const lower = keys.map((k) => k.toLowerCase().replace(/[\s_\-\.]/g, ''));
  for (const c of candidates) {
    const needle = c.toLowerCase().replace(/[\s_\-\.]/g, '');
    const idx = lower.indexOf(needle);
    if (idx !== -1) return keys[idx];
  }
  return null;
}

export function parseAndMergeHardware(buffer: ArrayBuffer): HardwareImportResult {
  const wb = XLSX.read(buffer, { type: 'array', cellDates: false });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });

  const existing = getHardwareAssets();
  const bySerial = new Map<string, HardwareAsset>(
    existing.map((a) => [a.serialNo.toLowerCase(), a])
  );

  let added = 0, updated = 0, skipped = 0;

  for (const row of rows) {
    // Exact ServiceNow column names take first priority, then common aliases
    const nameCol     = findCol(row,
      'assigned_to', 'assigned to',
      'user name', 'username', 'name', 'employee name', 'display name');
    const emailCol    = findCol(row,
      'assigned_to.email', 'assignedtoemail',
      'email', 'mail id', 'mailid', 'email address', 'mail');
    const modelCol    = findCol(row,
      'display_name', 'model_category', 'modelcategory',
      'laptop model', 'model', 'device model', 'asset model');
    const serialCol   = findCol(row,
      'serial_number', 'serialnumber',
      'serial no', 'serial', 'asset tag', 'serialno');
    const warrantyCol = findCol(row,
      'warranty_expiration', 'warrantyexpiration',
      'warranty expiry', 'warranty expiry date', 'warranty date', 'expiry date', 'warranty');
    const substatusCol= findCol(row,
      'substatus', 'sub_status', 'sub status', 'asset type', 'type');
    const locationCol = findCol(row,
      'location', 'office location', 'site');
    const assignedCol = findCol(row,
      'assigned', 'assigned_date', 'assigned date', 'assignment date',
      'date of assigning', 'date assigned');
    const installCol  = findCol(row,
      'install_status', 'installstatus', 'install status', 'status');

    if (!nameCol || !serialCol) { skipped++; continue; }

    const userName     = str(row[nameCol]);
    const serialNo     = str(row[serialCol]);
    if (!userName || !serialNo) { skipped++; continue; }

    const email          = emailCol    ? str(row[emailCol])           : '';
    // Prefer model_category for model; fall back to display_name if it looks like a model
    const displayName    = modelCol    ? str(row[modelCol])           : '';
    const laptopModel    = displayName;
    const warrantyExpiry = warrantyCol ? parseDate(row[warrantyCol])  : '';
    const location       = locationCol ? str(row[locationCol])        : '';
    const assignedDate   = assignedCol ? parseDate(row[assignedCol])  : '';

    const rawSub = substatusCol ? str(row[substatusCol]).toLowerCase() : '';
    const substatus: HardwareSubstatus =
      rawSub.includes('secondary') ? 'Secondary' : 'Primary';

    // Map install_status to HardwareStatus
    const rawInstall = installCol ? str(row[installCol]).toLowerCase() : '';
    let importedStatus: import('./types').HardwareStatus = 'Active';
    if (rawInstall.includes('retired') || rawInstall.includes('decommission')) importedStatus = 'Decommissioned';
    else if (rawInstall.includes('stock') || rawInstall.includes('b stock'))   importedStatus = 'B Stock';
    else if (rawInstall.includes('hold'))                                       importedStatus = 'Legal Hold';
    else if (rawInstall.includes('refresh'))                                    importedStatus = 'Refresh Pending';

    const key = serialNo.toLowerCase();
    if (bySerial.has(key)) {
      const asset = bySerial.get(key)!;
      // Refresh importable fields but keep manual workflow status unless Excel says decommissioned
      asset.userName     = userName;
      asset.email        = email || asset.email;
      asset.laptopModel  = laptopModel || asset.laptopModel;
      asset.warrantyExpiry = warrantyExpiry || asset.warrantyExpiry;
      asset.substatus    = substatus;
      asset.location     = location || asset.location;
      asset.assignedDate = assignedDate || asset.assignedDate;
      // Only override status if Excel explicitly marks it as decommissioned/retired
      if (importedStatus === 'Decommissioned') asset.status = 'Decommissioned';
      asset.lastUpdated  = new Date().toISOString();
      updated++;
    } else {
      const asset: HardwareAsset = {
        id: `hw_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        userName, email, laptopModel, serialNo,
        warrantyExpiry, substatus, location, assignedDate,
        status: importedStatus,
        importedAt:  new Date().toISOString(),
        lastUpdated: new Date().toISOString(),
      };
      bySerial.set(key, asset);
      added++;
    }
  }

  const merged = Array.from(bySerial.values());
  saveHardwareAssets(merged);
  return { added, updated, total: merged.length, skipped };
}
