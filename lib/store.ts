import { AccessoryRequest, AccessoryItem, ReportSummary } from './types';

const REQUESTS_KEY = 'it_assets_requests';

export function getRequests(): AccessoryRequest[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(REQUESTS_KEY);
    const requests: AccessoryRequest[] = raw ? JSON.parse(raw) : [];
    // Migrate: items that have itAction but status still "pending" → mark as shipped
    let dirty = false;
    for (const req of requests) {
      for (const item of req.accessories) {
        if (item.itAction && item.status === 'pending') {
          item.status = 'shipped';
          item.collectionMethod = 'ship';
          dirty = true;
        }
      }
      if (dirty) recomputeStatus(req);
    }
    if (dirty) localStorage.setItem(REQUESTS_KEY, JSON.stringify(requests));
    return requests;
  } catch {
    return [];
  }
}

export function saveRequests(requests: AccessoryRequest[]): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(REQUESTS_KEY, JSON.stringify(requests));
}

// ── Fields from ServiceNow that get refreshed on each import ─────────────────
// (Everything that comes from the Excel, not from the dashboard)
const SN_FIELDS: (keyof AccessoryItem)[] = [
  'name', 'quantity', 'assignedTo', 'assignmentGroup',
  'state', 'shortDescription', 'description',
  'openedDate', 'updatedDate', 'closeNotes',
  'deliveryMethod', 'deliveryAddress', 'reqNumber',
];

// ── Fields tracked locally that must NEVER be overwritten on re-import ────────
// status, collectionMethod, collectedDate, acknowledgedAt, acknowledgedBy,
// notes, itAction  ← these stay as-is unless the item is brand new

export interface MergeResult {
  newEmployees: number;       // employees added from new Excel
  updatedEmployees: number;   // existing employees whose SN data was refreshed
  newItems: number;           // brand-new RITMs added
  updatedItems: number;       // existing RITMs whose SN data was refreshed
  preservedItems: number;     // items that had local tracking data kept intact
}

/**
 * Smart merge:
 *  - Items matched by RITM.
 *  - ServiceNow fields refreshed from the new Excel.
 *  - All locally-tracked fields (collection status, IT dispatch, notes) preserved.
 *  - New employees / new RITMs appended.
 *  - Employees absent from the new Excel are left untouched.
 */
export function mergeRequests(incoming: AccessoryRequest[]): MergeResult {
  const existing = getRequests();
  const result: MergeResult = {
    newEmployees: 0, updatedEmployees: 0,
    newItems: 0, updatedItems: 0, preservedItems: 0,
  };

  // Index existing requests by lowercased employee name
  const byEmployee = new Map<string, AccessoryRequest>(
    existing.map((r) => [r.employeeName.toLowerCase().trim(), r])
  );

  // Flat index of all existing items by RITM (for fast lookup)
  const byRitm = new Map<string, AccessoryItem>();
  existing.forEach((req) =>
    req.accessories.forEach((item) => byRitm.set(item.ritm.trim(), item))
  );

  for (const inc of incoming) {
    const empKey = inc.employeeName.toLowerCase().trim();
    const cur = byEmployee.get(empKey);

    if (cur) {
      // ── Existing employee ──────────────────────────────────────────────────
      result.updatedEmployees++;

      // Update request-level SN fields
      cur.approvalState = inc.approvalState;
      cur.employeeType  = inc.employeeType;

      for (const incItem of inc.accessories) {
        const ritmKey = incItem.ritm.trim();
        const curItem = byRitm.get(ritmKey);

        if (curItem) {
          // Refresh ServiceNow fields
          for (const field of SN_FIELDS) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (curItem as any)[field] = (incItem as any)[field];
          }

          // If incoming auto-detected a status from comments and local is still pending → accept it
          if (curItem.status === 'pending' && incItem.status !== 'pending') {
            curItem.status            = incItem.status;
            curItem.collectionMethod  = incItem.collectionMethod;
            curItem.collectedDate     = incItem.collectedDate;
            curItem.acknowledgedBy    = incItem.acknowledgedBy;
            curItem.acknowledgedAt    = incItem.acknowledgedAt;
          } else if (curItem.status !== 'pending') {
            // Track how many items had saved local data preserved
            result.preservedItems++;
          }

          result.updatedItems++;
        } else {
          // Brand-new RITM for this employee
          cur.accessories.push(incItem);
          byRitm.set(ritmKey, incItem);
          result.newItems++;
        }
      }

      recomputeStatus(cur);
    } else {
      // ── Brand-new employee ─────────────────────────────────────────────────
      byEmployee.set(empKey, inc);
      inc.accessories.forEach((item) => byRitm.set(item.ritm.trim(), item));
      result.newEmployees++;
      result.newItems += inc.accessories.length;
    }
  }

  saveRequests(Array.from(byEmployee.values()));
  return result;
}

/** @deprecated use mergeRequests instead */
export function addRequests(incoming: AccessoryRequest[]): void {
  mergeRequests(incoming);
}

function recomputeStatus(req: AccessoryRequest): void {
  const all  = req.accessories.length;
  const done = req.accessories.filter((i) => i.status !== 'pending').length;
  req.status = done === 0 ? 'pending' : done < all ? 'partially_fulfilled' : 'fulfilled';
}

export function updateRequest(updated: AccessoryRequest): void {
  const requests = getRequests();
  const idx = requests.findIndex((r) => r.id === updated.id);
  if (idx !== -1) {
    requests[idx] = updated;
    saveRequests(requests);
  }
}

export function deleteRequest(id: string): void {
  saveRequests(getRequests().filter((r) => r.id !== id));
}

export function clearAllRequests(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(REQUESTS_KEY);
}

export function getReportSummary(): ReportSummary {
  const requests = getRequests();
  const allItems = requests.flatMap((r) => r.accessories);
  return {
    totalRequests:      requests.length,
    approved:           requests.filter((r) => r.approvalState === 'Approved').length,
    pending:            requests.filter((r) => r.approvalState === 'Pending').length,
    notApproved:        requests.filter((r) => r.approvalState === 'Not Approved').length,
    rejected:           requests.filter((r) => r.approvalState === 'Rejected').length,
    collected:          allItems.filter((i) => i.status === 'collected').length,
    shipped:            allItems.filter((i) => i.status === 'shipped').length,
    pendingFulfillment: allItems.filter((i) => i.status === 'pending').length,
    closedComplete:     allItems.filter((i) => i.state === 'Closed Complete').length,
    workInProgress:     allItems.filter((i) => i.state === 'Work in Progress').length,
    dispatchedOffice:   allItems.filter((i) => i.itAction?.shipmentType === 'ship_office').length,
    dispatchedVendor:   allItems.filter((i) => i.itAction?.shipmentType === 'ship_vendor').length,
    totalDispatched:    allItems.filter((i) => !!i.itAction).length,
  };
}
