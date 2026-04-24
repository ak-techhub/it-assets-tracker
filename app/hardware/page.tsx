"use client";
import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  Upload, Search, X, AlertTriangle, CheckCircle2, Clock,
  Laptop, RotateCcw, Archive, ShieldAlert, Trash2,
  ChevronDown, Download, RefreshCw, Filter, Heart, Undo2,
  Truck, Users,
} from "lucide-react";
import * as XLSX from "xlsx";
import {
  getHardwareAssets, saveHardwareAssets, updateHardwareAsset,
  clearHardwareAssets, parseAndMergeHardware, getBStockAlerts,
  getWarningAssets, daysSince, daysUntil,
} from "@/lib/hardware";
import {
  HardwareAsset, HardwareStatus, HardwareSubstatus,
  ReturnMethod, ReturnCondition,
} from "@/lib/types";
import { cn } from "@/lib/utils";

// ── constants ──────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<HardwareStatus, string> = {
  "Active":           "bg-green-100 text-green-800",
  "Refresh Pending":  "bg-orange-100 text-orange-800",
  "Legal Hold":       "bg-red-100 text-red-800",
  "B Stock":          "bg-purple-100 text-purple-800",
  "Returned":         "bg-blue-100 text-blue-700",
  "Donated":          "bg-pink-100 text-pink-700",
  "Decommissioned":   "bg-slate-200 text-slate-500",
};

const RETURN_METHOD_LABELS: Record<ReturnMethod, string> = {
  courier: "📦 Via Courier",
  direct:  "🤝 Direct / In-Person",
};

const CONDITION_LABELS: Record<ReturnCondition, string> = {
  good:       "✅ Good",
  damaged:    "⚠️ Damaged",
  parts_only: "🔧 Parts Only",
};

// ── helpers ────────────────────────────────────────────────────────────────

function fmtDate(iso?: string) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function WarrantyBadge({ expiry }: { expiry: string }) {
  if (!expiry) return <span className="text-slate-400 text-xs">—</span>;
  const days = daysUntil(expiry);
  if (days < 0)   return <span className="text-xs font-medium text-red-600 bg-red-50 px-2 py-0.5 rounded-full">Expired {Math.abs(days)}d ago</span>;
  if (days <= 30) return <span className="text-xs font-medium text-orange-600 bg-orange-50 px-2 py-0.5 rounded-full">Expires in {days}d</span>;
  if (days <= 90) return <span className="text-xs font-medium text-yellow-700 bg-yellow-50 px-2 py-0.5 rounded-full">Expires in {days}d</span>;
  return <span className="text-xs text-slate-500">{fmtDate(expiry)}</span>;
}

// ── Action types ───────────────────────────────────────────────────────────

type ActionType = "refresh" | "legalhold" | "bstock" | "returned" | "donate" | "decommission" | "reset";

const ACTION_META: Record<ActionType, { title: string; icon: React.ElementType; color: string; desc: string }> = {
  refresh:      { title: "Submit for Refresh",   icon: RotateCcw,    color: "#FF4A1C", desc: "Mark laptop as submitted for refresh (warranty expired / scheduled)." },
  legalhold:    { title: "Move to Legal Hold",    icon: ShieldAlert,  color: "#DC2626", desc: "Place on legal hold (e.g. employee resigned). Auto-reminder after 45 days." },
  bstock:       { title: "Move to B Stock",       icon: Archive,      color: "#7C3AED", desc: "Transfer to B Stock after legal hold period is complete." },
  returned:     { title: "Mark as Returned",      icon: CheckCircle2, color: "#0284C7", desc: "Record that this laptop has been physically returned to IT." },
  donate:       { title: "Mark as Donated",       icon: Heart,        color: "#DB2777", desc: "Record this laptop as donated to an organisation or individual." },
  decommission: { title: "Decommission",          icon: Trash2,       color: "#64748B", desc: "Permanently decommission this device from the asset register." },
  reset:        { title: "Reset / Undo",          icon: Undo2,        color: "#1B2A4A", desc: "Undo the last action and reset this device back to Active status, clearing workflow dates." },
};

// ── Action Modal ───────────────────────────────────────────────────────────

interface ActionModalProps {
  asset: HardwareAsset;
  action: ActionType;
  onConfirm: (asset: HardwareAsset, action: ActionType, data: ActionFormData) => void;
  onClose: () => void;
}

interface ActionFormData {
  notes: string;
  returnMethod?: ReturnMethod;
  returnCondition?: ReturnCondition;
  returnDate?: string;
  donatedTo?: string;
  donatedDate?: string;
}

