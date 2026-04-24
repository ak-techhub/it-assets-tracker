"use client";
import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  Upload, Search, X, AlertTriangle, CheckCircle2, Clock,
  Laptop, RotateCcw, Archive, ShieldAlert, Trash2,
  ChevronDown, Download, RefreshCw, Filter,
} from "lucide-react";
import * as XLSX from "xlsx";
import {
  getHardwareAssets, saveHardwareAssets, updateHardwareAsset,
  clearHardwareAssets, parseAndMergeHardware, getBStockAlerts,
  getWarningAssets, daysSince, daysUntil,
} from "@/lib/hardware";
import { HardwareAsset, HardwareStatus, HardwareSubstatus } from "@/lib/types";
import { cn } from "@/lib/utils";

// ── helpers ────────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<HardwareStatus, string> = {
  "Active":            "bg-green-100 text-green-800",
  "Refresh Pending":   "bg-orange-100 text-orange-800",
  "Legal Hold":        "bg-red-100 text-red-800",
  "B Stock":           "bg-purple-100 text-purple-800",
  "Returned":          "bg-slate-100 text-slate-600",
  "Decommissioned":    "bg-slate-200 text-slate-500",
};

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

// ── Action Modal ───────────────────────────────────────────────────────────

interface ActionModalProps {
  asset: HardwareAsset;
  action: "refresh" | "legalhold" | "bstock" | "returned" | "decommission" | "reactivate";
  onConfirm: (asset: HardwareAsset, action: ActionModalProps["action"], notes: string) => void;
  onClose: () => void;
}

const ACTION_META = {
  refresh:      { title: "Submit for Refresh",   icon: RotateCcw,    color: "#FF4A1C", desc: "Mark this laptop as submitted for refresh (warranty expired or scheduled). The device will be flagged as Refresh Pending." },
  legalhold:    { title: "Move to Legal Hold",    icon: ShieldAlert,  color: "#DC2626", desc: "Place this device in Legal Hold (e.g. employee resigned). It will automatically remind you to move it to B Stock after 45 days." },
  bstock:       { title: "Move to B Stock",       icon: Archive,      color: "#7C3AED", desc: "Transfer this device to B Stock inventory after the legal hold period is complete." },
  returned:     { title: "Mark as Returned",      icon: CheckCircle2, color: "#059669", desc: "Mark this device as physically returned to IT." },
  decommission: { title: "Decommission",          icon: Trash2,       color: "#64748B", desc: "Permanently decommission this device from the asset register." },
  reactivate:   { title: "Reactivate to Active",  icon: RefreshCw,    color: "#1B2A4A", desc: "Move this device back to Active status." },
};

