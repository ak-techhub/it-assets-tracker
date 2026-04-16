"use client";
import { useState, useMemo } from "react";
import { AccessoryRequest, AccessoryItem, ITAction, ITShipmentType } from "@/lib/types";
import { formatDate, deliveryLabel, statusColor, cn } from "@/lib/utils";
import { updateRequest } from "@/lib/store";
import EmailNotificationModal, { EmailPayload } from "@/components/EmailNotificationModal";
import {
  CheckCircle2, Truck, Package, CalendarDays, User,
  MapPin, Hash, Building2, Store, Send, ClipboardList, Mail,
} from "lucide-react";

interface Props {
  request: AccessoryRequest;
  assigneeOptions: string[];
  onAcknowledged: () => void;
}

type Tab = "employee" | "itdispatch";

const todayISO = () => new Date().toISOString().slice(0, 10);

// ── Email template builders ──────────────────────────────────────────────────

function buildCollectionEmail(
  request: AccessoryRequest,
  actionedItems: AccessoryItem[],
  acknowledgedBy: string
): EmailPayload {
  const dateStr = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });

  const itemLines = actionedItems
    .map((i) => {
      const action = i.collectionMethod === "collect"
        ? `Collected from Office${i.collectedDate ? " on " + formatDate(i.collectedDate) : ""}`
        : "Shipment Requested";
      return `  • ${i.name} (${i.ritm}, Qty: ${i.quantity}) — ${action}`;
    })
    .join("\n");

  const body = `Dear ${request.employeeName},

This is to confirm that the following IT accessories have been acknowledged on ${dateStr}.

Employee    : ${request.employeeName}
Employee Type : ${request.employeeType}
Acknowledged By : ${acknowledgedBy}

ITEMS:
${itemLines}

If you have any questions, please reach out to the IT team.

Thank you,
IT Assets Team`;

  return {
    to: "",
    subject: `IT Assets — Acknowledgment Confirmation for ${request.employeeName}`,
    body,
  };
}

function buildITDispatchEmail(
  request: AccessoryRequest,
  dispatchedItems: AccessoryItem[],
  shipmentType: ITShipmentType,
  initiatedDate: string,
  initiatedBy: string,
  notes: string
): EmailPayload {
  const shipLabel = shipmentType === "ship_office" ? "Shipment from Office" : "Shipment via Vendor";

  const itemLines = dispatchedItems
    .map((i) => `  • ${i.name} (${i.ritm}, Qty: ${i.quantity})`)
    .join("\n");

  const body = `Dear ${request.employeeName},

We would like to inform you that your IT accessories have been dispatched.

Employee      : ${request.employeeName}
Employee Type : ${request.employeeType}
Shipment Type : ${shipLabel}
Initiated Date: ${formatDate(initiatedDate)}
Initiated By  : ${initiatedBy}${notes ? `\nNotes/Tracking: ${notes}` : ""}

ITEMS DISPATCHED:
${itemLines}

Please ensure you are available to receive the shipment. If you have any questions, contact the IT team.

Thank you,
IT Assets Team`;

  return {
    to: "",
    subject: `IT Assets — Shipment Initiated for ${request.employeeName}`,
    body,
  };
}

// ── Component ────────────────────────────────────────────────────────────────