function ActionModal({ asset, action, onConfirm, onClose }: ActionModalProps) {
  const meta = ACTION_META[action];
  const Icon = meta.icon;
  const today = new Date().toISOString().split("T")[0];

  const [notes,           setNotes]           = useState("");
  const [returnMethod,    setReturnMethod]     = useState<ReturnMethod>("direct");
  const [returnCondition, setReturnCondition]  = useState<ReturnCondition>("good");
  const [returnDate,      setReturnDate]       = useState(today);
  const [donatedTo,       setDonatedTo]        = useState("");
  const [donatedDate,     setDonatedDate]      = useState(today);

  const submit = () =>
    onConfirm(asset, action, {
      notes,
      returnMethod:    action === "returned" ? returnMethod    : undefined,
      returnCondition: action === "returned" ? returnCondition : undefined,
      returnDate:      action === "returned" ? returnDate      : undefined,
      donatedTo:       action === "donate"   ? donatedTo       : undefined,
      donatedDate:     action === "donate"   ? donatedDate     : undefined,
    });

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">

        {/* Header */}
        <div className="px-6 py-4 flex items-center gap-3" style={{ background: "#1B2A4A" }}>
          <div className="p-2 rounded-full shrink-0" style={{ background: meta.color }}>
            <Icon size={18} className="text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-white font-bold text-base">{meta.title}</h2>
            <p className="text-slate-300 text-xs mt-0.5 truncate">{asset.userName} · {asset.serialNo}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white shrink-0"><X size={16} /></button>
        </div>

        <div className="px-6 py-5 space-y-4 max-h-[70vh] overflow-y-auto">
          <p className="text-sm text-slate-600">{meta.desc}</p>

          {/* ── Returned: extra fields ── */}
          {action === "returned" && (
            <>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-2">Return Method *</label>
                <div className="grid grid-cols-2 gap-2">
                  {(["direct", "courier"] as ReturnMethod[]).map((m) => (
                    <button key={m} type="button" onClick={() => setReturnMethod(m)}
                      className="flex items-center gap-2 px-4 py-3 rounded-xl border-2 text-sm font-medium transition-all"
                      style={returnMethod === m
                        ? { borderColor: "#0284C7", background: "#EFF6FF", color: "#0284C7" }
                        : { borderColor: "#e2e8f0", color: "#64748b" }}>
                      {m === "direct" ? <Users size={16} /> : <Truck size={16} />}
                      {m === "direct" ? "Direct / In-Person" : "Via Courier"}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-2">Device Condition *</label>
                <div className="grid grid-cols-3 gap-2">
                  {(["good", "damaged", "parts_only"] as ReturnCondition[]).map((c) => (
                    <button key={c} type="button" onClick={() => setReturnCondition(c)}
                      className="px-3 py-2 rounded-xl border-2 text-xs font-medium transition-all text-center"
                      style={returnCondition === c
                        ? { borderColor: "#0284C7", background: "#EFF6FF", color: "#0284C7" }
                        : { borderColor: "#e2e8f0", color: "#64748b" }}>
                      {CONDITION_LABELS[c]}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Return Date *</label>
                <input type="date" value={returnDate} onChange={(e) => setReturnDate(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2"
                  style={{ "--tw-ring-color": "#0284C7" } as React.CSSProperties} />
              </div>
            </>
          )}

          {/* ── Donate: extra fields ── */}
          {action === "donate" && (
            <>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Donated To *</label>
                <input type="text" value={donatedTo} onChange={(e) => setDonatedTo(e.target.value)}
                  placeholder="Organisation / person name"
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2"
                  style={{ "--tw-ring-color": "#DB2777" } as React.CSSProperties} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Donation Date *</label>
                <input type="date" value={donatedDate} onChange={(e) => setDonatedDate(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2"
                  style={{ "--tw-ring-color": "#DB2777" } as React.CSSProperties} />
              </div>
            </>
          )}

          {/* ── Reset: show what will be cleared ── */}
          {action === "reset" && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-800 space-y-1">
              <p className="font-semibold">This will reset the device to <strong>Active</strong> and clear:</p>
              <ul className="list-disc list-inside space-y-0.5">
                {asset.legalHoldDate    && <li>Legal hold date ({fmtDate(asset.legalHoldDate)})</li>}
                {asset.bStockDate       && <li>B Stock date ({fmtDate(asset.bStockDate)})</li>}
                {asset.refreshRequestDate && <li>Refresh request date ({fmtDate(asset.refreshRequestDate)})</li>}
                {asset.returnDate       && <li>Return date ({fmtDate(asset.returnDate)})</li>}
                {asset.donatedDate      && <li>Donation date ({fmtDate(asset.donatedDate)})</li>}
              </ul>
            </div>
          )}

          {/* Notes / Comments — always shown */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">
              {action === "returned" ? "Return Comments" : action === "donate" ? "Donation Notes" : "Notes (optional)"}
            </label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3}
              placeholder={
                action === "returned" ? "Condition details, accessories included, remarks…"
                : action === "donate" ? "Purpose, recipient details, any conditions…"
                : "Any relevant notes…"
              }
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2"
              style={{ "--tw-ring-color": meta.color } as React.CSSProperties} />
          </div>
        </div>

        <div className="px-6 pb-6 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm text-slate-600 bg-slate-100 hover:bg-slate-200">Cancel</button>
          <button onClick={submit}
            disabled={action === "donate" && !donatedTo.trim()}
            className="px-5 py-2 rounded-lg text-sm font-bold text-white hover:opacity-90 active:scale-95 transition-all disabled:opacity-40"
            style={{ background: meta.color }}>
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Row Actions dropdown ───────────────────────────────────────────────────

function ActionsMenu({ asset, onAction }: {
  asset: HardwareAsset;
  onAction: (asset: HardwareAsset, action: ActionType) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const items: { label: string; act: ActionType; show: boolean }[] = [
    { label: "Submit for Refresh",  act: "refresh"      as ActionType, show: asset.status === "Active" },
    { label: "Move to Legal Hold",  act: "legalhold"    as ActionType, show: asset.status === "Active" || asset.status === "Refresh Pending" },
    { label: "Move to B Stock",     act: "bstock"       as ActionType, show: asset.status === "Legal Hold" },
    { label: "Mark as Returned",    act: "returned"     as ActionType, show: !["Decommissioned"].includes(asset.status) },
    { label: "Mark as Donated",     act: "donate"       as ActionType, show: !["Decommissioned"].includes(asset.status) },
    { label: "Reset to Active",     act: "reset"        as ActionType, show: asset.status !== "Active" && asset.status !== "Decommissioned" },
    { label: "Decommission",        act: "decommission" as ActionType, show: asset.status !== "Decommissioned" },
  ].filter((a) => a.show);

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((p) => !p)}
        className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-200 hover:border-slate-300 bg-white hover:bg-slate-50 transition-colors">
        Actions <ChevronDown size={12} />
      </button>
      {open && (
        <ul className="absolute right-0 top-9 z-30 w-52 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden">
          {items.map(({ label, act }) => (
            <li key={act}>
              <button onClick={() => { setOpen(false); onAction(asset, act); }}
                className={cn(
                  "w-full text-left px-4 py-2.5 text-sm transition-colors border-b border-slate-50 last:border-0",
                  act === "reset"        ? "text-amber-700 hover:bg-amber-50" :
                  act === "decommission" ? "text-red-600 hover:bg-red-50" :
                  act === "donate"       ? "text-pink-600 hover:bg-pink-50" :
                  act === "returned"     ? "text-blue-600 hover:bg-blue-50" :
                  "hover:bg-orange-50 hover:text-orange-700"
                )}>
                {label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Received Laptops panel ─────────────────────────────────────────────────

function ReceivedPanel({ assets }: { assets: HardwareAsset[] }) {
  const returned = assets.filter((a) => a.status === "Returned" && a.returnDate);
  const courier  = returned.filter((a) => a.returnMethod === "courier");
  const direct   = returned.filter((a) => a.returnMethod !== "courier"); // direct or undefined
  const courierPrimary   = courier.filter((a) => a.substatus === "Primary").length;
  const courierSecondary = courier.filter((a) => a.substatus === "Secondary").length;
  const directPrimary    = direct.filter((a)  => a.substatus === "Primary").length;
  const directSecondary  = direct.filter((a)  => a.substatus === "Secondary").length;
  const donated  = assets.filter((a) => a.status === "Donated");

  if (returned.length === 0 && donated.length === 0) return null;

  return (
    <div className="space-y-4">
      {/* Received summary */}
      {returned.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2" style={{ background: "#EFF6FF" }}>
            <CheckCircle2 size={16} className="text-blue-600" />
            <h3 className="text-sm font-bold text-blue-800">Received Laptops — {returned.length} total</h3>
          </div>
          <div className="p-5 grid grid-cols-2 sm:grid-cols-4 gap-3 border-b border-slate-100">
            {[
              { label: "Via Courier",         value: courier.length,       color: "#0284C7", bg: "#EFF6FF" },
              { label: "Direct / In-Person",  value: direct.length,        color: "#0369A1", bg: "#E0F2FE" },
              { label: "Primary Returned",    value: (courierPrimary + directPrimary),   color: "#FF4A1C", bg: "#FFF2EE" },
              { label: "Secondary Returned",  value: (courierSecondary + directSecondary), color: "#8BA3B8", bg: "#F1F5F9" },
            ].map(({ label, value, color, bg }) => (
              <div key={label} className="rounded-xl px-4 py-3 text-center" style={{ background: bg }}>
                <p className="text-2xl font-extrabold" style={{ color }}>{value}</p>
                <p className="text-xs mt-0.5" style={{ color, opacity: 0.75 }}>{label}</p>
              </div>
            ))}
          </div>
          {/* Breakdown table */}
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-slate-500 text-left">
                <tr>
                  <th className="px-4 py-2 font-medium">User</th>
                  <th className="px-4 py-2 font-medium">Serial No</th>
                  <th className="px-4 py-2 font-medium">Model</th>
                  <th className="px-4 py-2 font-medium">Substatus</th>
                  <th className="px-4 py-2 font-medium">Return Date</th>
                  <th className="px-4 py-2 font-medium">Method</th>
                  <th className="px-4 py-2 font-medium">Condition</th>
                  <th className="px-4 py-2 font-medium">Comments</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {returned.map((a) => (
                  <tr key={a.id} className="hover:bg-blue-50/30">
                    <td className="px-4 py-2 font-medium text-slate-700">{a.userName}</td>
                    <td className="px-4 py-2 font-mono text-slate-500">{a.serialNo}</td>
                    <td className="px-4 py-2 text-slate-600">{a.laptopModel || "—"}</td>
                    <td className="px-4 py-2">
                      <span className={cn("text-[11px] font-medium px-2 py-0.5 rounded-full",
                        a.substatus === "Primary" ? "bg-orange-50 text-orange-700" : "bg-slate-100 text-slate-600")}>
                        {a.substatus}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-slate-500">{fmtDate(a.returnDate)}</td>
                    <td className="px-4 py-2">
                      <span className={cn("text-[11px] font-medium px-2 py-0.5 rounded-full",
                        a.returnMethod === "courier" ? "bg-blue-50 text-blue-700" : "bg-green-50 text-green-700")}>
                        {a.returnMethod === "courier" ? "Courier" : "Direct"}
                      </span>
                    </td>
                    <td className="px-4 py-2">
                      {a.returnCondition && (
                        <span className={cn("text-[11px] font-medium px-2 py-0.5 rounded-full",
                          a.returnCondition === "good" ? "bg-green-50 text-green-700" :
                          a.returnCondition === "damaged" ? "bg-red-50 text-red-600" : "bg-yellow-50 text-yellow-700")}>
                          {CONDITION_LABELS[a.returnCondition]}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-slate-500 max-w-[160px] truncate" title={a.returnComments}>{a.returnComments || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Courier vs Direct per substatus breakdown */}
          <div className="px-5 py-3 bg-slate-50 border-t border-slate-100 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs text-center">
            {[
              { label: "Courier — Primary",   value: courierPrimary,   col: "#0284C7" },
              { label: "Courier — Secondary", value: courierSecondary, col: "#0284C7" },
              { label: "Direct — Primary",    value: directPrimary,    col: "#16a34a" },
              { label: "Direct — Secondary",  value: directSecondary,  col: "#16a34a" },
            ].map(({ label, value, col }) => (
              <div key={label} className="bg-white rounded-lg border border-slate-200 px-3 py-2">
                <p className="font-bold text-base" style={{ color: col }}>{value}</p>
                <p className="text-slate-500 mt-0.5">{label}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Donated laptops */}
      {donated.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2" style={{ background: "#FDF2F8" }}>
            <Heart size={16} className="text-pink-600" />
            <h3 className="text-sm font-bold text-pink-800">Donated Laptops — {donated.length} total</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-slate-500 text-left">
                <tr>
                  <th className="px-4 py-2 font-medium">User</th>
                  <th className="px-4 py-2 font-medium">Serial No</th>
                  <th className="px-4 py-2 font-medium">Model</th>
                  <th className="px-4 py-2 font-medium">Substatus</th>
                  <th className="px-4 py-2 font-medium">Donated To</th>
                  <th className="px-4 py-2 font-medium">Donation Date</th>
                  <th className="px-4 py-2 font-medium">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {donated.map((a) => (
                  <tr key={a.id} className="hover:bg-pink-50/30">
                    <td className="px-4 py-2 font-medium text-slate-700">{a.userName}</td>
                    <td className="px-4 py-2 font-mono text-slate-500">{a.serialNo}</td>
                    <td className="px-4 py-2 text-slate-600">{a.laptopModel || "—"}</td>
                    <td className="px-4 py-2">
                      <span className={cn("text-[11px] font-medium px-2 py-0.5 rounded-full",
                        a.substatus === "Primary" ? "bg-orange-50 text-orange-700" : "bg-slate-100 text-slate-600")}>
                        {a.substatus}
                      </span>
                    </td>
                    <td className="px-4 py-2 font-medium text-pink-700">{a.donatedTo || "—"}</td>
                    <td className="px-4 py-2 text-slate-500">{fmtDate(a.donatedDate)}</td>
                    <td className="px-4 py-2 text-slate-500 max-w-[160px] truncate" title={a.donatedComments}>{a.donatedComments || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────

export default function HardwarePage() {
  const [assets, setAssets]           = useState<HardwareAsset[]>([]);
  const [search, setSearch]           = useState("");
  const [statusFilter, setStatusFilter] = useState<HardwareStatus | "All">("All");
  const [subFilter, setSubFilter]     = useState<HardwareSubstatus | "All">("All");
  const [importing, setImporting]     = useState(false);
  const [importMsg, setImportMsg]     = useState<string | null>(null);
  const [modal, setModal]             = useState<{ asset: HardwareAsset; action: ActionType } | null>(null);
  const [dismissedAlerts, setDismissedAlerts] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab]     = useState<"all" | "received" | "donated">("all");
  const fileRef = useRef<HTMLInputElement>(null);

  const reload = useCallback(() => setAssets(getHardwareAssets()), []);
  useEffect(() => { reload(); }, [reload]);

  // ── Import ──────────────────────────────────────────────────────────────
  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true); setImportMsg(null);
    const buf = await file.arrayBuffer();
    const result = parseAndMergeHardware(buf);
    setImportMsg(`✅ Imported: ${result.added} added, ${result.updated} updated, ${result.skipped} skipped — ${result.total} total assets`);
    reload();
    setImporting(false);
    if (fileRef.current) fileRef.current.value = "";
  };

  // ── Apply action ─────────────────────────────────────────────────────────
  const applyAction = (asset: HardwareAsset, action: ActionType, data: ActionFormData) => {
    const now = new Date().toISOString();
    const updated: HardwareAsset = { ...asset, lastUpdated: now };

    switch (action) {
      case "refresh":
        updated.status = "Refresh Pending";
        updated.refreshRequestDate = now;
        updated.refreshNotes = data.notes || undefined;
        break;
      case "legalhold":
        updated.status = "Legal Hold";
        updated.legalHoldDate = now;
        updated.legalHoldReason = "resigned";
        updated.bStockAlertDismissed = false;
        updated.notes = data.notes || asset.notes;
        break;
      case "bstock":
        updated.status = "B Stock";
        updated.bStockDate = now;
        updated.notes = data.notes || asset.notes;
        break;
      case "returned":
        updated.status = "Returned";
        updated.returnDate      = data.returnDate  ?? now.split("T")[0];
        updated.returnMethod    = data.returnMethod;
        updated.returnCondition = data.returnCondition;
        updated.returnComments  = data.notes || undefined;
        break;
      case "donate":
        updated.status = "Donated";
        updated.donatedDate     = data.donatedDate ?? now.split("T")[0];
        updated.donatedTo       = data.donatedTo;
        updated.donatedComments = data.notes || undefined;
        break;
      case "decommission":
        updated.status = "Decommissioned";
        updated.notes = data.notes || asset.notes;
        break;
      case "reset":
        updated.status = "Active";
        updated.legalHoldDate      = undefined;
        updated.legalHoldReason    = undefined;
        updated.bStockDate         = undefined;
        updated.bStockAlertDismissed = undefined;
        updated.refreshRequestDate = undefined;
        updated.refreshNotes       = undefined;
        updated.returnDate         = undefined;
        updated.returnMethod       = undefined;
        updated.returnCondition    = undefined;
        updated.returnComments     = undefined;
        updated.donatedDate        = undefined;
        updated.donatedTo          = undefined;
        updated.donatedComments    = undefined;
        if (data.notes) updated.notes = data.notes;
        break;
    }

    updateHardwareAsset(updated);
    reload();
    setModal(null);
  };

  // ── Export ──────────────────────────────────────────────────────────────
  const exportExcel = () => {
    const rows = filtered.map((a) => ({
      "User Name":         a.userName,
      "Email":             a.email,
      "Laptop Model":      a.laptopModel,
      "Serial No":         a.serialNo,
      "Warranty Expiry":   a.warrantyExpiry,
      "Substatus":         a.substatus,
      "Location":          a.location,
      "Assigned Date":     a.assignedDate,
      "Status":            a.status,
      "Legal Hold Date":   a.legalHoldDate  ? fmtDate(a.legalHoldDate)  : "",
      "Days in Hold":      a.legalHoldDate  ? daysSince(a.legalHoldDate) : "",
      "B Stock Date":      a.bStockDate     ? fmtDate(a.bStockDate)     : "",
      "Return Date":       a.returnDate     ?? "",
      "Return Method":     a.returnMethod   ? RETURN_METHOD_LABELS[a.returnMethod] : "",
      "Return Condition":  a.returnCondition ? CONDITION_LABELS[a.returnCondition] : "",
      "Return Comments":   a.returnComments ?? "",
      "Donated To":        a.donatedTo      ?? "",
      "Donation Date":     a.donatedDate    ?? "",
      "Donation Notes":    a.donatedComments ?? "",
      "Notes":             a.notes          ?? "",
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Hardware Assets");
    XLSX.writeFile(wb, `hardware_assets_${new Date().toISOString().slice(0,10)}.xlsx`);
  };

  // ── Computed ─────────────────────────────────────────────────────────────
  const bStockAlerts = useMemo(
    () => getBStockAlerts(assets).filter((a) => !dismissedAlerts.has(a.id)),
    [assets, dismissedAlerts]
  );
  const warrantyAlerts = useMemo(() => getWarningAssets(assets, 60), [assets]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return assets.filter((a) => {
      if (statusFilter !== "All" && a.status !== statusFilter) return false;
      if (subFilter   !== "All" && a.substatus !== subFilter)  return false;
      if (q && ![a.userName, a.email, a.laptopModel, a.serialNo, a.location]
        .some((f) => f.toLowerCase().includes(q))) return false;
      return true;
    });
  }, [assets, statusFilter, subFilter, search]);

  const stats = useMemo(() => ({
    total:       assets.length,
    active:      assets.filter((a) => a.status === "Active").length,
    warnW:       warrantyAlerts.length,
    legalHold:   assets.filter((a) => a.status === "Legal Hold").length,
    bStock:      assets.filter((a) => a.status === "B Stock").length,
    refresh:     assets.filter((a) => a.status === "Refresh Pending").length,
    returned:    assets.filter((a) => a.status === "Returned").length,
    donated:     assets.filter((a) => a.status === "Donated").length,
  }), [assets, warrantyAlerts]);

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "#1B2A4A" }}>Hardware Assets</h1>
          <p className="text-slate-500 text-sm mt-1">Track laptops, warranty, legal holds, returns, donations & B Stock lifecycle.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={exportExcel} disabled={assets.length === 0}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 disabled:opacity-40">
            <Download size={15} /> Export
          </button>
          <button onClick={() => fileRef.current?.click()} disabled={importing}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-white"
            style={{ background: "#FF4A1C" }}>
            <Upload size={15} /> {importing ? "Importing…" : "Import Excel"}
          </button>
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFile} />
        </div>
      </div>

      {/* Import message */}
      {importMsg && (
        <div className="flex items-center justify-between bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-sm text-green-800">
          <span>{importMsg}</span>
          <button onClick={() => setImportMsg(null)}><X size={14} /></button>
        </div>
      )}

      {/* Empty state */}
      {assets.length === 0 && !importMsg && (
        <div className="rounded-2xl border-2 border-dashed border-orange-200 bg-orange-50 px-8 py-12 text-center">
          <Laptop size={40} className="mx-auto mb-3 text-orange-300" />
          <p className="font-semibold text-slate-700 mb-1">No hardware assets yet</p>
          <p className="text-sm text-slate-500 mb-4">Upload an Excel file with columns: assigned_to, serial_number, display_name, warranty_expiration, substatus, location, assigned, assigned_to.email</p>
          <button onClick={() => fileRef.current?.click()}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white"
            style={{ background: "#FF4A1C" }}>
            <Upload size={15} /> Upload Hardware Excel
          </button>
        </div>
      )}

      {assets.length > 0 && (<>

        {/* B Stock Alerts */}
        {bStockAlerts.length > 0 && (
          <div className="rounded-2xl border border-red-300 bg-red-50 px-5 py-4 space-y-2">
            <div className="flex items-center gap-2 text-red-700 font-bold text-sm">
              <AlertTriangle size={16} />
              {bStockAlerts.length} device{bStockAlerts.length > 1 ? "s" : ""} ready to move to B Stock (45+ days in Legal Hold)
            </div>
            <div className="flex flex-wrap gap-2">
              {bStockAlerts.map((a) => (
                <div key={a.id} className="flex items-center gap-2 bg-white border border-red-200 rounded-lg px-3 py-1.5 text-xs">
                  <span className="font-medium text-slate-800">{a.userName}</span>
                  <span className="text-slate-500">{a.serialNo}</span>
                  <span className="text-red-600 font-semibold">{daysSince(a.legalHoldDate!)}d in hold</span>
                  <button onClick={() => setModal({ asset: a, action: "bstock" })}
                    className="text-purple-600 font-bold hover:underline">Move to B Stock</button>
                  <button onClick={() => {
                    updateHardwareAsset({ ...a, bStockAlertDismissed: true });
                    setDismissedAlerts((p) => new Set([...p, a.id]));
                  }} className="text-slate-400 hover:text-slate-600"><X size={11} /></button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Warranty alerts */}
        {warrantyAlerts.length > 0 && (
          <div className="rounded-2xl border border-orange-200 bg-orange-50 px-5 py-3 flex items-start gap-3">
            <AlertTriangle size={16} className="text-orange-500 mt-0.5 shrink-0" />
            <p className="text-sm text-orange-800">
              <strong>{warrantyAlerts.length}</strong> active device{warrantyAlerts.length > 1 ? "s have" : " has"} a warranty expiring within 60 days.
            </p>
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
          {[
            { label: "Total",          value: stats.total,     color: "#1B2A4A" },
            { label: "Active",         value: stats.active,    color: "#16a34a" },
            { label: "Warranty ⚠",     value: stats.warnW,     color: "#d97706" },
            { label: "Refresh Pend.",  value: stats.refresh,   color: "#FF4A1C" },
            { label: "Legal Hold",     value: stats.legalHold, color: "#dc2626" },
            { label: "B Stock",        value: stats.bStock,    color: "#7c3aed" },
            { label: "Returned",       value: stats.returned,  color: "#0284C7" },
            { label: "Donated",        value: stats.donated,   color: "#DB2777" },
          ].map(({ label, value, color }) => (
            <div key={label} className="bg-white rounded-2xl border border-slate-200 shadow-sm px-3 py-3 text-center">
              <p className="text-2xl font-extrabold" style={{ color }}>{value}</p>
              <p className="text-[11px] text-slate-500 mt-0.5">{label}</p>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-xl px-1 py-1 w-fit">
          {(["all", "received", "donated"] as const).map((t) => (
            <button key={t} onClick={() => setActiveTab(t)}
              className="px-4 py-1.5 rounded-lg text-sm font-semibold transition-all"
              style={activeTab === t ? { background: "#1B2A4A", color: "#fff" } : { color: "#64748b" }}>
              {t === "all" ? `All Assets (${assets.length})` : t === "received" ? `Returned (${stats.returned})` : `Donated (${stats.donated})`}
            </button>
          ))}
        </div>

        {/* ── Tab: Received / Donated ── */}
        {activeTab !== "all" && <ReceivedPanel assets={assets} />}

        {/* ── Tab: All Assets ── */}
        {activeTab === "all" && (<>
          {/* Filters */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name, serial, model, location…"
                className="w-full pl-8 pr-3 py-2 border border-slate-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2"
                style={{ "--tw-ring-color": "#FF4A1C" } as React.CSSProperties} />
              {search && <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"><X size={13} /></button>}
            </div>

            <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-xl px-1 py-1 flex-wrap">
              <Filter size={13} className="text-slate-400 ml-1" />
              {(["All","Active","Refresh Pending","Legal Hold","B Stock","Returned","Donated","Decommissioned"] as const).map((s) => (
                <button key={s} onClick={() => setStatusFilter(s as HardwareStatus | "All")}
                  className={cn("px-3 py-1 rounded-lg text-xs font-medium transition-all",
                    statusFilter === s ? "text-white" : "text-slate-500 hover:bg-slate-50")}
                  style={statusFilter === s ? { background: "#FF4A1C" } : undefined}>
                  {s}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-xl px-1 py-1">
              {(["All","Primary","Secondary"] as const).map((s) => (
                <button key={s} onClick={() => setSubFilter(s as HardwareSubstatus | "All")}
                  className={cn("px-3 py-1 rounded-lg text-xs font-medium transition-all",
                    subFilter === s ? "text-white" : "text-slate-500 hover:bg-slate-50")}
                  style={subFilter === s ? { background: "#1B2A4A" } : undefined}>
                  {s}
                </button>
              ))}
            </div>

            <span className="text-xs text-slate-400 ml-auto">{filtered.length} of {assets.length}</span>

            <button onClick={() => { if (confirm("Clear ALL hardware asset data?")) { clearHardwareAssets(); reload(); }}}
              className="flex items-center gap-1 px-3 py-2 text-xs text-red-500 border border-red-200 rounded-xl hover:bg-red-50">
              <Trash2 size={13} /> Clear All
            </button>
          </div>

          {/* Table */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-xs uppercase tracking-wide" style={{ background: "#1B2A4A", color: "#8BA3B8" }}>
                    <th className="text-left px-4 py-3 font-semibold">User</th>
                    <th className="text-left px-4 py-3 font-semibold">Laptop Model</th>
                    <th className="text-left px-4 py-3 font-semibold">Serial No</th>
                    <th className="text-left px-4 py-3 font-semibold">Warranty</th>
                    <th className="text-left px-4 py-3 font-semibold">Substatus</th>
                    <th className="text-left px-4 py-3 font-semibold">Location</th>
                    <th className="text-left px-4 py-3 font-semibold">Assigned</th>
                    <th className="text-left px-4 py-3 font-semibold">Status</th>
                    <th className="text-left px-4 py-3 font-semibold">Details</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {filtered.length === 0 ? (
                    <tr><td colSpan={10} className="text-center py-12 text-slate-400 text-sm">No assets match the current filters.</td></tr>
                  ) : filtered.map((asset) => {
                    const holdDays = asset.legalHoldDate ? daysSince(asset.legalHoldDate) : null;
                    return (
                      <tr key={asset.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3">
                          <p className="font-medium text-slate-800 text-xs">{asset.userName}</p>
                          <p className="text-[11px] text-slate-400">{asset.email}</p>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-700">{asset.laptopModel || "—"}</td>
                        <td className="px-4 py-3 font-mono text-xs text-slate-600">{asset.serialNo}</td>
                        <td className="px-4 py-3"><WarrantyBadge expiry={asset.warrantyExpiry} /></td>
                        <td className="px-4 py-3">
                          <span className={cn("text-[11px] font-medium px-2 py-0.5 rounded-full",
                            asset.substatus === "Primary" ? "bg-orange-50 text-orange-700" : "bg-slate-100 text-slate-600")}>
                            {asset.substatus}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-500">{asset.location || "—"}</td>
                        <td className="px-4 py-3 text-xs text-slate-500">{fmtDate(asset.assignedDate)}</td>
                        <td className="px-4 py-3">
                          <span className={cn("text-[11px] font-semibold px-2 py-0.5 rounded-full", STATUS_COLORS[asset.status])}>
                            {asset.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs space-y-0.5">
                          {asset.status === "Legal Hold" && holdDays !== null && (
                            <p className={cn("font-medium", holdDays >= 45 ? "text-red-600" : "text-orange-600")}>
                              {holdDays}d in hold {holdDays >= 45 ? "⚠️" : ""}
                            </p>
                          )}
                          {asset.status === "Returned" && (
                            <p className="text-blue-600">{fmtDate(asset.returnDate)} · {asset.returnMethod === "courier" ? "Courier" : "Direct"}</p>
                          )}
                          {asset.status === "Donated" && (
                            <p className="text-pink-600">{asset.donatedTo} · {fmtDate(asset.donatedDate)}</p>
                          )}
                          {asset.status === "B Stock" && asset.bStockDate && (
                            <p className="text-purple-600">Since {fmtDate(asset.bStockDate)}</p>
                          )}
                          {asset.status === "Refresh Pending" && asset.refreshRequestDate && (
                            <p className="text-orange-600">Since {fmtDate(asset.refreshRequestDate)}</p>
                          )}
                          {asset.returnComments && asset.status === "Returned" && (
                            <p className="text-slate-400 truncate max-w-[120px]" title={asset.returnComments}>{asset.returnComments}</p>
                          )}
                          {asset.notes && !["Returned","Donated"].includes(asset.status) && (
                            <p className="text-slate-400 truncate max-w-[120px]" title={asset.notes}>{asset.notes}</p>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <ActionsMenu asset={asset} onAction={(a, act) => setModal({ asset: a, action: act })} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Column guide */}
          <details className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs text-slate-500 cursor-pointer">
            <summary className="font-medium text-slate-600 select-none">Expected Excel columns for import</summary>
            <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-2">
              {[
                { col: "assigned_to",         desc: "User name" },
                { col: "assigned_to.email",   desc: "Email address" },
                { col: "display_name",        desc: "Device / laptop model" },
                { col: "model_category",      desc: "Model category" },
                { col: "serial_number",       desc: "Serial number (key)" },
                { col: "warranty_expiration", desc: "Warranty expiry date" },
                { col: "substatus",           desc: "Primary / Secondary" },
                { col: "location",            desc: "Office location" },
                { col: "assigned",            desc: "Date assigned" },
                { col: "install_status",      desc: "Device status" },
              ].map(({ col, desc }) => (
                <div key={col} className="bg-white border border-slate-200 rounded-lg px-3 py-1.5">
                  <p className="font-mono text-xs font-semibold text-slate-700">{col}</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">{desc}</p>
                </div>
              ))}
            </div>
          </details>
        </>)}
      </>)}

      {/* Action Modal */}
      {modal && (
        <ActionModal
          asset={modal.asset}
          action={modal.action}
          onConfirm={applyAction}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}
