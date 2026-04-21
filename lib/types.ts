export type ApprovalState = 'Approved' | 'Pending' | 'Not Approved' | 'Rejected';
export type StateValue = 'Work in Progress' | 'Closed Complete' | string;
export type DeliveryMethod = 'pickup' | 'ship_home' | 'ship_office';
export type ItemStatus = 'pending' | 'collected' | 'shipped';
export type RequestStatus = 'pending' | 'partially_fulfilled' | 'fulfilled';

export type ITShipmentType = 'ship_office' | 'ship_vendor';

export interface ITAction {
  shipmentType: ITShipmentType;
  initiatedDate: string;
  initiatedBy: string;
  notes?: string;
}

export interface AccessoryItem {
  id: string;
  ritm: string;
  reqNumber: string;
  name: string;
  quantity: number;
  assignedTo: string;
  assignmentGroup: string;
  state: string;
  shortDescription: string;
  description: string;
  openedDate: string;
  updatedDate: string;
  closeNotes: string;
  deliveryMethod: DeliveryMethod;
  deliveryAddress: string;

  // Employee acknowledgment
  status: ItemStatus;
  collectedDate?: string;
  collectionMethod?: 'collect' | 'ship';
  acknowledgedAt?: string;
  acknowledgedBy?: string;
  notes?: string;

  // IT dispatch action
  itAction?: ITAction;
}

export type EmployeeType = 'New Hire' | 'Existing';

export interface AccessoryRequest {
  id: string;
  employeeName: string;       // Requested for
  approvalState: ApprovalState;
  employeeType: EmployeeType;
  accessories: AccessoryItem[];
  status: RequestStatus;
  importedAt: string;
}

export interface EmployeeContact {
  employeeId: string;
  name: string;
  email: string;
}

export interface ReportSummary {
  totalRequests: number;
  approved: number;
  pending: number;
  notApproved: number;
  rejected: number;
  collected: number;
  shipped: number;
  pendingFulfillment: number;
  closedComplete: number;
  workInProgress: number;
  // IT dispatch
  dispatchedOffice: number;
  dispatchedVendor: number;
  totalDispatched: number;
}
