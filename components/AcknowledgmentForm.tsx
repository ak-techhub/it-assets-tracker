"use client";
import { useState, useMemo } from "react";
import { AccessoryRequest, AccessoryItem, ITAction, ITShipmentType } from "@/lib/types";
import { formatDate, deliveryLabel, statusColor, cn } from "@/lib/utils";
import { updateRequest } from "@/lib/store";
import { findEmailByName } from "@/lib/headcount";
import EmailNotificationModal, { EmailPayload } from "@/components/EmailNotificationModal";
import {
  CheckCircle2, Truck, Package, CalendarDays, User,
  MapPin, Hash, Building2, Store, Send, ClipboardList,
  Mail, Pencil, X, Bell, Save, RotateCcw,
} from "lucide-react";

interface Props {
  request: AccessoryRequest;
  assigneeOptions: string[];
  onAcknowledged: () => void;
}

type Tab = "employee" | "itdispatch";

const todayISO = () => new Date().toISOString().slice(0, 10);

// ── Email helpers ──────────────────────────────────────────────────────────────

function empEmail(name: string) { return findEmailByName(name); }

function buildReadyEmail(request: AccessoryRequest, items: AccessoryItem[]): EmailPayload {
  const lines = items.map((i) => `  • ${i.name} — Qty: ${i.quantity}`).join("\n");
  return {
    to: empEmail(request.employeeName),
    employeeName: request.employeeName,
    subject: `IT Assets — Your Accessories Are Ready for Collection`,
    body: `Dear ${request.employeeName},\n\nWe are pleased to inform you that the following IT accessories are now ready for collection at the office.\n\nEmployee : ${request.employeeName}\n\nITEMS READY:\n${lines}\n\nPlease visit the IT desk at your earliest convenience to collect your accessories.\nBring this email or your employee ID for reference.\n\nIf you need the items shipped to your address instead, please reply to this email.\n\nThank you,\nIT Assets Team`,
  };
}

function buildCollectionEmail(request: AccessoryRequest, actionedItems: AccessoryItem[], acknowledgedBy: string): EmailPayload {
  const dateStr = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  const lines = actionedItems.map((i) => {
    const action = i.collectionMethod === "collect"
      ? `Collected from Office${i.collectedDate ? " on " + formatDate(i.collectedDate) : ""}`
      : "Shipment Requested";
    return `  • ${i.name} — Qty: ${i.quantity} — ${action}`;
  }).join("\n");
  return {
    to: empEmail(request.employeeName),
    employeeName: request.employeeName,
    subject: `IT Assets — Acknowledgment Confirmation for ${request.employeeName}`,
    body: `Dear ${request.employeeName},\n\nThis is to confirm that the following IT accessories have been acknowledged on ${dateStr}.\n\nEmployee        : ${request.employeeName}\nAcknowledged By : ${acknowledgedBy}\n\nITEMS:\n${lines}\n\nIf you have any questions, please reach out to the IT team.\n\nThank you,\nIT Assets Team`,
  };
}

function buildITDispatchEmail(
  request: AccessoryRequest, dispatchedItems: AccessoryItem[],
  shipmentType: ITShipmentType, initiatedDate: string, initiatedBy: string, notes: string
): EmailPayload {
  const shipLabel = shipmentType === "ship_office" ? "Shipment from Office" : "Shipment via Vendor";
  const lines = dispatchedItems.map((i) => `  • ${i.name} — Qty: ${i.quantity}`).join("\n");
  return {
    to: empEmail(request.employeeName),
    employeeName: request.employeeName,
    subject: `IT Assets — Shipment Initiated for ${request.employeeName}`,
    body: `Dear ${request.employeeName},\n\nWe would like to inform you that your IT accessories have been dispatched.\n\nEmployee      : ${request.employeeName}\nShipment Type : ${shipLabel}\nInitiated Date: ${formatDate(initiatedDate)}\nInitiated By  : ${initiatedBy}${notes ? `\nNotes/Tracking: ${notes}` : ""}\n\nITEMS DISPATCHED:\n${lines}\n\nPlease ensure you are available to receive the shipment. If you have any questions, contact the IT team.\n\nThank you,\nIT Assets Team`,
  };
}

// ── Per-item edit draft ────────────────────────────────────────────────────────

interface EditDraft {
  collectionMethod: "collect" | "ship" | undefined;
  collectedDate: string;
  deliveryAddress: string;
  notes: string;
}

function draftFrom(item: AccessoryItem): EditDraft {
  return {
    collectionMethod: item.collectionMethod as "collect" | "ship" | undefined,
    collectedDate:    item.collectedDate ?? "",
    deliveryAddress:  item.deliveryAddress ?? "",
    notes:            item.notes ?? "",
  };
}

// ── Checkbox helper ───────────────────────────────────────────────────────────

