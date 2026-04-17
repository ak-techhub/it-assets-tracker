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
  Mail, Pencil, X, Bell, Save,
} from "lucide-react";

interface Props {
  request: AccessoryRequest;
  assigneeOptions: string[];
  onAcknowledged: () => void;
}

type Tab = "employee" | "itdispatch";

const todayISO = () => new Date().toISOString().slice(0, 10);

// ── Email helpers ─────────────────────────────────────────────────────────────

function empEmail(name: string) { return findEmailByName(name); }

function buildReadyEmail(request: AccessoryRequest, items: AccessoryItem[]): EmailPayload {
  const lines = items.map((i) => `  • ${i.name} — Qty: ${i.quantity}`).join("\n");
  return {
    to: empEmail(request.employeeName),
    employeeName: request.employeeName,
    subject: `IT Assets — Your Accessories Are Ready for Collection`,
    body: `Dear ${request.employeeName},

We are pleased to inform you that the following IT accessories are now ready for collection at the office.

Employee : ${request.employeeName}

ITEMS READY:
${lines}

Please visit the IT desk at your earliest convenience to collect your accessories.
Bring this email or your employee ID for reference.

If you need the items shipped to your address instead, please reply to this email.

Thank you,
IT Assets Team`,
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
    body: `Dear ${request.employeeName},

This is to confirm that the following IT accessories have been acknowledged on ${dateStr}.

Employee        : ${request.employeeName}
Acknowledged By : ${acknowledgedBy}

ITEMS:
${lines}

If you have any questions, please reach out to the IT team.

Thank you,
IT Assets Team`,
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
    body: `Dear ${request.employeeName},

We would like to inform you that your IT accessories have been dispatched.

Employee      : ${request.employeeName}
Shipment Type : ${shipLabel}
Initiated Date: ${formatDate(initiatedDate)}
Initiated By  : ${initiatedBy}${notes ? `\nNotes/Tracking: ${notes}` : ""}

ITEMS DISPATCHED:
${lines}

Please ensure you are available to receive the shipment. If you have any questions, contact the IT team.

Thank you,
IT Assets Team`,
  };
}

// ── Per-item edit draft ───────────────────────────────────────────────────────

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

// ── Component ─────────────────────────────────────────────────────────────────

