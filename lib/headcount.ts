import * as XLSX from 'xlsx';
import { EmployeeContact } from './types';

const HC_KEY = 'it_assets_headcount';

export function getContacts(): EmployeeContact[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(HC_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export function saveContacts(contacts: EmployeeContact[]): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(HC_KEY, JSON.stringify(contacts));
}

export function clearContacts(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(HC_KEY);
}

/** Returns the email for an employee name (case-insensitive, handles comma/reversed names). */
export function findEmailByName(name: string): string {
  if (!name?.trim()) return '';
  const contacts = getContacts();
  if (contacts.length === 0) return '';

  const normalize = (s: string) =>
    s.toLowerCase().trim().replace(/\s+/g, ' ');

  const needle = normalize(name);

  // 1. Exact match
  const exact = contacts.find((c) => normalize(c.name) === needle);
  if (exact) return exact.email;

  // 2. Match ignoring middle names / extra spaces
  const needleParts = needle.split(' ').filter(Boolean);
  const firstLast   = [needleParts[0], needleParts[needleParts.length - 1]].join(' ');
  const reversed    = [needleParts[needleParts.length - 1], needleParts[0]].join(' ');

  const fuzzy = contacts.find((c) => {
    const cn = normalize(c.name);
    const cnParts = cn.split(' ').filter(Boolean);
    const cnFL    = [cnParts[0], cnParts[cnParts.length - 1]].join(' ');
    return cn === needle || cnFL === firstLast || cnFL === reversed || cn.includes(needle) || needle.includes(cn);
  });
  if (fuzzy) return fuzzy.email;

  return '';
}

export interface HeadcountMergeResult {
  added: number;
  updated: number;
  total: number;
}

/** Parse an Excel/CSV buffer and upsert contacts by employee ID. */
export function parseAndMergeHeadcount(buffer: ArrayBuffer): HeadcountMergeResult {
  const wb = XLSX.read(buffer, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });

  const str = (v: unknown) => String(v ?? '').trim();

  // Flexible column detection
  const findCol = (row: Record<string, unknown>, ...candidates: string[]) => {
    const keys = Object.keys(row).map((k) => k.toLowerCase().trim());
    for (const c of candidates) {
      const idx = keys.indexOf(c.toLowerCase());
      if (idx !== -1) return Object.keys(row)[idx];
    }
    return null;
  };

  const existing = getContacts();
  const byId = new Map<string, EmployeeContact>(existing.map((c) => [c.employeeId.toLowerCase(), c]));
  const byName = new Map<string, EmployeeContact>(existing.map((c) => [c.name.toLowerCase().trim(), c]));

  let added = 0; let updated = 0;

  for (const row of rows) {
    const idCol    = findCol(row, 'employee id', 'emp id', 'employeeid', 'id', 'user id', 'userid');
    const nameCol  = findCol(row, 'name', 'full name', 'employee name', 'requested for', 'display name');
    const emailCol = findCol(row, 'email', 'email address', 'mail', 'e-mail', 'work email');

    if (!nameCol || !emailCol) continue;

    const name  = str(row[nameCol]);
    const email = str(row[emailCol]);
    const empId = idCol ? str(row[idCol]) : name; // fallback to name if no ID col

    if (!name || !email) continue;

    const idKey   = empId.toLowerCase();
    const nameKey = name.toLowerCase();

    if (byId.has(idKey)) {
      const c = byId.get(idKey)!;
      c.name = name; c.email = email;
      updated++;
    } else if (byName.has(nameKey)) {
      const c = byName.get(nameKey)!;
      c.employeeId = empId; c.email = email;
      updated++;
    } else {
      const contact: EmployeeContact = { employeeId: empId, name, email };
      byId.set(idKey, contact);
      byName.set(nameKey, contact);
      added++;
    }
  }

  const merged = Array.from(new Map(
    [...byId.values()].map((c) => [c.name.toLowerCase(), c])
  ).values());

  saveContacts(merged);
  return { added, updated, total: merged.length };
}