function Checkbox({ checked }: { checked: boolean }) {
  return (
    <div className={cn(
      "w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 mt-0.5 transition-colors",
      checked ? "border-indigo-500 bg-indigo-500" : "border-slate-300 bg-white"
    )}>
      {checked && (
        <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 12 12">
          <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function AcknowledgmentForm({ request, assigneeOptions, onAcknowledged }: Props) {
  const [tab, setTab] = useState<Tab>("employee");

  const [items, setItems] = useState<AccessoryItem[]>(() =>
    request.accessories.map((a) => ({ ...a }))
  );

  // ── Employee tab state ──
  const [empChecked, setEmpChecked]         = useState<Set<string>>(new Set());
  const [empAction, setEmpAction]           = useState<"collect" | "ship" | "">("");
  const [empCollectedDate, setEmpCollectedDate] = useState(todayISO());
  const [acknowledgedBy, setAcknowledgedBy] = useState("");
  const [empSaved, setEmpSaved]             = useState(false);
  const [empErrors, setEmpErrors]           = useState<string[]>([]);

  // Inline edit for completed items
  const [editDrafts, setEditDrafts]   = useState<Record<string, EditDraft>>({});
  const [editingIds, setEditingIds]   = useState<Set<string>>(new Set());

  // ── IT Dispatch tab state ──
  const [itChecked, setItChecked]       = useState<Set<string>>(new Set());
  const [bulkShipType, setBulkShipType] = useState<ITShipmentType | "">("");
  const [bulkDate, setBulkDate]         = useState(todayISO());
  const [bulkBy, setBulkBy]             = useState("");
  const [bulkNotes, setBulkNotes]       = useState("");
  const [itSaved, setItSaved]           = useState(false);
  const [itErrors, setItErrors]         = useState<string[]>([]);

  const [emailPayload, setEmailPayload] = useState<EmailPayload | null>(null);

  // ── Derived lists ──────────────────────────────────────────────────────────
  // Work in Progress = pending collection AND SN state != Closed Complete
  const wipItems           = useMemo(() => items.filter((i) => i.status === "pending" && i.state !== "Closed Complete"), [items]);
  // Closed Complete in SN but not yet actioned → read-only info, no action needed
  const closedPendingItems = useMemo(() => items.filter((i) => i.status === "pending" && i.state === "Closed Complete"), [items]);
  const doneItems          = useMemo(() => items.filter((i) => i.status !== "pending"), [items]);
  const pendingCount       = wipItems.length + closedPendingItems.length;

  // IT dispatch split
  const undispatchedItems  = useMemo(() => items.filter((i) => !i.itAction && i.state !== "Closed Complete"), [items]);
  const closedNoDispatch   = useMemo(() => items.filter((i) => !i.itAction && i.state === "Closed Complete"), [items]);
  const dispatchedItems    = useMemo(() => items.filter((i) => !!i.itAction), [items]);

  // ── Helpers ────────────────────────────────────────────────────────────────
  const save = (updated: AccessoryItem[]) => {
    const allDone = updated.every((i) => i.status !== "pending");
    const anyDone = updated.some((i) => i.status !== "pending");
    const updatedReq: AccessoryRequest = {
      ...request,
      accessories: updated,
      status: allDone ? "fulfilled" : anyDone ? "partially_fulfilled" : "pending",
    };
    updateRequest(updatedReq);
    setItems(updated);
    onAcknowledged();
  };

  const toggleEmp = (id: string) =>
    setEmpChecked((prev) => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });

  const toggleIt = (id: string) =>
    setItChecked((prev) => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });

  // ── Employee submit ────────────────────────────────────────────────────────
  const handleEmpSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const errs: string[] = [];
    if (empChecked.size === 0)  errs.push("Tick at least one item.");
    if (!empAction)             errs.push("Choose an action — Collected from Office or Request Shipment.");
    if (empAction === "collect" && !empCollectedDate) errs.push("Set a collection date.");
    if (!acknowledgedBy.trim()) errs.push("Enter your name or employee ID to acknowledge.");
    if (errs.length > 0) { setEmpErrors(errs); return; }
    setEmpErrors([]);

    const now = new Date().toISOString();
    const updated = items.map((item) => {
      if (!empChecked.has(item.id) || item.status !== "pending") return item;
      return {
        ...item,
        status:           (empAction === "collect" ? "collected" : "shipped") as "collected" | "shipped",
        collectionMethod: empAction as "collect" | "ship",
        collectedDate:    empAction === "collect" ? empCollectedDate : undefined,
        acknowledgedAt:   now,
        acknowledgedBy:   acknowledgedBy.trim(),
      };
    });
    save(updated);
    setEmpSaved(true);
    setEmpChecked(new Set());

    const actioned = updated.filter((i) => i.acknowledgedAt === now);
    if (actioned.length > 0)
      setEmailPayload(buildCollectionEmail(request, actioned, acknowledgedBy.trim()));
  };

  // ── IT Dispatch submit ─────────────────────────────────────────────────────
  const handleITApply = () => {
    const errs: string[] = [];
    if (itChecked.size === 0) errs.push("Select at least one item.");
    if (!bulkShipType)        errs.push("Select shipment type.");
    if (!bulkBy)              errs.push("Select who is initiating.");
    if (errs.length > 0) { setItErrors(errs); return; }
    setItErrors([]);

    const action: ITAction = {
      shipmentType:  bulkShipType as ITShipmentType,
      initiatedDate: bulkDate,
      initiatedBy:   bulkBy,
      notes:         bulkNotes.trim() || undefined,
    };
    const dispatched = items.filter((i) => itChecked.has(i.id));
    const updated    = items.map((i) => itChecked.has(i.id)
      ? { ...i, itAction: action, status: "shipped" as const, collectionMethod: "ship" as const }
      : i
    );
    updateRequest({ ...request, accessories: updated });
    setItems(updated);
    setItSaved(true);
    setItChecked(new Set());
    onAcknowledged();
    setTimeout(() => setItSaved(false), 3000);
    setEmailPayload(buildITDispatchEmail(request, dispatched, bulkShipType as ITShipmentType, bulkDate, bulkBy, bulkNotes));
  };

  // ── Inline edit (completed items) ─────────────────────────────────────────
  const startEdit  = (item: AccessoryItem) => {
    setEditDrafts((p) => ({ ...p, [item.id]: draftFrom(item) }));
    setEditingIds((p) => new Set(p).add(item.id));
  };
  const cancelEdit = (id: string) =>
    setEditingIds((p) => { const s = new Set(p); s.delete(id); return s; });
  const setDraftField = (id: string, field: keyof EditDraft, value: string) =>
    setEditDrafts((p) => ({ ...p, [id]: { ...p[id], [field]: value } }));

  const applyEdit = (item: AccessoryItem) => {
    const draft = editDrafts[item.id];
    if (!draft?.collectionMethod) return;
    const updated = items.map((i) => i.id !== item.id ? i : {
      ...i,
      collectionMethod: draft.collectionMethod,
      collectedDate:    draft.collectionMethod === "collect" ? draft.collectedDate || undefined : undefined,
      deliveryAddress:  draft.deliveryAddress,
      notes:            draft.notes || undefined,
      status:           (draft.collectionMethod === "collect" ? "collected" : "shipped") as "collected" | "shipped",
    });
    save(updated);
    cancelEdit(item.id);
  };

  const resetItem = (item: AccessoryItem) => {
    const updated = items.map((i) => i.id !== item.id ? i : {
      ...i,
      status: "pending" as const,
      collectionMethod: undefined,
      collectedDate: undefined,
      acknowledgedBy: undefined,
      acknowledgedAt: undefined,
      itAction: undefined,
      notes: undefined,
    });
    save(updated);
    cancelEdit(item.id);
    setEmpSaved(false);
  };

  // ── Info bar ───────────────────────────────────────────────────────────────
  const InfoBar = () => (
    <div className="bg-slate-50 px-5 py-3 grid sm:grid-cols-2 gap-2 text-xs border-b border-slate-200">
      <div className="flex items-center gap-1.5 text-slate-600">
        <Package size={13} className="text-slate-400" />
        <span className="font-medium">Approval:</span>
        <span className={cn("px-1.5 py-0.5 rounded-full font-medium ml-1", statusColor(request.approvalState))}>
          {request.approvalState}
        </span>
      </div>
      {request.accessories[0]?.assignedTo && (
        <div className="flex items-center gap-1.5 text-slate-600">
          <User size={13} className="text-slate-400" />
          <span><span className="font-medium">Assigned To:</span> {request.accessories[0].assignedTo}</span>
        </div>
      )}
      {request.accessories[0]?.assignmentGroup && (
        <div className="flex items-center gap-1.5 text-slate-600">
          <Hash size={13} className="text-slate-400" />
          <span><span className="font-medium">Group:</span> {request.accessories[0].assignmentGroup}</span>
        </div>
      )}
      <div className="flex items-center gap-1.5 text-slate-600">
        <ClipboardList size={13} className="text-slate-400" />
        <span>
          {request.accessories.length} item(s) &bull; {wipItems.length} WIP
          {closedPendingItems.length > 0 && <> &bull; {closedPendingItems.length} closed (SN)</>}
          {doneItems.length > 0 && <> &bull; {doneItems.length} actioned</>}
        </span>
      </div>
    </div>
  );

  // ── Reusable item card shell ───────────────────────────────────────────────
  const ItemCard = ({ item, checked, onClick, accent }: {
    item: AccessoryItem; checked?: boolean; onClick?: () => void; accent?: string;
  }) => (
    <div
      onClick={onClick}
      className={cn(
        "flex items-start gap-3 border rounded-xl px-4 py-3 transition-colors",
        onClick ? "cursor-pointer select-none" : "",
        checked === true  ? "border-indigo-400 bg-indigo-50" :
        accent            ? accent :
        "border-slate-200 bg-white hover:border-indigo-200"
      )}
    >
      {onClick !== undefined && <Checkbox checked={!!checked} />}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-sm font-semibold text-slate-800">{item.name}</p>
            <p className="text-[11px] text-slate-400 font-mono mt-0.5">{item.ritm}</p>
          </div>
          <span className={cn("text-[11px] font-medium px-1.5 py-0.5 rounded-full shrink-0", statusColor(item.state))}>
            SN: {item.state}
          </span>
        </div>
        <p className="text-[11px] text-slate-500 mt-1">
          Qty: {item.quantity} &bull; {deliveryLabel(item.deliveryMethod)}
        </p>
        {item.deliveryAddress && (
          <p className="text-[10px] text-slate-400 mt-0.5 truncate max-w-[240px]" title={item.deliveryAddress}>
            <MapPin size={9} className="inline mr-0.5" />{item.deliveryAddress.split("\n")[0]}
          </p>
        )}
      </div>
    </div>
  );

  // ═══════════════════════════════════════════════════════════════════════════
  return (
    <>
      {emailPayload && (
        <EmailNotificationModal payload={emailPayload} onClose={() => setEmailPayload(null)} />
      )}

      <div>
        <InfoBar />

        {/* Tabs */}
        <div className="flex border-b border-slate-200 bg-white">
          <button onClick={() => setTab("employee")} className={cn(
            "flex-1 py-3 text-sm font-medium flex items-center justify-center gap-2 border-b-2 transition-colors",
            tab === "employee" ? "border-indigo-500 text-indigo-700 bg-indigo-50/50"
              : "border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50"
          )}>
            <User size={15} /> Employee Acknowledgment
            {pendingCount > 0 && (
              <span className="ml-1 bg-amber-100 text-amber-700 text-[10px] font-semibold px-1.5 py-0.5 rounded-full">
                {wipItems.length} WIP{closedPendingItems.length > 0 ? ` · ${closedPendingItems.length} closed` : ""}
              </span>
            )}
          </button>
          <button onClick={() => setTab("itdispatch")} className={cn(
            "flex-1 py-3 text-sm font-medium flex items-center justify-center gap-2 border-b-2 transition-colors",
            tab === "itdispatch" ? "border-indigo-500 text-indigo-700 bg-indigo-50/50"
              : "border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50"
          )}>
            <Send size={15} /> IT Dispatch
            {dispatchedItems.length > 0 && (
              <span className="ml-1 bg-indigo-100 text-indigo-700 text-[10px] font-semibold px-1.5 py-0.5 rounded-full">
                {dispatchedItems.length} dispatched
              </span>
            )}
          </button>
        </div>

        {/* ═══ EMPLOYEE TAB ═══════════════════════════════════════════════════ */}
        {tab === "employee" && (
          <form onSubmit={handleEmpSubmit} className="p-5 space-y-4">

            {/* Notify ready banner */}
            <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
              <Bell size={15} className="text-amber-500 shrink-0" />
              <p className="text-xs text-amber-800 flex-1">Notify the employee their accessories are ready before they collect.</p>
              <button type="button" onClick={() => setEmailPayload(buildReadyEmail(request, items))}
                className="flex items-center gap-1.5 text-xs font-medium text-amber-700 border border-amber-300 bg-white hover:bg-amber-50 rounded-lg px-3 py-1.5 whitespace-nowrap transition-colors">
                <Mail size={13} /> Notify Ready
              </button>
            </div>

            {/* ── Step 1: Select WIP items ── */}
            {wipItems.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide flex items-center gap-1.5">
                    <Package size={12} /> Step 1 — Select Work in Progress items
                  </p>
                  <button type="button"
                    onClick={() => setEmpChecked(empChecked.size === wipItems.length
                      ? new Set() : new Set(wipItems.map((i) => i.id)))}
                    className="text-xs text-indigo-600 hover:text-indigo-800 font-medium">
                    {empChecked.size === wipItems.length ? "Deselect All" : "Select All"}
                  </button>
                </div>
                {wipItems.map((item) => (
                  <ItemCard key={item.id} item={item} checked={empChecked.has(item.id)} onClick={() => toggleEmp(item.id)} />
                ))}
              </div>
            )}

            {/* ── Step 2: Choose action ── */}
            {wipItems.length > 0 && (
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide flex items-center gap-1.5">
                  <Send size={12} /> Step 2 — Choose Action for Selected Items
                </p>

                <div className="flex gap-2">
                  {([
                    ["collect", "Collected from Office", CheckCircle2, "border-emerald-500 bg-emerald-50 text-emerald-700", "border-slate-200 hover:border-emerald-300"],
                    ["ship",    "Request Shipment",      Truck,         "border-blue-500 bg-blue-50 text-blue-700",           "border-slate-200 hover:border-blue-300"],
                  ] as const).map(([val, label, Icon, activeClass, inactiveClass]) => (
                    <label key={val} className={cn(
                      "flex-1 flex items-center gap-2 border rounded-lg px-3 py-2.5 cursor-pointer text-sm transition-colors",
                      empAction === val ? activeClass : inactiveClass
                    )}>
                      <input type="radio" name="emp-action" value={val}
                        checked={empAction === val}
                        onChange={() => setEmpAction(val)} className="hidden" />
                      <Icon size={15} /> {label}
                    </label>
                  ))}
                </div>

                {empAction === "collect" && (
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-slate-600 w-28 shrink-0 font-medium">Collected Date *</label>
                    <input type="date" value={empCollectedDate} max={todayISO()}
                      onChange={(e) => setEmpCollectedDate(e.target.value)}
                      className="flex-1 border border-slate-200 rounded-lg px-2 py-1.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300" />
                  </div>
                )}

                <div className="flex items-center gap-2">
                  <label className="text-xs text-slate-600 w-28 shrink-0 font-medium">Acknowledged by *</label>
                  <input type="text" value={acknowledgedBy}
                    onChange={(e) => setAcknowledgedBy(e.target.value)}
                    placeholder="Your name or employee ID"
                    className="flex-1 border border-slate-200 rounded-lg px-2 py-1.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300" />
                </div>
              </div>
            )}

            {/* All done */}
            {wipItems.length === 0 && closedPendingItems.length === 0 && !empSaved && doneItems.length > 0 && (
              <div className="text-center py-6 text-green-600 flex flex-col items-center gap-2">
                <CheckCircle2 size={28} />
                <p className="font-medium text-sm">All accessories fulfilled!</p>
              </div>
            )}

            {/* Errors */}
            {empErrors.length > 0 && (
              <ul className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 space-y-1">
                {empErrors.map((e, i) => <li key={i} className="text-xs text-red-600">&bull; {e}</li>)}
              </ul>
            )}

            {/* Submit / saved */}
            {wipItems.length > 0 && (
              empSaved ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-center gap-2 py-3 text-green-700 bg-green-50 border border-green-200 rounded-xl text-sm font-medium">
                    <CheckCircle2 size={16} /> Acknowledgment saved!
                  </div>
                  <button type="button"
                    onClick={() => setEmailPayload(buildCollectionEmail(request, doneItems, acknowledgedBy))}
                    className="w-full flex items-center justify-center gap-2 border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-medium rounded-xl py-2.5 text-sm transition-colors">
                    <Mail size={15} /> Send Collection Confirmation Email
                  </button>
                </div>
              ) : (
                <button type="submit" disabled={empChecked.size === 0}
                  className={cn(
                    "w-full font-semibold rounded-xl py-3 text-sm flex items-center justify-center gap-2 transition-colors shadow-sm",
                    empChecked.size > 0
                      ? "bg-indigo-600 hover:bg-indigo-700 text-white"
                      : "bg-indigo-100 text-indigo-300 cursor-not-allowed"
                  )}>
                  <Save size={15} />
                  {empChecked.size > 0
                    ? `Submit Acknowledgment — ${empChecked.size} item${empChecked.size !== 1 ? "s" : ""} selected`
                    : "Select items above to submit"}
                </button>
              )
            )}

            {/* ── Closed Complete — info only, no action needed ── */}
            {closedPendingItems.length > 0 && (
              <div className="pt-2 border-t border-slate-100 space-y-2">
                <p className="text-xs font-semibold text-green-700 uppercase tracking-wide flex items-center gap-1.5">
                  <CheckCircle2 size={12} /> Closed in ServiceNow — no action required
                </p>
                <p className="text-[11px] text-slate-400">These items are already Closed Complete in ServiceNow. Use the IT Dispatch tab to record shipment if needed.</p>
                {closedPendingItems.map((item) => (
                  <ItemCard key={item.id} item={item} accent="border-green-200 bg-green-50/40" />
                ))}
              </div>
            )}

            {/* ── Completed items with inline Edit ── */}
            {doneItems.length > 0 && (
              <div className="pt-2 border-t border-slate-100">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs text-slate-400 font-medium uppercase tracking-wide">Actioned ({doneItems.length})</p>
                  <button type="button"
                    onClick={() => setEmailPayload(buildCollectionEmail(request, doneItems, acknowledgedBy || "IT Team"))}
                    className="flex items-center gap-1 text-xs text-indigo-500 hover:text-indigo-700">
                    <Mail size={12} /> Email summary
                  </button>
                </div>
                <div className="space-y-2">
                  {doneItems.map((item) => {
                    const isEditing = editingIds.has(item.id);
                    const draft = editDrafts[item.id];
                    return (
                      <div key={item.id} className={cn(
                        "border rounded-xl overflow-hidden",
                        isEditing ? "border-orange-300 bg-orange-50/30" : "border-slate-100 bg-slate-50"
                      )}>
                        <div className="flex items-start justify-between px-3 py-2.5 gap-3 text-xs">
                          <div className="min-w-0">
                            <p className="font-medium text-slate-700">{item.name}</p>
                            <p className="text-slate-400 font-mono text-[10px] mt-0.5">{item.ritm}</p>
                            {item.deliveryAddress && !isEditing && (
                              <p className="text-[10px] text-slate-400 mt-0.5 max-w-[200px] truncate" title={item.deliveryAddress}>
                                <MapPin size={9} className="inline mr-0.5" />{item.deliveryAddress.split("\n")[0]}
                              </p>
                            )}
                          </div>
                          <div className="text-right shrink-0 space-y-1">
                            <span className={cn("block text-[11px] font-medium px-1.5 py-0.5 rounded-full", statusColor(item.status))}>
                              {item.status}
                            </span>
                            <span className={cn("block text-[10px] font-medium px-1.5 py-0.5 rounded-full", statusColor(item.state))}>
                              SN: {item.state}
                            </span>
                            {item.collectedDate && <p className="text-slate-400">{formatDate(item.collectedDate)}</p>}
                            {item.acknowledgedBy && (
                              <p className="text-[10px] text-slate-400 truncate max-w-[120px]">
                                {item.acknowledgedBy.startsWith("Auto") ? "⚡ auto" : `by ${item.acknowledgedBy}`}
                              </p>
                            )}
                            {!isEditing ? (
                              <button type="button" onClick={() => startEdit(item)}
                                className="flex items-center gap-0.5 text-[10px] text-orange-500 hover:text-orange-700 border border-orange-200 rounded px-1.5 py-0.5 transition-colors">
                                <Pencil size={9} /> Edit
                              </button>
                            ) : (
                              <button type="button" onClick={() => cancelEdit(item.id)}
                                className="flex items-center gap-0.5 text-[10px] text-slate-500 hover:text-slate-700 border border-slate-200 rounded px-1.5 py-0.5">
                                <X size={9} /> Cancel
                              </button>
                            )}
                          </div>
                        </div>
                        {isEditing && draft && (
                          <div className="border-t border-orange-200 px-3 py-3 space-y-2 bg-white">
                            <p className="text-[11px] font-semibold text-orange-600 uppercase tracking-wide flex items-center gap-1">
                              <Pencil size={10} /> Edit — {item.name}
                            </p>
                            <div>
                              <label className="text-[11px] text-slate-500 block mb-1">
                                <MapPin size={9} className="inline mr-1" />{deliveryLabel(item.deliveryMethod)}
                              </label>
                              <textarea rows={2} value={draft.deliveryAddress}
                                onChange={(e) => setDraftField(item.id, "deliveryAddress", e.target.value)}
                                className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-orange-300 resize-none" />
                            </div>
                            <div className="flex gap-2">
                              {(["collect", "ship"] as const).map((method) => (
                                <label key={method} className={cn(
                                  "flex-1 flex items-center gap-1.5 border rounded-lg px-3 py-2 cursor-pointer text-xs transition-colors",
                                  draft.collectionMethod === method
                                    ? method === "collect" ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-blue-500 bg-blue-50 text-blue-700"
                                    : "border-slate-200 hover:border-slate-400"
                                )}>
                                  <input type="radio" name={`edit-${item.id}`}
                                    checked={draft.collectionMethod === method}
                                    onChange={() => setDraftField(item.id, "collectionMethod", method)}
                                    className="hidden" />
                                  {method === "collect" ? <CheckCircle2 size={12} /> : <Truck size={12} />}
                                  {method === "collect" ? "Collected from Office" : "Request Shipment"}
                                </label>
                              ))}
                            </div>
                            {draft.collectionMethod === "collect" && (
                              <div className="flex items-center gap-2">
                                <label className="text-[11px] text-slate-500 w-28 shrink-0">Collected Date</label>
                                <input type="date" value={draft.collectedDate} max={todayISO()}
                                  onChange={(e) => setDraftField(item.id, "collectedDate", e.target.value)}
                                  className="border border-slate-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-orange-300" />
                              </div>
                            )}
                            <div className="flex items-center gap-2">
                              <label className="text-[11px] text-slate-500 w-28 shrink-0">Notes</label>
                              <input type="text" value={draft.notes}
                                onChange={(e) => setDraftField(item.id, "notes", e.target.value)}
                                placeholder="Optional"
                                className="flex-1 border border-slate-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-orange-300" />
                            </div>
                            <div className="flex gap-2 pt-1">
                              <button type="button" onClick={() => cancelEdit(item.id)}
                                className="flex-1 border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-lg py-2 text-xs font-medium transition-colors">
                                Cancel
                              </button>
                              <button type="button" onClick={() => applyEdit(item)}
                                disabled={!draft.collectionMethod}
                                className={cn(
                                  "flex-1 flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-medium transition-colors",
                                  draft.collectionMethod ? "bg-orange-500 hover:bg-orange-600 text-white" : "bg-orange-100 text-orange-300 cursor-not-allowed"
                                )}>
                                <Save size={12} /> Update
                              </button>
                            </div>
                            <button type="button" onClick={() => resetItem(item)}
                              className="w-full flex items-center justify-center gap-1.5 border border-red-300 text-red-600 hover:bg-red-50 rounded-lg py-2 text-xs font-medium transition-colors mt-1">
                              <RotateCcw size={11} /> Reset to Work in Progress (undo)
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </form>
        )}

        {/* ═══ IT DISPATCH TAB ════════════════════════════════════════════════ */}
        {tab === "itdispatch" && (
          <div className="p-5 space-y-4">

            {/* ── Step 1: Undispatched items (no itAction) ── */}
            {undispatchedItems.length > 0 ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide flex items-center gap-1.5">
                    <Package size={12} /> Step 1 — Select Items to Dispatch
                  </p>
                  <button type="button"
                    onClick={() => setItChecked(itChecked.size === undispatchedItems.length
                      ? new Set() : new Set(undispatchedItems.map((i) => i.id)))}
                    className="text-xs text-indigo-600 hover:text-indigo-800 font-medium">
                    {itChecked.size === undispatchedItems.length ? "Deselect All" : "Select All"}
                  </button>
                </div>
                {undispatchedItems.map((item) => (
                  <ItemCard key={item.id} item={item} checked={itChecked.has(item.id)} onClick={() => toggleIt(item.id)} />
                ))}
              </div>
            ) : (
              <div className="text-center py-4 text-green-600 flex flex-col items-center gap-1">
                <CheckCircle2 size={22} />
                <p className="text-sm font-medium">All items have been dispatched.</p>
              </div>
            )}

            {/* ── Step 2: Dispatch details ── */}
            {undispatchedItems.length > 0 && (
              <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 space-y-3">
                <p className="text-xs font-semibold text-indigo-700 uppercase tracking-wide flex items-center gap-1.5">
                  <Send size={12} /> Step 2 — Fill Dispatch Details
                </p>
                <div className="flex gap-2">
                  {([["ship_office", "Shipment from Office", Building2], ["ship_vendor", "Shipment via Vendor", Store]] as const).map(([val, label, Icon]) => (
                    <label key={val} className={cn(
                      "flex-1 flex items-center gap-2 border rounded-lg px-3 py-2.5 cursor-pointer text-sm transition-colors",
                      bulkShipType === val
                        ? val === "ship_office" ? "border-indigo-500 bg-white text-indigo-700 shadow-sm" : "border-violet-500 bg-white text-violet-700 shadow-sm"
                        : "border-indigo-200 bg-white/60 text-indigo-500 hover:bg-white"
                    )}>
                      <input type="radio" name="bulk-ship" value={val}
                        checked={bulkShipType === val} onChange={() => setBulkShipType(val)} className="hidden" />
                      <Icon size={15} /> {label}
                    </label>
                  ))}
                </div>
                <div className="grid sm:grid-cols-2 gap-3">
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-indigo-600 w-24 shrink-0 font-medium">Initiated Date</label>
                    <input type="date" value={bulkDate} max={todayISO()} onChange={(e) => setBulkDate(e.target.value)}
                      className="flex-1 border border-indigo-200 rounded-lg px-2 py-1.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300" />
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-indigo-600 w-24 shrink-0 font-medium">Initiated By</label>
                    <select value={bulkBy} onChange={(e) => setBulkBy(e.target.value)}
                      className="flex-1 border border-indigo-200 rounded-lg px-2 py-1.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300">
                      <option value="">— Select assignee —</option>
                      {assigneeOptions.map((n) => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-xs text-indigo-600 w-24 shrink-0 font-medium">Notes / Tracking</label>
                  <input type="text" value={bulkNotes} onChange={(e) => setBulkNotes(e.target.value)}
                    placeholder="Tracking ID, courier…"
                    className="flex-1 border border-indigo-200 rounded-lg px-2 py-1.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300" />
                </div>
              </div>
            )}

            {/* Errors / success */}
            {itErrors.length > 0 && (
              <ul className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 space-y-1">
                {itErrors.map((e, i) => <li key={i} className="text-xs text-red-600">&bull; {e}</li>)}
              </ul>
            )}
            {itSaved && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-xl px-4 py-3">
                  <CheckCircle2 size={16} /> IT Dispatch saved successfully!
                </div>
                <button type="button"
                  onClick={() => {
                    const last = dispatchedItems[0];
                    if (last?.itAction)
                      setEmailPayload(buildITDispatchEmail(request, dispatchedItems, last.itAction.shipmentType, last.itAction.initiatedDate, last.itAction.initiatedBy, last.itAction.notes ?? ""));
                  }}
                  className="w-full flex items-center justify-center gap-2 border border-indigo-200 bg-white hover:bg-indigo-50 text-indigo-700 font-medium rounded-xl py-2.5 text-sm transition-colors">
                  <Mail size={15} /> Send Shipment Notification Email
                </button>
              </div>
            )}

            {/* Save button */}
            {undispatchedItems.length > 0 && (
              <button type="button" onClick={handleITApply} disabled={itChecked.size === 0}
                className={cn(
                  "w-full font-semibold rounded-xl py-3 text-sm flex items-center justify-center gap-2 transition-colors shadow-sm",
                  itChecked.size > 0 ? "bg-indigo-600 hover:bg-indigo-700 text-white" : "bg-indigo-100 text-indigo-300 cursor-not-allowed"
                )}>
                <Save size={15} />
                {itChecked.size > 0
                  ? `Save IT Dispatch — ${itChecked.size} item${itChecked.size !== 1 ? "s" : ""} selected`
                  : "Select items above to save dispatch"}
              </button>
            )}

            {/* ── Already dispatched — read-only ── */}
            {dispatchedItems.length > 0 && (
              <div className="pt-2 border-t border-slate-100 space-y-2">
                <p className="text-xs font-semibold text-indigo-700 uppercase tracking-wide flex items-center gap-1.5">
                  <CheckCircle2 size={12} /> Dispatched ({dispatchedItems.length})
                </p>
                {dispatchedItems.map((item) => (
                  <div key={item.id} className="border border-indigo-100 bg-indigo-50/40 rounded-xl px-4 py-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-slate-800">{item.name}</p>
                        <p className="text-[11px] text-slate-400 font-mono mt-0.5">{item.ritm}</p>
                        <p className="text-[11px] text-slate-500 mt-1">Qty: {item.quantity} &bull; {deliveryLabel(item.deliveryMethod)}</p>
                      </div>
                      <span className={cn("text-[11px] font-medium px-1.5 py-0.5 rounded-full shrink-0", statusColor(item.state))}>
                        SN: {item.state}
                      </span>
                    </div>
                    {item.itAction && (
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
                        <span className={cn(
                          "inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-medium",
                          item.itAction.shipmentType === "ship_office" ? "bg-indigo-100 text-indigo-700" : "bg-violet-100 text-violet-700"
                        )}>
                          {item.itAction.shipmentType === "ship_office" ? <><Building2 size={10} /> Office</> : <><Store size={10} /> Vendor</>}
                        </span>
                        <span className="text-slate-500">
                          {formatDate(item.itAction.initiatedDate)} &bull; <strong>{item.itAction.initiatedBy}</strong>
                          {item.itAction.notes && <> &bull; {item.itAction.notes}</>}
                        </span>
                        <button type="button"
                          onClick={() => setEmailPayload(buildITDispatchEmail(request, [item], item.itAction!.shipmentType, item.itAction!.initiatedDate, item.itAction!.initiatedBy, item.itAction!.notes ?? ""))}
                          className="text-indigo-500 hover:text-indigo-700 underline flex items-center gap-0.5">
                          <Mail size={10} /> Email
                        </button>
                        <button type="button" onClick={() => resetItem(item)}
                          className="flex items-center gap-0.5 text-red-500 hover:text-red-700 border border-red-200 rounded px-1.5 py-0.5 bg-white">
                          <RotateCcw size={9} /> Reset
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* ── Closed Complete, no dispatch needed — info only ── */}
            {closedNoDispatch.length > 0 && (
              <div className="pt-2 border-t border-slate-100 space-y-2">
                <p className="text-xs font-semibold text-green-700 uppercase tracking-wide flex items-center gap-1.5">
                  <CheckCircle2 size={12} /> Closed in ServiceNow — no dispatch needed ({closedNoDispatch.length})
                </p>
                {closedNoDispatch.map((item) => (
                  <div key={item.id} className="border border-green-200 bg-green-50/40 rounded-xl px-4 py-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-slate-800">{item.name}</p>
                        <p className="text-[11px] text-slate-400 font-mono mt-0.5">{item.ritm}</p>
                        <p className="text-[11px] text-slate-500 mt-1">Qty: {item.quantity} &bull; {deliveryLabel(item.deliveryMethod)}</p>
                      </div>
                      <span className="text-[11px] font-medium px-1.5 py-0.5 rounded-full shrink-0 bg-green-100 text-green-700">
                        SN: Closed Complete
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
