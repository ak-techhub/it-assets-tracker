import * as XLSX from 'xlsx';
import { AccessoryRequest, AccessoryItem, ApprovalState, DeliveryMethod } from './types';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function generateId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function excelSerialToISO(value: unknown): string {
  if (typeof value === 'number') {
    const date = XLSX.SSF.parse_date_code(value);
    if (date) {
      const y = date.y;
      const m = String(date.m).padStart(2, '0');
      const d = String(date.d).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
  }
  if (typeof value === 'string' && value.trim()) return value.trim();
  return new Date().toISOString().slice(0, 10);
}

function parseApproval(raw: string): ApprovalState {
  const val = (raw || '').toLowerCase().trim();
  if (val === 'approved') return 'Approved';
  if (val === 'rejected') return 'Rejected';
  if (val === 'not approved' || val === 'not yet requested') return 'Not Approved';
  // 'requested', empty, or anything else → Pending
  return 'Pending';
}

function parseDeliveryFromDescription(description: string): { method: DeliveryMethod; address: string } {
  const desc = description || '';
  const deliveryMatch = desc.match(/Delivery Information\s*:\s*([\s\S]*?)(?:Special instructions|$)/i);
  const deliveryBlock = deliveryMatch ? deliveryMatch[1].trim() : '';
  const hasHomeAddress =
    /Phone number|Plot no|Street|Road|Layout|Nagar|Colony|Sector|Ship to house/i.test(deliveryBlock) ||
    /#\d+/.test(deliveryBlock);
  const method: DeliveryMethod = hasHomeAddress ? 'ship_home' : 'pickup';
  return { method, address: deliveryBlock };
}

/** Convert "MM/DD/YYYY" → "YYYY-MM-DD" */
function usDateToISO(dateStr: string): string {
  const m = dateStr.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[1]}-${m[2]}`;
  return new Date().toISOString().slice(0, 10);
}

/**
 * Analyse "Comments and Work notes" to detect if an item was already
 * collected or shipped. Returns the result or null if no match.
 *
 * COLLECTED (past tense — action done):
 *   "collected from/frm office/IT", "user collected …", "Collected from IT Room"
 *
 * SHIPPED:
 *   "shipment initiated …", "initiated shipment", "shipped frm/from office/vendor",
 *   "shipment initiate frm/from …", "initiate shipment thru/from …"
 */
function parseStatusFromComments(comments: string): {
  status: 'collected' | 'shipped';
  collectionMethod: 'collect' | 'ship';
  collectedDate: string;
} | null {
  if (!comments?.trim()) return null;

  // Split into individual entries by timestamp "MM/DD/YYYY HH:MM:SS"
  const entries = comments
    .split(/(?=\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2}:\d{2})/)
    .map((e) => e.trim())
    .filter(Boolean);

  for (const entry of entries) {
    const dateMatch = entry.match(/^(\d{2}\/\d{2}\/\d{4})/);
    const entryDate = dateMatch ? usDateToISO(dateMatch[1]) : new Date().toISOString().slice(0, 10);

    // COLLECTED — past tense only (exclude invitations like "please collect", "can collect")
    if (
      /\bcollected\s+(fr[mo]m?)\s+(office|it\b)/i.test(entry) ||
      /\buser\s+collected\b/i.test(entry) ||
      /\bcollected\s+from\s+it\s+room/i.test(entry)
    ) {
      return { status: 'collected', collectionMethod: 'collect', collectedDate: entryDate };
    }

    // SHIPPED
    if (
      /shipment\s+initiat/i.test(entry) ||
      /initiat\w*\s+shipment/i.test(entry) ||
      /\bshipped\s+(fr[mo]m?)\s+(office|vendor)/i.test(entry) ||
      /shipment\s+initiate\s+(fr[mo]m?)/i.test(entry)
    ) {
      return { status: 'shipped', collectionMethod: 'ship', collectedDate: entryDate };
    }
  }
  return null;
}

/**
 * Parse the ServiceNow sc_req_item Excel export.
 * Each row = one RITM (one accessory item).
 * Rows are grouped by "Requested for" so all items for one person appear together.
 */
export function parseExcelToRequests(buffer: ArrayBuffer): AccessoryRequest[] {
  const wb = XLSX.read(buffer, { type: 'array', cellDates: false });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });

  const map = new Map<string, AccessoryRequest>();

  for (const row of rows) {
    const employeeName = String(row['Requested for'] ?? '').trim();
    if (!employeeName) continue;

    const ritm        = String(row['Number'] ?? '').trim();
    const reqNumber   = String(row['Request'] ?? '').trim();
    const itemName    = String(row['Item'] ?? '').trim();
    const qty         = Math.max(1, Number(row['Quantity'] ?? 1) || 1);
    const assignedTo  = String(row['Assigned to'] ?? '').trim();
    const assignGroup = String(row['Assignment group'] ?? '').trim();
    const stateRaw    = String(row['State'] ?? '').trim();
    const approvalRaw = String(row['Approval'] ?? 'Pending').trim();
    const shortDesc   = String(row['Short description'] ?? '').trim();
    const description = String(row['Description'] ?? '').trim();
    const closeNotes  = String(row['Close notes'] ?? '').trim();
    const comments    = String(row['Comments and Work notes'] ?? '').trim();
    const openedDate  = excelSerialToISO(row['Opened']);
    const updatedDate = excelSerialToISO(row['Updated']);

    const { method: deliveryMethod, address: deliveryAddress } = parseDeliveryFromDescription(description);

    // Detect new hire from Short description or Description
    const isNewHire =
      /new hire/i.test(shortDesc) ||
      /new hire/i.test(description);

    // Group all items by employee name (one card per person)
    const key = employeeName.toLowerCase();

    if (!map.has(key)) {
      map.set(key, {
        id: generateId(),
        employeeName,
        approvalState: parseApproval(approvalRaw),
        employeeType: isNewHire ? 'New Hire' : 'Existing',
        accessories: [],
        status: 'pending',
        importedAt: new Date().toISOString(),
      });
    }

    const req = map.get(key)!;
    // If any item flags new hire, mark the whole request as New Hire
    if (isNewHire) req.employeeType = 'New Hire';

    // Determine item status from comments first, then fall back to ServiceNow state
    const commentResult = parseStatusFromComments(comments);

    let itemStatus: 'collected' | 'shipped' | 'pending' = 'pending';
    let collectionMethod: 'collect' | 'ship' | undefined;
    let collectedDate: string | undefined;
    let acknowledgedBy: string | undefined;

    if (commentResult) {
      // Comments explicitly say collected or shipped
      itemStatus = commentResult.status;
      collectionMethod = commentResult.collectionMethod;
      collectedDate = commentResult.collectedDate;
      acknowledgedBy = 'Auto-detected from comments';
    } else if (stateRaw.toLowerCase() === 'closed complete') {
      // ServiceNow closed with no specific comment — treat as collected
      itemStatus = 'collected';
      collectionMethod = 'collect';
      acknowledgedBy = 'Auto-detected (Closed Complete)';
    }

    const item: AccessoryItem = {
      id: generateId(),
      ritm,
      reqNumber,
      name: itemName || '(no item name)',
      quantity: qty,
      assignedTo,
      assignmentGroup: assignGroup,
      state: stateRaw,
      shortDescription: shortDesc,
      description,
      openedDate,
      updatedDate,
      closeNotes,
      deliveryMethod,
      deliveryAddress,
      status: itemStatus,
      collectionMethod,
      collectedDate,
      acknowledgedBy,
      acknowledgedAt: itemStatus !== 'pending' ? new Date().toISOString() : undefined,
    };

    req.accessories.push(item);

    // Keep the most permissive approval on the request
    if (parseApproval(approvalRaw) === 'Approved') req.approvalState = 'Approved';
  }

  // Recompute each request's status from items
  for (const req of map.values()) {
    const all = req.accessories.length;
    const done = req.accessories.filter((i) => i.status !== 'pending').length;
    req.status = done === 0 ? 'pending' : done < all ? 'partially_fulfilled' : 'fulfilled';
  }

  return Array.from(map.values());
}

export function formatDate(dateStr?: string): string {
  if (!dateStr) return '—';
  try {
    return new Date(dateStr).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

export function deliveryLabel(method: DeliveryMethod): string {
  switch (method) {
    case 'pickup':     return 'Pickup from Office';
    case 'ship_home':  return 'Ship to Home Address';
    case 'ship_office':return 'Ship from Office';
  }
}

export function deliveryIcon(method: DeliveryMethod): string {
  switch (method) {
    case 'pickup':     return '🏢';
    case 'ship_home':  return '🏠';
    case 'ship_office':return '📦';
  }
}

export function employeeTypeColor(type: string): string {
  return type === 'New Hire'
    ? 'bg-purple-100 text-purple-800 whitespace-nowrap'
    : 'bg-slate-100 text-slate-600 whitespace-nowrap';
}

export function statusColor(status: string): string {
  switch (status) {
    // Collection status
    case 'collected':              return 'bg-green-100 text-green-800';
    case 'shipped':                return 'bg-blue-100 text-blue-800';
    case 'pending':                return 'bg-yellow-100 text-yellow-800';
    // Request fulfilment
    case 'fulfilled':              return 'bg-green-100 text-green-800';
    case 'partially_fulfilled':    return 'bg-orange-100 text-orange-800';
    // Approval
    case 'Approved':               return 'bg-green-100 text-green-800';
    case 'Pending':                return 'bg-yellow-100 text-yellow-800';
    case 'Not Approved':           return 'bg-orange-100 text-orange-800';
    case 'Rejected':               return 'bg-red-100 text-red-800';
    // ServiceNow State
    case 'Work in Progress':       return 'bg-blue-100 text-blue-800';
    case 'Closed Complete':        return 'bg-green-100 text-green-800';
    default:                       return 'bg-gray-100 text-gray-800';
  }
}

export function exportToExcel(requests: AccessoryRequest[]): void {
  const rows: Record<string, unknown>[] = [];
  for (const req of requests) {
    for (const item of req.accessories) {
      rows.push({
        'Requested for':        req.employeeName,
        'Employee Type':        req.employeeType,
        'RITM Number':          item.ritm,
        'REQ Number':           item.reqNumber,
        'Item':                 item.name,
        'Quantity':             item.quantity,
        'Assigned to':          item.assignedTo,
        'Assignment group':     item.assignmentGroup,
        'ServiceNow State':     item.state,
        'Approval':             req.approvalState,
        'Opened':               item.openedDate,
        'Delivery Method':      deliveryLabel(item.deliveryMethod),
        'Delivery Address':     item.deliveryAddress,
        'Short description':    item.shortDescription,
        'Close notes':          item.closeNotes,
        // Collection tracking fields
        'Collection Status':    item.status,
        'Collection Method':    item.collectionMethod === 'collect' ? 'Collected from Office' : item.collectionMethod === 'ship' ? 'Shipment Requested' : '',
        'Collected Date':       item.collectedDate ?? '',
        'Acknowledged By':      item.acknowledgedBy ?? '',
        'Acknowledged At':      item.acknowledgedAt ? new Date(item.acknowledgedAt).toLocaleString() : '',
        'Notes':                item.notes ?? '',
        // IT dispatch
        'IT Shipment Type':     item.itAction ? (item.itAction.shipmentType === 'ship_office' ? 'Shipment from Office' : 'Shipment via Vendor') : '',
        'IT Initiated Date':    item.itAction?.initiatedDate ?? '',
        'IT Initiated By':      item.itAction?.initiatedBy ?? '',
        'IT Notes':             item.itAction?.notes ?? '',
      });
    }
  }

  // Summary sheet
  const collected  = requests.flatMap(r => r.accessories).filter(i => i.status === 'collected').length;
  const shipped    = requests.flatMap(r => r.accessories).filter(i => i.status === 'shipped').length;
  const pending    = requests.flatMap(r => r.accessories).filter(i => i.status === 'pending').length;
  const newHires   = requests.filter(r => r.employeeType === 'New Hire').length;
  const existing   = requests.filter(r => r.employeeType === 'Existing').length;

  const summary = [
    { 'Metric': 'Total Employees',            'Count': requests.length },
    { 'Metric': 'New Hires',                  'Count': newHires },
    { 'Metric': 'Existing Employees',         'Count': existing },
    { 'Metric': '',                           'Count': '' },
    { 'Metric': 'Total Items',                'Count': collected + shipped + pending },
    { 'Metric': 'Collected from Office',      'Count': collected },
    { 'Metric': 'Shipment Requested',         'Count': shipped },
    { 'Metric': 'Pending (not yet actioned)', 'Count': pending },
    { 'Metric': '',                           'Count': '' },
    { 'Metric': 'Report Generated',          'Count': new Date().toLocaleString() },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summary),  'Summary');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows),     'All Items');

  // Collected-only sheet
  const collectedRows = rows.filter(r => r['Collection Status'] === 'collected');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(collectedRows.length ? collectedRows : [{ Note: 'No collected items yet' }]), 'Collected');

  // Shipped-only sheet
  const shippedRows = rows.filter(r => r['Collection Status'] === 'shipped');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(shippedRows.length ? shippedRows : [{ Note: 'No shipped items yet' }]), 'Shipped');

  // Pending-only sheet
  const pendingRows = rows.filter(r => r['Collection Status'] === 'pending');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(pendingRows.length ? pendingRows : [{ Note: 'No pending items' }]), 'Pending');

  // IT Dispatch sheet
  const itRows = rows.filter(r => r['IT Shipment Type'] !== '');
  const itDispatchRows = itRows.map(r => ({
    'Requested for':    r['Requested for'],
    'Employee Type':    r['Employee Type'],
    'RITM Number':      r['RITM Number'],
    'REQ Number':       r['REQ Number'],
    'Item':             r['Item'],
    'Assigned to':      r['Assigned to'],
    'IT Shipment Type': r['IT Shipment Type'],
    'IT Initiated Date':r['IT Initiated Date'],
    'IT Initiated By':  r['IT Initiated By'],
    'IT Notes':         r['IT Notes'],
    'Collection Status':r['Collection Status'],
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(itDispatchRows.length ? itDispatchRows : [{ Note: 'No IT dispatch actions recorded yet' }]), 'IT Dispatch');

  XLSX.writeFile(wb, `it-assets-report-${new Date().toISOString().slice(0, 10)}.xlsx`);
}