export default function AcknowledgmentForm({ request, assigneeOptions, onAcknowledged }: Props) {
  const [tab, setTab] = useState<Tab>("employee");

  /* ── Employee tab ── */
  const [items, setItems] = useState<AccessoryItem[]>(() =>
    request.accessories.map((a) => ({ ...a }))
  );
  const [acknowledgedBy, setAcknowledgedBy] = useState("");
  const [empSaved, setEmpSaved] = useState(false);
  const [empErrors, setEmpErrors] = useState<string[]>([]);

  /* ── IT Dispatch tab ── */
  const [itChecked, setItChecked] = useState<Set<string>>(new Set());
  const [bulkShipType, setBulkShipType] = useState<ITShipmentType | "">("");
  const [bulkDate, setBulkDate] = useState(todayISO());
  const [bulkBy, setBulkBy] = useState("");
  const [bulkNotes, setBulkNotes] = useState("");
  const [itSaved, setItSaved] = useState(false);
  const [itErrors, setItErrors] = useState<string[]>([]);

  /* ── Email modal ── */
  const [emailPayload, setEmailPayload] = useState<EmailPayload | null>(null);

  const pendingItems = useMemo(() => items.filter((i) => i.status === "pending"), [items]);
  const doneItems    = useMemo(() => items.filter((i) => i.status !== "pending"), [items]);

  const setItemField = (id: string, field: keyof AccessoryItem, value: string) =>
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, [field]: value } : i)));

  const toggleItItem = (id: string) =>
    setItChecked((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const toggleAllIT = () =>
    setItChecked(itChecked.size === items.length ? new Set() : new Set(items.map((i) => i.id)));

  /* ── Employee submit ── */
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
    const updatedAccessories = items.map((item) => {
      if (item.status !== "pending" || !item.collectionMethod) return item;
      return {
        ...item,
        status: item.collectionMethod === "collect" ? ("collected" as const) : ("shipped" as const),
        acknowledgedAt: now,
        acknowledgedBy: acknowledgedBy.trim(),
      };
    });
    const updated: AccessoryRequest = {
      ...request,
      accessories: updatedAccessories,
    };
    const allDone = updated.accessories.every((i) => i.status !== "pending");
    const anyDone = updated.accessories.some((i) => i.status !== "pending");
    updated.status = allDone ? "fulfilled" : anyDone ? "partially_fulfilled" : "pending";

    updateRequest(updated);
    setItems(updatedAccessories);
    setEmpSaved(true);
    onAcknowledged();

    // Offer email notification
    const actionedItems = updatedAccessories.filter(
      (i) => i.acknowledgedAt === now
    );
    if (actionedItems.length > 0) {
      setEmailPayload(buildCollectionEmail(request, actionedItems, acknowledgedBy.trim()));
    }
  };

  /* ── IT Dispatch apply ── */
  const handleITApply = () => {
    const errs: string[] = [];
    if (itChecked.size === 0) errs.push("Select at least one item to dispatch.");
    if (!bulkShipType) errs.push("Select a shipment type (Office or Vendor).");
    if (!bulkBy) errs.push("Select who is initiating the dispatch.");
    if (errs.length > 0) { setItErrors(errs); return; }
    setItErrors([]);

    const action: ITAction = {
      shipmentType: bulkShipType as ITShipmentType,
      initiatedDate: bulkDate,
      initiatedBy: bulkBy,
      notes: bulkNotes.trim() || undefined,
    };

    const dispatchedItems = items.filter((i) => itChecked.has(i.id));
    const updatedAccessories = items.map((item) =>
      itChecked.has(item.id) ? { ...item, itAction: action } : item
    );
    const updated: AccessoryRequest = { ...request, accessories: updatedAccessories };

    updateRequest(updated);
    setItems(updatedAccessories);
    setItSaved(true);
    setItChecked(new Set());
    onAcknowledged();
    setTimeout(() => setItSaved(false), 3000);

    // Offer email notification
    setEmailPayload(buildITDispatchEmail(
      request, dispatchedItems,
      bulkShipType as ITShipmentType, bulkDate, bulkBy, bulkNotes
    ));
  };

  /* ── Shared info bar ── */
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
      {/* Email modal */}
      {emailPayload && (
        <EmailNotificationModal
          payload={emailPayload}
          onClose={() => setEmailPayload(null)}
        />
      )}

      <div>
        <InfoBar />

        {/* Tab bar */}
        <div className="flex border-b border-slate-200 bg-white">
          <button
            onClick={() => setTab("employee")}
            className={cn(
              "flex-1 py-3 text-sm font-medium flex items-center justify-center gap-2 border-b-2 transition-colors",
              tab === "employee"
                ? "border-indigo-500 text-indigo-700 bg-indigo-50/50"
                : "border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50"
            )}
          >
            <User size={15} /> Employee Acknowledgment
            {pendingItems.length > 0 && (
              <span className="ml-1 bg-amber-100 text-amber-700 text-[10px] font-semibold px-1.5 py-0.5 rounded-full">
                {pendingItems.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setTab("itdispatch")}
            className={cn(
              "flex-1 py-3 text-sm font-medium flex items-center justify-center gap-2 border-b-2 transition-colors",
              tab === "itdispatch"
                ? "border-indigo-500 text-indigo-700 bg-indigo-50/50"
                : "border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50"
            )}
          >
            <Send size={15} /> IT Dispatch
            {items.some((i) => i.itAction) && (
              <span className="ml-1 bg-indigo-100 text-indigo-700 text-[10px] font-semibold px-1.5 py-0.5 rounded-full">
                {items.filter((i) => i.itAction).length}
              </span>
            )}
          </button>
        </div>

        {/* ═══════════════ EMPLOYEE TAB ═══════════════ */}
        {tab === "employee" && (
          <form onSubmit={handleEmpSubmit} className="p-5 space-y-4">
            {pendingItems.length > 0 ? (
              <div className="space-y-3">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  Pending — select action for each
                </p>
                {items.filter((i) => i.status === "pending").map((item) => (
                  <div key={item.id} className="border border-slate-200 rounded-xl overflow-hidden bg-white">
                    <div className="px-4 pt-3 pb-2 flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-800 text-sm">{item.name}</p>
                        <p className="text-[11px] text-slate-400 font-mono mt-0.5">{item.ritm} &bull; {item.reqNumber}</p>
                        <div className="flex flex-wrap gap-2 mt-1 text-[11px] text-slate-500">
                          <span>Qty: {item.quantity}</span>
                          <span>&bull;</span>
                          <span><CalendarDays size={10} className="inline mr-0.5" />{formatDate(item.openedDate)}</span>
                        </div>
                      </div>
                      <span className={cn("text-[11px] font-medium px-2 py-0.5 rounded-full shrink-0", statusColor(item.state))}>
                        {item.state}
                      </span>
                    </div>

                    {item.deliveryAddress && (
                      <div className="mx-4 mb-2 flex items-start gap-1.5 bg-slate-50 rounded-lg p-2 text-[11px] text-slate-600">
                        <MapPin size={12} className="text-slate-400 mt-0.5 shrink-0" />
                        <span>
                          <span className="font-medium">{deliveryLabel(item.deliveryMethod)}:</span>{" "}
                          {item.deliveryAddress.split("\n").slice(0, 3).join(", ")}
                        </span>
                      </div>
                    )}

                    <div className="px-4 pb-3 space-y-2">
                      <div className="flex gap-2">
                        <label className={cn(
                          "flex-1 flex items-center gap-1.5 border rounded-lg px-3 py-2 cursor-pointer text-xs transition-colors",
                          item.collectionMethod === "collect"
                            ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                            : "border-slate-200 hover:border-emerald-300"
                        )}>
                          <input type="radio" name={`act-${item.id}`} value="collect"
                            checked={item.collectionMethod === "collect"}
                            onChange={() => setItemField(item.id, "collectionMethod", "collect")}
                            className="hidden" />
                          <CheckCircle2 size={13} /> Collected from Office
                        </label>
                        <label className={cn(
                          "flex-1 flex items-center gap-1.5 border rounded-lg px-3 py-2 cursor-pointer text-xs transition-colors",
                          item.collectionMethod === "ship"
                            ? "border-blue-500 bg-blue-50 text-blue-700"
                            : "border-slate-200 hover:border-blue-300"
                        )}>
                          <input type="radio" name={`act-${item.id}`} value="ship"
                            checked={item.collectionMethod === "ship"}
                            onChange={() => setItemField(item.id, "collectionMethod", "ship")}
                            className="hidden" />
                          <Truck size={13} /> Request Shipment
                        </label>
                      </div>

                      {item.collectionMethod === "collect" && (
                        <div className="flex items-center gap-2">
                          <label className="text-[11px] text-slate-500 w-28 shrink-0">Collected Date *</label>
                          <input type="date" value={item.collectedDate ?? ""}
                            max={todayISO()}
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
            ) : (
              !empSaved && (
                <div className="text-center py-8 text-green-600 flex flex-col items-center gap-2">
                  <CheckCircle2 size={32} />
                  <p className="font-medium text-sm">All accessories have been fulfilled!</p>
                </div>
              )
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
                  <div className="flex flex-col gap-2">
                    <div className="text-center py-3 text-green-700 bg-green-50 border border-green-200 rounded-xl flex items-center justify-center gap-2 text-sm font-medium">
                      <CheckCircle2 size={16} /> Acknowledgment saved!
                    </div>
                    <button
                      type="button"
                      onClick={() => setEmailPayload(buildCollectionEmail(request, doneItems, acknowledgedBy))}
                      className="w-full flex items-center justify-center gap-2 border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-medium rounded-xl py-2.5 text-sm transition-colors"
                    >
                      <Mail size={15} /> Send Collection Notification Email
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

            {/* Done items */}
            {doneItems.length > 0 && (
              <div className="pt-2 border-t border-slate-100">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs text-slate-400 font-medium uppercase tracking-wide">
                    Completed ({doneItems.length})
                  </p>
                  <button
                    type="button"
                    onClick={() => setEmailPayload(buildCollectionEmail(request, doneItems, acknowledgedBy || "IT Team"))}
                    className="flex items-center gap-1 text-xs text-indigo-500 hover:text-indigo-700"
                  >
                    <Mail size={12} /> Email summary
                  </button>
                </div>
                <div className="space-y-1.5">
                  {doneItems.map((item) => (
                    <div key={item.id} className="flex items-start justify-between bg-slate-50 border border-slate-100 rounded-lg px-3 py-2.5 gap-3 text-xs">
                      <div className="min-w-0">
                        <p className="font-medium text-slate-600 truncate">{item.name}</p>
                        <p className="text-slate-400 font-mono text-[10px] mt-0.5">{item.ritm} &bull; {item.reqNumber}</p>
                      </div>
                      <div className="text-right shrink-0 space-y-0.5">
                        <span className={cn("block font-medium px-1.5 py-0.5 rounded-full", statusColor(item.status))}>
                          {item.status}
                        </span>
                        {item.collectedDate && <p className="text-slate-400">{formatDate(item.collectedDate)}</p>}
                        {item.acknowledgedBy && (
                          <p className="text-slate-400 max-w-[140px] truncate">
                            {item.acknowledgedBy.startsWith("Auto-detected")
                              ? <span className="text-indigo-500">⚡ auto</span>
                              : <>by {item.acknowledgedBy}</>}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </form>
        )}

        {/* ═══════════════ IT DISPATCH TAB ═══════════════ */}
        {tab === "itdispatch" && (
          <div className="p-5 space-y-4">
            {/* Bulk action panel */}
            <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 space-y-3">
              <p className="text-xs font-semibold text-indigo-700 uppercase tracking-wide flex items-center gap-1.5">
                <Send size={12} /> IT Dispatch Action
              </p>
              <p className="text-xs text-indigo-500">Tick items below, fill in details, then click Apply.</p>

              <div className="flex gap-2">
                <label className={cn(
                  "flex-1 flex items-center gap-2 border rounded-lg px-3 py-2.5 cursor-pointer text-sm transition-colors",
                  bulkShipType === "ship_office"
                    ? "border-indigo-500 bg-white text-indigo-700 shadow-sm"
                    : "border-indigo-200 bg-white/60 text-indigo-500 hover:bg-white"
                )}>
                  <input type="radio" name="bulk-ship" value="ship_office"
                    checked={bulkShipType === "ship_office"}
                    onChange={() => setBulkShipType("ship_office")}
                    className="hidden" />
                  <Building2 size={15} /> Shipment from Office
                </label>
                <label className={cn(
                  "flex-1 flex items-center gap-2 border rounded-lg px-3 py-2.5 cursor-pointer text-sm transition-colors",
                  bulkShipType === "ship_vendor"
                    ? "border-violet-500 bg-white text-violet-700 shadow-sm"
                    : "border-indigo-200 bg-white/60 text-indigo-500 hover:bg-white"
                )}>
                  <input type="radio" name="bulk-ship" value="ship_vendor"
                    checked={bulkShipType === "ship_vendor"}
                    onChange={() => setBulkShipType("ship_vendor")}
                    className="hidden" />
                  <Store size={15} /> Shipment via Vendor
                </label>
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
                    {assigneeOptions.map((name) => (
                      <option key={name} value={name}>{name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <label className="text-xs text-indigo-600 w-24 shrink-0 font-medium">Notes</label>
                <input type="text" value={bulkNotes}
                  onChange={(e) => setBulkNotes(e.target.value)}
                  placeholder="Tracking ID, courier, remarks…"
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
                    <CheckCircle2 size={13} /> IT Dispatch saved successfully.
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const dispatched = items.filter((i) => i.itAction);
                      if (dispatched.length > 0 && dispatched[0].itAction) {
                        const a = dispatched[0].itAction;
                        setEmailPayload(buildITDispatchEmail(
                          request, dispatched, a.shipmentType, a.initiatedDate, a.initiatedBy, a.notes ?? ""
                        ));
                      }
                    }}
                    className="w-full flex items-center justify-center gap-2 border border-indigo-200 bg-white hover:bg-indigo-50 text-indigo-700 font-medium rounded-xl py-2.5 text-sm transition-colors"
                  >
                    <Mail size={15} /> Send Shipment Notification Email
                  </button>
                </div>
              )}

              <button
                type="button"
                onClick={handleITApply}
                disabled={itChecked.size === 0}
                className={cn(
                  "w-full font-medium rounded-xl py-2.5 text-sm transition-colors flex items-center justify-center gap-2",
                  itChecked.size > 0
                    ? "bg-indigo-600 hover:bg-indigo-700 text-white"
                    : "bg-indigo-100 text-indigo-300 cursor-not-allowed"
                )}
              >
                <Send size={14} />
                Apply &amp; Notify — {itChecked.size > 0
                  ? `${itChecked.size} item${itChecked.size !== 1 ? "s" : ""} selected`
                  : "select items below"}
              </button>
            </div>

            {/* Item checklist */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  All Items ({items.length})
                </p>
                <button type="button" onClick={toggleAllIT}
                  className="text-xs text-indigo-600 hover:text-indigo-800 font-medium">
                  {itChecked.size === items.length ? "Deselect All" : "Select All"}
                </button>
              </div>

              <div className="space-y-2">
                {items.map((item) => {
                  const checked = itChecked.has(item.id);
                  return (
                    <div
                      key={item.id}
                      onClick={() => toggleItItem(item.id)}
                      className={cn(
                        "flex items-start gap-3 border rounded-xl px-4 py-3 cursor-pointer transition-colors select-none",
                        checked
                          ? "border-indigo-400 bg-indigo-50"
                          : "border-slate-200 bg-white hover:border-indigo-200 hover:bg-indigo-50/30"
                      )}
                    >
                      {/* Checkbox */}
                      <div className={cn(
                        "w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 mt-0.5 transition-colors",
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
                            <p className="text-[11px] text-slate-400 font-mono mt-0.5">{item.ritm} &bull; {item.reqNumber}</p>
                          </div>
                          <div className="shrink-0 flex flex-col items-end gap-1">
                            <span className={cn("text-[11px] font-medium px-1.5 py-0.5 rounded-full", statusColor(item.status))}>
                              {item.status}
                            </span>
                            <span className={cn("text-[11px] font-medium px-1.5 py-0.5 rounded-full", statusColor(item.state))}>
                              {item.state}
                            </span>
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-3 mt-1.5 text-[11px] text-slate-500">
                          <span>Qty: {item.quantity}</span>
                          <span><CalendarDays size={10} className="inline mr-0.5" />{formatDate(item.openedDate)}</span>
                          <span>{deliveryLabel(item.deliveryMethod)}</span>
                        </div>

                        {item.itAction && (
                          <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
                            <span className={cn(
                              "inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-medium",
                              item.itAction.shipmentType === "ship_office"
                                ? "bg-indigo-100 text-indigo-700"
                                : "bg-violet-100 text-violet-700"
                            )}>
                              {item.itAction.shipmentType === "ship_office"
                                ? <><Building2 size={10} /> Office</>
                                : <><Store size={10} /> Vendor</>}
                            </span>
                            <span className="text-slate-400">
                              {formatDate(item.itAction.initiatedDate)} &bull; <strong>{item.itAction.initiatedBy}</strong>
                            </span>
                            {item.itAction.notes && <span className="text-indigo-400">{item.itAction.notes}</span>}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setEmailPayload(buildITDispatchEmail(
                                  request, [item],
                                  item.itAction!.shipmentType, item.itAction!.initiatedDate,
                                  item.itAction!.initiatedBy, item.itAction!.notes ?? ""
                                ));
                              }}
                              className="inline-flex items-center gap-0.5 text-indigo-500 hover:text-indigo-700 underline"
                            >
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