function ActionModal({ asset, action, onConfirm, onClose }: ActionModalProps) {
  const [notes, setNotes] = useState("");
  const meta = ACTION_META[action];
  const Icon = meta.icon;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="px-6 py-5 flex items-center gap-3" style={{ background: "#1B2A4A" }}>
          <div className="p-2 rounded-full" style={{ background: meta.color }}>
            <Icon size={18} className="text-white" />
          </div>
          <div>
            <h2 className="text-white font-bold text-base">{meta.title}</h2>
            <p className="text-slate-300 text-xs mt-0.5">{asset.userName} · {asset.serialNo}</p>
          </div>
          <button onClick={onClose} className="ml-auto text-slate-400 hover:text-white"><X size={16} /></button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <p className="text-sm text-slate-600">{meta.desc}</p>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Notes (optional)</label>
            <textarea
              value={notes} onChange={(e) => setNotes(e.target.value)} rows={3}
              placeholder="Add any relevant notes..."
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2"
              style={{ "--tw-ring-color": meta.color } as React.CSSProperties}
            />
          </div>
        </div>
        <div className="px-6 pb-6 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm text-slate-600 bg-slate-100 hover:bg-slate-200">Cancel</button>
          <button
            onClick={() => onConfirm(asset, action, notes)}
            className="px-5 py-2 rounded-lg text-sm font-bold text-white hover:opacity-90 active:scale-95 transition-all"
            style={{ background: meta.color }}
          >
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
  onAction: (asset: HardwareAsset, action: ActionModalProps["action"]) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const actions: { label: string; act: ActionModalProps["action"]; show: boolean }[] = [
    { label: "Submit for Refresh",  act: "refresh"      as const, show: asset.status === "Active" },
    { label: "Move to Legal Hold",  act: "legalhold"    as const, show: asset.status === "Active" || asset.status === "Refresh Pending" },
    { label: "Move to B Stock",     act: "bstock"       as const, show: asset.status === "Legal Hold" },
    { label: "Mark as Returned",    act: "returned"     as const, show: ["Active","Refresh Pending","Legal Hold","B Stock"].includes(asset.status) },
    { label: "Reactivate",          act: "reactivate"   as const, show: ["Refresh Pending","Legal Hold","B Stock","Returned"].includes(asset.status) },
    { label: "Decommission",        act: "decommission" as const, show: asset.status !== "Decommissioned" },
  ].filter((a) => a.show);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((p) => !p)}
        className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-200 hover:border-slate-300 bg-white hover:bg-slate-50 transition-colors"
      >
        Actions <ChevronDown size={12} />
      </button>
      {open && (
        <ul className="absolute right-0 top-9 z-30 w-48 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden">
          {actions.map(({ label, act }) => (
            <li key={act}>
              <button
                onClick={() => { setOpen(false); onAction(asset, act); }}
                className="w-full text-left px-4 py-2.5 text-sm hover:bg-orange-50 hover:text-orange-700 transition-colors border-b border-slate-50 last:border-0"
              >
                {label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────

export default function HardwarePage() {
  const [assets, setAssets] = useState<HardwareAsset[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<HardwareStatus | "All">("All");
  const [subFilter, setSubFilter] = useState<HardwareSubstatus | "All">("All");
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [modal, setModal] = useState<{ asset: HardwareAsset; action: ActionModalProps["action"] } | null>(null);
  const [dismissedAlerts, setDismissedAlerts] = useState<Set<string>>(new Set());
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

  // ── Actions ─────────────────────────────────────────────────────────────
  const applyAction = (asset: HardwareAsset, action: ActionModalProps["action"], notes: string) => {
    const now = new Date().toISOString();
    const updated = { ...asset, notes: notes || asset.notes, lastUpdated: now };
    switch (action) {
      case "refresh":
        updated.status = "Refresh Pending";
        updated.refreshRequestDate = now;
        updated.refreshNotes = notes;
        break;
      case "legalhold":
        updated.status = "Legal Hold";
        updated.legalHoldDate = now;
        updated.legalHoldReason = "resigned";
        updated.bStockAlertDismissed = false;
        break;
      case "bstock":
        updated.status = "B Stock";
        updated.bStockDate = now;
        break;
      case "returned":
        updated.status = "Returned";
        break;
      case "decommission":
        updated.status = "Decommissioned";
        break;
      case "reactivate":
        updated.status = "Active";
        updated.legalHoldDate = undefined;
        updated.refreshRequestDate = undefined;
        break;
    }
    updateHardwareAsset(updated);
    reload();
    setModal(null);
  };

  // ── Export ──────────────────────────────────────────────────────────────
  const exportExcel = () => {
    const rows = filtered.map((a) => ({
      "User Name":          a.userName,
      "Email":              a.email,
      "Laptop Model":       a.laptopModel,
      "Serial No":          a.serialNo,
      "Warranty Expiry":    a.warrantyExpiry,
      "Substatus":          a.substatus,
      "Location":           a.location,
      "Assigned Date":      a.assignedDate,
      "Status":             a.status,
      "Legal Hold Date":    a.legalHoldDate ? fmtDate(a.legalHoldDate) : "",
      "Days in Hold":       a.legalHoldDate ? daysSince(a.legalHoldDate) : "",
      "B Stock Date":       a.bStockDate ? fmtDate(a.bStockDate) : "",
      "Notes":              a.notes ?? "",
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
    total:        assets.length,
    active:       assets.filter((a) => a.status === "Active").length,
    warnWarranty: warrantyAlerts.length,
    legalHold:    assets.filter((a) => a.status === "Legal Hold").length,
    bStock:       assets.filter((a) => a.status === "B Stock").length,
    refresh:      assets.filter((a) => a.status === "Refresh Pending").length,
  }), [assets, warrantyAlerts]);

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "#1B2A4A" }}>Hardware Assets</h1>
          <p className="text-slate-500 text-sm mt-1">Manage laptops, warranty tracking, legal holds & B Stock lifecycle.</p>
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

      {/* Import result message */}
      {importMsg && (
        <div className="flex items-center justify-between bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-sm text-green-800">
          <span>{importMsg}</span>
          <button onClick={() => setImportMsg(null)}><X size={14} /></button>
        </div>
      )}

      {/* Import help banner (when empty) */}
      {assets.length === 0 && !importMsg && (
        <div className="rounded-2xl border-2 border-dashed border-orange-200 bg-orange-50 px-8 py-12 text-center">
          <Laptop size={40} className="mx-auto mb-3 text-orange-300" />
          <p className="font-semibold text-slate-700 mb-1">No hardware assets yet</p>
          <p className="text-sm text-slate-500 mb-4">Upload an Excel file with columns: User Name, Email, Laptop Model, Serial No, Warranty Expiry, Substatus, Location, Assigned Date</p>
          <button onClick={() => fileRef.current?.click()}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white"
            style={{ background: "#FF4A1C" }}>
            <Upload size={15} /> Upload Hardware Excel
          </button>
        </div>
      )}

      {assets.length > 0 && (<>

        {/* ── B Stock Alerts (45-day) ── */}
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
                  <button
                    onClick={() => setModal({ asset: a, action: "bstock" })}
                    className="text-purple-600 font-bold hover:underline">Move to B Stock</button>
                  <button
                    onClick={() => {
                      const updated = { ...a, bStockAlertDismissed: true };
                      updateHardwareAsset(updated);
                      setDismissedAlerts((p) => new Set([...p, a.id]));
                    }}
                    className="text-slate-400 hover:text-slate-600"><X size={11} /></button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Warranty Alerts ── */}
        {warrantyAlerts.length > 0 && (
          <div className="rounded-2xl border border-orange-200 bg-orange-50 px-5 py-3 flex items-start gap-3">
            <AlertTriangle size={16} className="text-orange-500 mt-0.5 shrink-0" />
            <p className="text-sm text-orange-800">
              <strong>{warrantyAlerts.length}</strong> active device{warrantyAlerts.length > 1 ? "s have" : " has"} a warranty expiring within 60 days.
              {" "}<span className="text-orange-600 font-medium">Filter by warranty to review.</span>
            </p>
          </div>
        )}

        {/* ── Stats ── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            { label: "Total",           value: stats.total,        color: "#1B2A4A" },
            { label: "Active",          value: stats.active,       color: "#16a34a" },
            { label: "Warranty ⚠",      value: stats.warnWarranty, color: "#d97706" },
            { label: "Refresh Pending", value: stats.refresh,      color: "#FF4A1C" },
            { label: "Legal Hold",      value: stats.legalHold,    color: "#dc2626" },
            { label: "B Stock",         value: stats.bStock,       color: "#7c3aed" },
          ].map(({ label, value, color }) => (
            <div key={label} className="bg-white rounded-2xl border border-slate-200 shadow-sm px-4 py-3 text-center">
              <p className="text-2xl font-extrabold" style={{ color }}>{value}</p>
              <p className="text-xs text-slate-500 mt-0.5">{label}</p>
            </div>
          ))}
        </div>

        {/* ── Filters ── */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              type="text" value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, serial, model, location…"
              className="w-full pl-8 pr-3 py-2 border border-slate-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2"
              style={{ "--tw-ring-color": "#FF4A1C" } as React.CSSProperties}
            />
            {search && <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"><X size={13} /></button>}
          </div>

          <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-xl px-1 py-1">
            <Filter size={13} className="text-slate-400 ml-1" />
            {(["All","Active","Refresh Pending","Legal Hold","B Stock","Returned","Decommissioned"] as const).map((s) => (
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

          {assets.length > 0 && (
            <button onClick={() => { if (confirm("Clear ALL hardware asset data?")) { clearHardwareAssets(); reload(); }}}
              className="flex items-center gap-1 px-3 py-2 text-xs text-red-500 border border-red-200 rounded-xl hover:bg-red-50">
              <Trash2 size={13} /> Clear All
            </button>
          )}
        </div>

        {/* ── Table ── */}
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
                  <th className="text-left px-4 py-3 font-semibold">Hold / Info</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filtered.length === 0 ? (
                  <tr><td colSpan={10} className="text-center py-12 text-slate-400 text-sm">No assets match the current filters.</td></tr>
                ) : filtered.map((asset) => {
                  const holdDays = asset.legalHoldDate ? daysSince(asset.legalHoldDate) : null;
                  return (
                    <tr key={asset.id} className="hover:bg-slate-50 transition-colors group">
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-800 text-xs">{asset.userName}</p>
                        <p className="text-[11px] text-slate-400">{asset.email}</p>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-700">{asset.laptopModel || "—"}</td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-600">{asset.serialNo}</td>
                      <td className="px-4 py-3"><WarrantyBadge expiry={asset.warrantyExpiry} /></td>
                      <td className="px-4 py-3">
                        <span className={cn("text-[11px] font-medium px-2 py-0.5 rounded-full",
                          asset.substatus === "Primary" ? "bg-blue-50 text-blue-700" : "bg-slate-100 text-slate-600")}>
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
                      <td className="px-4 py-3 text-xs">
                        {asset.status === "Legal Hold" && holdDays !== null && (
                          <span className={cn("font-medium", holdDays >= 45 ? "text-red-600" : "text-orange-600")}>
                            {holdDays}d in hold {holdDays >= 45 ? "⚠️ Move to B Stock" : ""}
                          </span>
                        )}
                        {asset.status === "B Stock" && asset.bStockDate && (
                          <span className="text-purple-600">Since {fmtDate(asset.bStockDate)}</span>
                        )}
                        {asset.status === "Refresh Pending" && asset.refreshRequestDate && (
                          <span className="text-orange-600">Since {fmtDate(asset.refreshRequestDate)}</span>
                        )}
                        {asset.notes && <p className="text-slate-400 mt-0.5 truncate max-w-[120px]" title={asset.notes}>{asset.notes}</p>}
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

        {/* ── Excel column guide ── */}
        <details className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs text-slate-500 cursor-pointer">
          <summary className="font-medium text-slate-600 select-none">Expected Excel columns for import</summary>
          <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-1 mt-3">
            {["User Name","Email / Mail ID","Laptop Model","Serial No","Warranty Expiry Date","Substatus (Primary/Secondary)","Location","Assigned Date"].map((c) => (
              <span key={c} className="bg-white border border-slate-200 rounded px-2 py-1">{c}</span>
            ))}
          </div>
        </details>

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