export default function AcknowledgmentForm({ request, assigneeOptions, onAcknowledged }: Props) {
  const [tab, setTab] = useState<Tab>("employee");

  /* ── Employee tab ── */
  const [items, setItems] = useState<AccessoryItem[]>(() =>
    request.accessories.map((a) => ({ ...a }))
  );
  // Per-item inline edit drafts (keyed by item id)
  const [editDrafts, setEditDrafts]   = useState<Record<string, EditDraft>>({});
  const [editingIds, setEditingIds]   = useState<Set<string>>(new Set());
  const [acknowledgedBy, setAcknowledgedBy] = useState("");
  const [empSaved, setEmpSaved]       = useState(false);
  const [empErrors, setEmpErrors]     = useState<string[]>([]);

  /* ── IT Dispatch tab ── */
  const [itChecked, setItChecked]     = useState<Set<string>>(new Set());
  const [bulkShipType, setBulkShipType] = useState<ITShipmentType | "">("");
  const [bulkDate, setBulkDate]       = useState(todayISO());
  const [bulkBy, setBulkBy]           = useState("");
  const [bulkNotes, setBulkNotes]     = useState("");
  const [itSaved, setItSaved]         = useState(false);
  const [itErrors, setItErrors]       = useState<string[]>([]);

  /* ── Email modal ── */
  const [emailPayload, setEmailPayload] = useState<EmailPayload | null>(null);

  const pendingItems = useMemo(() => items.filter((i) => i.status === "pending"), [items]);
  const doneItems    = useMemo(() => items.filter((i) => i.status !== "pending"), [items]);

  const setItemField = (id: string, field: keyof AccessoryItem, value: string) =>
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, [field]: value } : i)));

  // ── Inline edit helpers ──────────────────────────────────────────────────────
  const startEdit = (item: AccessoryItem) => {
    setEditDrafts((prev) => ({ ...prev, [item.id]: draftFrom(item) }));
    setEditingIds((prev) => new Set(prev).add(item.id));
  };

  const cancelEdit = (id: string) => {
    setEditingIds((prev) => { const s = new Set(prev); s.delete(id); return s; });
  };

  const setDraftField = (id: string, field: keyof EditDraft, value: string) =>
    setEditDrafts((prev) => ({ ...prev, [id]: { ...prev[id], [field]: value } }));

  const applyEdit = (item: AccessoryItem) => {
    const draft = editDrafts[item.id];
    if (!draft || !draft.collectionMethod) return;

    const updatedItem: AccessoryItem = {
      ...item,
      collectionMethod: draft.collectionMethod,
      collectedDate:    draft.collectedDate || undefined,
      deliveryAddress:  draft.deliveryAddress,
      notes:            draft.notes || undefined,
      status:           draft.collectionMethod === "collect" ? "collected" : "shipped",
    };
    const updatedList = items.map((i) => (i.id === item.id ? updatedItem : i));
    const allDone = updatedList.every((i) => i.status !== "pending");
    const anyDone = updatedList.some((i) => i.status !== "pending");
    const updatedReq: AccessoryRequest = {
      ...request,
      accessories: updatedList,
      status: allDone ? "fulfilled" : anyDone ? "partially_fulfilled" : "pending",
    };
    updateRequest(updatedReq);
    setItems(updatedList);
    cancelEdit(item.id);
    onAcknowledged();
  };

  // ── Employee submit ──────────────────────────────────────────────────────────
  const handleEmpSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const errs: string[] = [];
    const touched = items.filter((i) => i.status === "pending" && i.collectionMethod);
    if (touched.length === 0) errs.push("Select Collect or Ship for at least one item.");
    touched.forEach((i) => {
      if (i.collectionMethod === "collect" && !i.collectedDate)
        errs.push(`Set a collection date for "${i.name}".`);
    });
    if (!acknowledgedBy.trim()) errs.push("Enter your name or employee ID to acknowledge.");
    if (errs.length > 0) { setEmpErrors(errs); return; }
    setEmpErrors([]);

    const now = new Date().toISOString();
    const updated = items.map((item) => {
      if (item.status !== "pending" || !item.collectionMethod) return item;
      return {
        ...item,
        status: item.collectionMethod === "collect" ? ("collected" as const) : ("shipped" as const),
        acknowledgedAt: now,
        acknowledgedBy: acknowledgedBy.trim(),
      };
    });
    const updatedReq: AccessoryRequest = { ...request, accessories: updated };
    updatedReq.status = updated.every((i) => i.status !== "pending") ? "fulfilled"
      : updated.some((i) => i.status !== "pending") ? "partially_fulfilled" : "pending";

    updateRequest(updatedReq);
    setItems(updated);
    setEmpSaved(true);
    onAcknowledged();

    const actionedNow = updated.filter((i) => i.acknowledgedAt === now);
    if (actionedNow.length > 0)
      setEmailPayload(buildCollectionEmail(request, actionedNow, acknowledgedBy.trim()));
  };

  // ── IT Dispatch apply ────────────────────────────────────────────────────────
  const handleITApply = () => {
    const errs: string[] = [];
    if (itChecked.size === 0) errs.push("Select at least one item.");
    if (!bulkShipType) errs.push("Select shipment type.");
    if (!bulkBy) errs.push("Select who is initiating.");
    if (errs.length > 0) { setItErrors(errs); return; }
    setItErrors([]);

    const action: ITAction = {
      shipmentType:  bulkShipType as ITShipmentType,
      initiatedDate: bulkDate,
      initiatedBy:   bulkBy,
      notes:         bulkNotes.trim() || undefined,
    };
    const dispatched = items.filter((i) => itChecked.has(i.id));
    const updated    = items.map((i) => itChecked.has(i.id) ? { ...i, itAction: action } : i);
    updateRequest({ ...request, accessories: updated });
    setItems(updated);
    setItSaved(true);
    setItChecked(new Set());
    onAcknowledged();
    setTimeout(() => setItSaved(false), 3000);
    setEmailPayload(buildITDispatchEmail(request, dispatched, bulkShipType as ITShipmentType, bulkDate, bulkBy, bulkNotes));
  };

  const toggleItItem = (id: string) =>
    setItChecked((prev) => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });

  // ── Info bar ─────────────────────────────────────────────────────────────────
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
        <span>{request.accessories.length} item(s) &bull; {pendingItems.length} pending</span>
      </div>
    </div>
  );

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
            {pendingItems.length > 0 && (
              <span className="ml-1 bg-amber-100 text-amber-700 text-[10px] font-semibold px-1.5 py-0.5 rounded-full">
                {pendingItems.length}
              </span>
            )}
          </button>
          <button onClick={() => setTab("itdispatch")} className={cn(
            "flex-1 py-3 text-sm font-medium flex items-center justify-center gap-2 border-b-2 transition-colors",
            tab === "itdispatch" ? "border-indigo-500 text-indigo-700 bg-indigo-50/50"
              : "border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50"
          )}>
            <Send size={15} /> IT Dispatch
            {items.some((i) => i.itAction) && (
              <span className="ml-1 bg-indigo-100 text-indigo-700 text-[10px] font-semibold px-1.5 py-0.5 rounded-full">
                {items.filter((i) => i.itAction).length}
              </span>
            )}
          </button>
        </div>

        {/* ═══ EMPLOYEE TAB ═══ */}
        {tab === "employee" && (
          <form onSubmit={handleEmpSubmit} className="p-5 space-y-4">

            {/* Notify ready banner */}
            <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
              <Bell size={15} className="text-amber-500 shrink-0" />
              <p className="text-xs text-amber-800 flex-1">Notify the employee their accessories are ready before they collect.</p>
              <button type="button"
                onClick={() => setEmailPayload(buildReadyEmail(request, items))}
                className="flex items-center gap-1.5 text-xs font-medium text-amber-700 border border-amber-300 bg-white hover:bg-amber-50 rounded-lg px-3 py-1.5 whitespace-nowrap transition-colors">
                <Mail size={13} /> Notify Ready
              </button>
            </div>

            {/* Pending items */}
            {pendingItems.length > 0 && (
              <div className="space-y-3">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Pending — select action for each</p>
                {pendingItems.map((item) => (
                  <div key={item.id} className="border border-slate-200 rounded-xl overflow-hidden bg-white">
                    <div className="px-4 pt-3 pb-2 flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-800 text-sm">{item.name}</p>
                        <p className="text-[11px] text-slate-400 font-mono mt-0.5">{item.ritm} &bull; {item.reqNumber}</p>
                        <div className="flex flex-wrap gap-2 mt-1 text-[11px] text-slate-500">
                          <span>Qty: {item.quantity}</span>
                          <span>&bull; <CalendarDays size={10} className="inline mr-0.5" />{formatDate(item.openedDate)}</span>
                        </div>
                      </div>
                      <span className={cn("text-[11px] font-medium px-2 py-0.5 rounded-full shrink-0", statusColor(item.state))}>
                        {item.state}
                      </span>
                    </div>

                    <div className="mx-4 mb-2">
                      <p className="text-[11px] font-medium text-slate-500 mb-1">
                        <MapPin size={10} className="inline mr-1" />{deliveryLabel(item.deliveryMethod)}
                      </p>
                      <textarea rows={2} value={item.deliveryAddress ?? ""}
                        onChange={(e) => setItemField(item.id, "deliveryAddress", e.target.value)}
                        placeholder="Delivery address"
                        className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-none" />
                    </div>

                    <div className="px-4 pb-3 space-y-2">
                      <div className="flex gap-2">
                        {(["collect", "ship"] as const).map((method) => (
                          <label key={method} className={cn(
                            "flex-1 flex items-center gap-1.5 border rounded-lg px-3 py-2 cursor-pointer text-xs transition-colors",
                            item.collectionMethod === method
                              ? method === "collect" ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-blue-500 bg-blue-50 text-blue-700"
                              : method === "collect" ? "border-slate-200 hover:border-emerald-300" : "border-slate-200 hover:border-blue-300"
                          )}>
                            <input type="radio" name={`act-${item.id}`} value={method}
                              checked={item.collectionMethod === method}
                              onChange={() => setItemField(item.id, "collectionMethod", method)}
                              className="hidden" />
                            {method === "collect" ? <CheckCircle2 size={13} /> : <Truck size={13} />}
                            {method === "collect" ? "Collected from Office" : "Request Shipment"}
                          </label>
                        ))}
                      </div>
                      {item.collectionMethod === "collect" && (
                        <div className="flex items-center gap-2">
                          <label className="text-[11px] text-slate-500 w-28 shrink-0">Collected Date *</label>
                          <input type="date" value={item.collectedDate ?? ""} max={todayISO()}
                            onChange={(e) => setItemField(item.id, "collectedDate", e.target.value)}
                            className="border border-slate-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-300" />
                        </div>
                      )}
                      <div className="flex items-center gap-2">
                        <label className="text-[11px] text-slate-500 w-28 shrink-0">Notes</label>
                        <input type="text" value={item.notes ?? ""}
                          onChange={(e) => setItemField(item.id, "notes", e.target.value)}
                          placeholder="Optional"
                          className="flex-1 border border-slate-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-300" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {pendingItems.length === 0 && !empSaved && doneItems.length > 0 && (
              <div className="text-center py-6 text-green-600 flex flex-col items-center gap-2">
                <CheckCircle2 size={28} />
                <p className="font-medium text-sm">All accessories fulfilled!</p>
              </div>
            )}

            {pendingItems.length > 0 && (
              <>
                <div className="flex items-center gap-3">
                  <label className="text-sm font-medium text-slate-700 shrink-0">Acknowledged by *</label>
                  <input type="text" value={acknowledgedBy}
                    onChange={(e) => setAcknowledgedBy(e.target.value)}
                    placeholder="Your name or employee ID"
                    className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
                </div>
                {empErrors.length > 0 && (
                  <ul className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 space-y-1">
                    {empErrors.map((e, i) => <li key={i} className="text-xs text-red-600">&bull; {e}</li>)}
                  </ul>
                )}
                {empSaved ? (
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
                  <button type="submit"
                    className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-xl py-2.5 text-sm transition-colors">
                    Submit Acknowledgment
                  </button>
                )}
              </>
            )}

            {/* ── Completed items with inline Edit ── */}
            {doneItems.length > 0 && (
              <div className="pt-2 border-t border-slate-100">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs text-slate-400 font-medium uppercase tracking-wide">Completed ({doneItems.length})</p>
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
                        {/* Summary row */}
                        <div className="flex items-start justify-between px-3 py-2.5 gap-3 text-xs">
                          <div className="min-w-0">
                            <p className="font-medium text-slate-700">{item.name}</p>
                            <p className="text-slate-400 font-mono text-[10px] mt-0.5">{item.ritm}</p>
                            {item.deliveryAddress && !isEditing && (
                              <p className="text-[10px] text-slate-400 mt-0.5 max-w-[200px] truncate" title={item.deliveryAddress}>
                                <MapPin size={9} className="inline mr-0.5" />
                                {item.deliveryAddress.split("\n")[0]}
                              </p>
                            )}
                          </div>
                          <div className="text-right shrink-0 space-y-1">
                            <span className={cn("block font-medium px-1.5 py-0.5 rounded-full", statusColor(item.status))}>
                              {item.status}
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

                        {/* Inline edit panel */}
                        {isEditing && draft && (
                          <div className="border-t border-orange-200 px-3 py-3 space-y-2 bg-white">
                            <p className="text-[11px] font-semibold text-orange-600 uppercase tracking-wide flex items-center gap-1">
                              <Pencil size={10} /> Edit — {item.name}
                            </p>

                            {/* Delivery address */}
                            <div>
                              <label className="text-[11px] text-slate-500 block mb-1">
                                <MapPin size={9} className="inline mr-1" />{deliveryLabel(item.deliveryMethod)}
                              </label>
                              <textarea rows={2} value={draft.deliveryAddress}
                                onChange={(e) => setDraftField(item.id, "deliveryAddress", e.target.value)}
                                className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-orange-300 resize-none" />
                            </div>

                            {/* Action */}
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
                                  draft.collectionMethod
                                    ? "bg-orange-500 hover:bg-orange-600 text-white"
                                    : "bg-orange-100 text-orange-300 cursor-not-allowed"
                                )}>
                                <Save size={12} /> Update
                              </button>
                            </div>
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

        {/* ═══ IT DISPATCH TAB ═══ */}
        {tab === "itdispatch" && (
          <div className="p-5 space-y-4">
            <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 space-y-3">
              <p className="text-xs font-semibold text-indigo-700 uppercase tracking-wide flex items-center gap-1.5">
                <Send size={12} /> IT Dispatch Action
              </p>
              <p className="text-xs text-indigo-500">Tick items below, fill in details, then click Apply.</p>

              <div className="flex gap-2">
                {([["ship_office", "Shipment from Office", Building2], ["ship_vendor", "Shipment via Vendor", Store]] as const).map(([val, label, Icon]) => (
                  <label key={val} className={cn(
                    "flex-1 flex items-center gap-2 border rounded-lg px-3 py-2.5 cursor-pointer text-sm transition-colors",
                    bulkShipType === val
                      ? val === "ship_office" ? "border-indigo-500 bg-white text-indigo-700 shadow-sm" : "border-violet-500 bg-white text-violet-700 shadow-sm"
                      : "border-indigo-200 bg-white/60 text-indigo-500 hover:bg-white"
                  )}>
                    <input type="radio" name="bulk-ship" value={val}
                      checked={bulkShipType === val}
                      onChange={() => setBulkShipType(val)} className="hidden" />
                    <Icon size={15} /> {label}
                  </label>
                ))}
              </div>

              <div className="grid sm:grid-cols-2 gap-3">
                <div className="flex items-center gap-2">
                  <label className="text-xs text-indigo-600 w-24 shrink-0 font-medium">Initiated Date</label>
                  <input type="date" value={bulkDate} max={todayISO()}
                    onChange={(e) => setBulkDate(e.target.value)}
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
                <label className="text-xs text-indigo-600 w-24 shrink-0 font-medium">Notes</label>
                <input type="text" value={bulkNotes} onChange={(e) => setBulkNotes(e.target.value)}
                  placeholder="Tracking ID, courier…"
                  className="flex-1 border border-indigo-200 rounded-lg px-2 py-1.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300" />
              </div>

              {itErrors.length > 0 && (
                <ul className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 space-y-1">
                  {itErrors.map((e, i) => <li key={i} className="text-xs text-red-600">&bull; {e}</li>)}
                </ul>
              )}
              {itSaved && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                    <CheckCircle2 size={13} /> IT Dispatch saved.
                  </div>
                  <button type="button"
                    onClick={() => {
                      const d = items.filter((i) => i.itAction);
                      if (d.length && d[0].itAction) {
                        const a = d[0].itAction;
                        setEmailPayload(buildITDispatchEmail(request, d, a.shipmentType, a.initiatedDate, a.initiatedBy, a.notes ?? ""));
                      }
                    }}
                    className="w-full flex items-center justify-center gap-2 border border-indigo-200 bg-white hover:bg-indigo-50 text-indigo-700 font-medium rounded-xl py-2.5 text-sm transition-colors">
                    <Mail size={15} /> Send Shipment Notification Email
                  </button>
                </div>
              )}

              <button type="button" onClick={handleITApply} disabled={itChecked.size === 0}
                className={cn(
                  "w-full font-medium rounded-xl py-2.5 text-sm flex items-center justify-center gap-2 transition-colors",
                  itChecked.size > 0 ? "bg-indigo-600 hover:bg-indigo-700 text-white" : "bg-indigo-100 text-indigo-300 cursor-not-allowed"
                )}>
                <Send size={14} />
                Apply — {itChecked.size > 0 ? `${itChecked.size} item${itChecked.size !== 1 ? "s" : ""} selected` : "select items below"}
              </button>
            </div>

            {/* Item checklist */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">All Items ({items.length})</p>
                <button type="button"
                  onClick={() => setItChecked(itChecked.size === items.length ? new Set() : new Set(items.map((i) => i.id)))}
                  className="text-xs text-indigo-600 hover:text-indigo-800 font-medium">
                  {itChecked.size === items.length ? "Deselect All" : "Select All"}
                </button>
              </div>
              <div className="space-y-2">
                {items.map((item) => {
                  const checked = itChecked.has(item.id);
                  return (
                    <div key={item.id} onClick={() => toggleItItem(item.id)}
                      className={cn(
                        "flex items-start gap-3 border rounded-xl px-4 py-3 cursor-pointer transition-colors select-none",
                        checked ? "border-indigo-400 bg-indigo-50" : "border-slate-200 bg-white hover:border-indigo-200"
                      )}>
                      <div className={cn(
                        "w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 mt-0.5",
                        checked ? "border-indigo-500 bg-indigo-500" : "border-slate-300"
                      )}>
                        {checked && (
                          <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 12 12">
                            <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="text-sm font-semibold text-slate-800">{item.name}</p>
                            <p className="text-[11px] text-slate-400 font-mono mt-0.5">{item.ritm}</p>
                          </div>
                          <div className="shrink-0 flex flex-col items-end gap-1">
                            <span className={cn("text-[11px] font-medium px-1.5 py-0.5 rounded-full", statusColor(item.status))}>{item.status}</span>
                            <span className={cn("text-[11px] font-medium px-1.5 py-0.5 rounded-full", statusColor(item.state))}>{item.state}</span>
                          </div>
                        </div>
                        <p className="text-[11px] text-slate-500 mt-1">Qty: {item.quantity} &bull; {deliveryLabel(item.deliveryMethod)}</p>
                        {item.itAction && (
                          <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
                            <span className={cn(
                              "inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-medium",
                              item.itAction.shipmentType === "ship_office" ? "bg-indigo-100 text-indigo-700" : "bg-violet-100 text-violet-700"
                            )}>
                              {item.itAction.shipmentType === "ship_office" ? <><Building2 size={10} /> Office</> : <><Store size={10} /> Vendor</>}
                            </span>
                            <span className="text-slate-400">{formatDate(item.itAction.initiatedDate)} &bull; <strong>{item.itAction.initiatedBy}</strong></span>
                            <button type="button"
                              onClick={(e) => { e.stopPropagation(); setEmailPayload(buildITDispatchEmail(request, [item], item.itAction!.shipmentType, item.itAction!.initiatedDate, item.itAction!.initiatedBy, item.itAction!.notes ?? "")); }}
                              className="text-indigo-500 hover:text-indigo-700 underline flex items-center gap-0.5">
                              <Mail size={10} /> Email
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
