"use client";
import { useState, useEffect, useMemo } from "react";
import { getHardwareAssets } from "@/lib/hardware";
import { HardwareAsset } from "@/lib/types";
import { cn } from "@/lib/utils";
import * as XLSX from "xlsx";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, CartesianGrid, LabelList,
} from "recharts";
import { Download, Laptop } from "lucide-react";

const HW_COLORS = { Mac: "#FF4A1C", Windows: "#1B2A4A", Primary: "#FF4A1C", Secondary: "#8BA3B8" };

// ── Fiscal-year helpers ───────────────────────────────────────────────────────
// FY runs Feb → Jan  |  Q1=Feb-Apr  Q2=May-Jul  Q3=Aug-Oct  Q4=Nov-Jan
const Q_LABELS = ["Q1 (Feb-Apr)", "Q2 (May-Jul)", "Q3 (Aug-Oct)", "Q4 (Nov-Jan)"];

function getFiscalInfo(dateStr: string): { fy: string; q: number } | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  const mo = d.getMonth() + 1;
  const yr = d.getFullYear();
  let q: number; let fyStart: number;
  if      (mo >= 2 && mo <= 4)  { q = 1; fyStart = yr; }
  else if (mo >= 5 && mo <= 7)  { q = 2; fyStart = yr; }
  else if (mo >= 8 && mo <= 10) { q = 3; fyStart = yr; }
  else if (mo >= 11)            { q = 4; fyStart = yr; }
  else                          { q = 4; fyStart = yr - 1; }
  return { fy: `FY ${fyStart}-${String(fyStart + 1).slice(2)}`, q };
}

function getOsType(model: string): "Mac" | "Windows" {
  const m = (model ?? "").toLowerCase();
  if (m.includes("mac") || m.includes("apple") || m.includes("macbook")) return "Mac";
  return "Windows";
}

function buildHwQuarterData(assets: HardwareAsset[], fy: string) {
  const data = Q_LABELS.map((label, i) => ({
    label, q: i + 1, Mac: 0, Windows: 0, Primary: 0, Secondary: 0,
  }));
  for (const a of assets) {
    const info = getFiscalInfo(a.assignedDate);
    if (!info || info.fy !== fy) continue;
    const row = data[info.q - 1];
    row[getOsType(a.laptopModel)]++;
    row[a.substatus]++;
  }
  return data;
}

interface WarrantyQtrRow {
  label: string; q: number;
  primaryMac: number; primaryWindows: number;
  secondaryMac: number; secondaryWindows: number;
}

function buildWarrantyQtrData(assets: HardwareAsset[], fy: string): WarrantyQtrRow[] {
  const data: WarrantyQtrRow[] = Q_LABELS.map((label, i) => ({
    label, q: i + 1,
    primaryMac: 0, primaryWindows: 0,
    secondaryMac: 0, secondaryWindows: 0,
  }));
  for (const a of assets) {
    if (!a.warrantyExpiry) continue;
    const info = getFiscalInfo(a.warrantyExpiry);
    if (!info || info.fy !== fy) continue;
    const row = data[info.q - 1];
    const os = getOsType(a.laptopModel);
    if (a.substatus === "Primary") {
      if (os === "Mac") row.primaryMac++; else row.primaryWindows++;
    } else {
      if (os === "Mac") row.secondaryMac++; else row.secondaryWindows++;
    }
  }
  return data;
}

function getAvailableFYs(assets: HardwareAsset[]): string[] {
  const set = new Set<string>();
  const now = new Date();
  const curFYStart = now.getMonth() + 1 >= 2 ? now.getFullYear() : now.getFullYear() - 1;
  for (let y = curFYStart - 1; y <= curFYStart + 3; y++) {
    set.add(`FY ${y}-${String(y + 1).slice(2)}`);
  }
  for (const a of assets) {
    const info = getFiscalInfo(a.assignedDate);
    if (info) set.add(info.fy);
  }
  return Array.from(set).sort().reverse();
}

function getAvailableWarrantyFYs(assets: HardwareAsset[]): string[] {
  const set = new Set<string>();
  const now = new Date();
  const curFYStart = now.getMonth() + 1 >= 2 ? now.getFullYear() : now.getFullYear() - 1;
  for (let y = curFYStart - 1; y <= curFYStart + 3; y++) {
    set.add(`FY ${y}-${String(y + 1).slice(2)}`);
  }
  for (const a of assets) {
    const info = getFiscalInfo(a.warrantyExpiry);
    if (info) set.add(info.fy);
  }
  return Array.from(set).sort().reverse();
}

// ── Main page ────────────────────────────────────────────────────────────────
export default function HwReportsPage() {
  const [hwAssets, setHwAssets] = useState<HardwareAsset[]>([]);
  useEffect(() => { setHwAssets(getHardwareAssets()); }, []);

  // ── Assignment report ────────────────────────────────────────────────────
  const availableFYs = useMemo(() => getAvailableFYs(hwAssets), [hwAssets]);
  const [selectedFY, setSelectedFY] = useState("FY 2026-27");

  const hwFYAssets = useMemo(
    () => hwAssets.filter((a) => getFiscalInfo(a.assignedDate)?.fy === selectedFY),
    [hwAssets, selectedFY]
  );
  const hwQtrData = useMemo(() => buildHwQuarterData(hwAssets, selectedFY), [hwAssets, selectedFY]);

  const hwOsDonut = useMemo(() => {
    const mac = hwFYAssets.filter((a) => getOsType(a.laptopModel) === "Mac").length;
    const win = hwFYAssets.length - mac;
    return [{ name: "Mac", value: mac }, { name: "Windows", value: win }].filter((d) => d.value > 0);
  }, [hwFYAssets]);

  const hwSubDonut = useMemo(() => [
    { name: "Primary",   value: hwFYAssets.filter((a) => a.substatus === "Primary").length },
    { name: "Secondary", value: hwFYAssets.filter((a) => a.substatus === "Secondary").length },
  ].filter((d) => d.value > 0), [hwFYAssets]);

  const hwStats = useMemo(() => ({
    total:     hwFYAssets.length,
    mac:       hwFYAssets.filter((a) => getOsType(a.laptopModel) === "Mac").length,
    windows:   hwFYAssets.filter((a) => getOsType(a.laptopModel) === "Windows").length,
    primary:   hwFYAssets.filter((a) => a.substatus === "Primary").length,
    secondary: hwFYAssets.filter((a) => a.substatus === "Secondary").length,
    legalHold: hwFYAssets.filter((a) => a.status === "Legal Hold").length,
    bStock:    hwFYAssets.filter((a) => a.status === "B Stock").length,
    refresh:   hwFYAssets.filter((a) => a.status === "Refresh Pending").length,
  }), [hwFYAssets]);

  const exportHwReport = () => {
    const rows = hwFYAssets.map((a) => ({
      "User Name":       a.userName,
      "Email":           a.email,
      "Laptop Model":    a.laptopModel,
      "OS Type":         getOsType(a.laptopModel),
      "Serial No":       a.serialNo,
      "Warranty Expiry": a.warrantyExpiry,
      "Substatus":       a.substatus,
      "Location":        a.location,
      "Assigned Date":   a.assignedDate,
      "Fiscal Year":     getFiscalInfo(a.assignedDate)?.fy ?? "",
      "Quarter":         (() => { const f = getFiscalInfo(a.assignedDate); return f ? Q_LABELS[f.q - 1] : ""; })(),
      "Status":          a.status,
      "Legal Hold Date": a.legalHoldDate ?? "",
      "B Stock Date":    a.bStockDate ?? "",
      "Notes":           a.notes ?? "",
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Hardware Report");
    XLSX.writeFile(wb, `hardware-report-${selectedFY.replace(/\s/g, "-")}-${new Date().toISOString().slice(0,10)}.xlsx`);
  };

  // ── Warranty expiry report ───────────────────────────────────────────────
  const warrantyFYs = useMemo(() => getAvailableWarrantyFYs(hwAssets), [hwAssets]);
  const [warrantyFY, setWarrantyFY] = useState("FY 2026-27");

  const warrantyQtrData = useMemo(
    () => buildWarrantyQtrData(hwAssets, warrantyFY),
    [hwAssets, warrantyFY]
  );

  const warrantyFYAssets = useMemo(
    () => hwAssets.filter((a) => a.warrantyExpiry && getFiscalInfo(a.warrantyExpiry)?.fy === warrantyFY),
    [hwAssets, warrantyFY]
  );

  const warrantyTotals = useMemo(() => ({
    primaryMac:       warrantyFYAssets.filter((a) => a.substatus === "Primary"   && getOsType(a.laptopModel) === "Mac").length,
    primaryWindows:   warrantyFYAssets.filter((a) => a.substatus === "Primary"   && getOsType(a.laptopModel) === "Windows").length,
    secondaryMac:     warrantyFYAssets.filter((a) => a.substatus === "Secondary" && getOsType(a.laptopModel) === "Mac").length,
    secondaryWindows: warrantyFYAssets.filter((a) => a.substatus === "Secondary" && getOsType(a.laptopModel) === "Windows").length,
  }), [warrantyFYAssets]);

  const exportWarrantyReport = () => {
    const rows = warrantyFYAssets.map((a) => {
      const wInfo = getFiscalInfo(a.warrantyExpiry);
      const daysLeft = Math.ceil((new Date(a.warrantyExpiry).getTime() - Date.now()) / 86_400_000);
      return {
        "User Name":      a.userName,
        "Email":          a.email,
        "Laptop Model":   a.laptopModel,
        "OS Type":        getOsType(a.laptopModel),
        "Serial No":      a.serialNo,
        "Warranty Expiry":a.warrantyExpiry,
        "Warranty FY":    wInfo?.fy ?? "",
        "Warranty Qtr":   wInfo ? Q_LABELS[wInfo.q - 1] : "",
        "Substatus":      a.substatus,
        "Location":       a.location,
        "Assigned Date":  a.assignedDate,
        "Current Status": a.status,
        "Days to Expiry": daysLeft < 0 ? `Expired ${Math.abs(daysLeft)}d ago` : `${daysLeft}d remaining`,
      };
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Warranty Report");
    XLSX.writeFile(wb, `warranty-report-${warrantyFY.replace(/\s/g, "-")}-${new Date().toISOString().slice(0,10)}.xlsx`);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-10">

      {/* Page header */}
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-xl text-white" style={{ background: "#1B2A4A" }}>
          <Laptop size={22} />
        </div>
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "#1B2A4A" }}>Hardware Asset Reports</h1>
          <p className="text-slate-500 text-sm mt-0.5">Quarter-wise breakdown · Mac vs Windows · Primary vs Secondary · Warranty Expiry</p>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          HARDWARE ASSETS REPORT
      ══════════════════════════════════════════════════════════════════════ */}
      <div className="space-y-6">
        {/* Section header + FY selector */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl text-white" style={{ background: "#FF4A1C" }}>
              <Laptop size={16} />
            </div>
            <div>
              <h2 className="text-lg font-bold" style={{ color: "#1B2A4A" }}>Assignment Report</h2>
              <p className="text-slate-500 text-xs mt-0.5">Quarter-wise Mac vs Windows · Primary vs Secondary (by assigned date)</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-xl px-1 py-1">
              {availableFYs.map((fy) => (
                <button key={fy} onClick={() => setSelectedFY(fy)}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
                  style={selectedFY === fy ? { background: "#1B2A4A", color: "#fff" } : { color: "#64748b" }}>
                  {fy}
                </button>
              ))}
            </div>
            <button onClick={exportHwReport} disabled={hwFYAssets.length === 0}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-white disabled:opacity-40"
              style={{ background: "#FF4A1C" }}>
              <Download size={14} /> Export {selectedFY}
            </button>
          </div>
        </div>

        {hwAssets.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm px-8 py-12 text-center">
            <Laptop size={36} className="mx-auto mb-3 text-slate-300" />
            <p className="text-slate-500 text-sm">No hardware assets imported yet.</p>
            <p className="text-slate-400 text-xs mt-1">Go to <strong>Hardware Assets</strong> page to upload your Excel file.</p>
          </div>
        ) : (
          <>
            {/* Stat cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
              {[
                { label: "Total",       value: hwStats.total,     bg: "#1B2A4A", fg: "#fff" },
                { label: "Mac",         value: hwStats.mac,       bg: "#FF4A1C", fg: "#fff" },
                { label: "Windows",     value: hwStats.windows,   bg: "#e2e8f0", fg: "#1B2A4A" },
                { label: "Primary",     value: hwStats.primary,   bg: "#FF7A50", fg: "#fff" },
                { label: "Secondary",   value: hwStats.secondary, bg: "#8BA3B8", fg: "#fff" },
                { label: "Legal Hold",  value: hwStats.legalHold, bg: "#FEE2E2", fg: "#DC2626" },
                { label: "B Stock",     value: hwStats.bStock,    bg: "#EDE9FE", fg: "#7C3AED" },
                { label: "Refresh Req", value: hwStats.refresh,   bg: "#FFF7ED", fg: "#EA580C" },
              ].map(({ label, value, bg, fg }) => (
                <div key={label} className="rounded-2xl border border-slate-200 px-3 py-3 text-center shadow-sm"
                  style={{ background: bg }}>
                  <p className="text-2xl font-extrabold" style={{ color: fg }}>{value}</p>
                  <p className="text-[11px] font-medium mt-0.5" style={{ color: fg, opacity: 0.75 }}>{label}</p>
                </div>
              ))}
            </div>

            {/* Chart row 1 — Mac vs Windows / Primary vs Secondary */}
            <div className="grid lg:grid-cols-2 gap-6">
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                <h3 className="text-sm font-bold mb-1" style={{ color: "#1B2A4A" }}>Mac vs Windows — by Quarter</h3>
                <p className="text-xs text-slate-400 mb-4">{selectedFY} · Q1=Feb–Apr · Q2=May–Jul · Q3=Aug–Oct · Q4=Nov–Jan</p>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={hwQtrData} barCategoryGap="30%" margin={{ top: 18, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                    <Tooltip contentStyle={{ borderRadius: 10, fontSize: 12 }} />
                    <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="Mac"     name="Mac"     fill={HW_COLORS.Mac}     radius={[4,4,0,0]}><LabelList dataKey="Mac"     position="top" style={{ fontSize: 11, fontWeight: 700, fill: HW_COLORS.Mac }}     formatter={(v: number) => v || ""} /></Bar>
                    <Bar dataKey="Windows" name="Windows" fill={HW_COLORS.Windows} radius={[4,4,0,0]}><LabelList dataKey="Windows" position="top" style={{ fontSize: 11, fontWeight: 700, fill: HW_COLORS.Windows }} formatter={(v: number) => v || ""} /></Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                <h3 className="text-sm font-bold mb-1" style={{ color: "#1B2A4A" }}>Primary vs Secondary — by Quarter</h3>
                <p className="text-xs text-slate-400 mb-4">{selectedFY} · Q1=Feb–Apr · Q2=May–Jul · Q3=Aug–Oct · Q4=Nov–Jan</p>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={hwQtrData} barCategoryGap="30%" margin={{ top: 18, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                    <Tooltip contentStyle={{ borderRadius: 10, fontSize: 12 }} />
                    <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="Primary"   name="Primary"   fill={HW_COLORS.Primary}   radius={[4,4,0,0]}><LabelList dataKey="Primary"   position="top" style={{ fontSize: 11, fontWeight: 700, fill: HW_COLORS.Primary }}   formatter={(v: number) => v || ""} /></Bar>
                    <Bar dataKey="Secondary" name="Secondary" fill={HW_COLORS.Secondary} radius={[4,4,0,0]}><LabelList dataKey="Secondary" position="top" style={{ fontSize: 11, fontWeight: 700, fill: "#6B7280" }} formatter={(v: number) => v || ""} /></Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Chart row 2 — Donuts with totals */}
            <div className="grid lg:grid-cols-2 gap-6">
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 flex flex-col">
                <h3 className="text-sm font-bold mb-1" style={{ color: "#1B2A4A" }}>Mac vs Windows</h3>
                <p className="text-xs text-slate-400 mb-2">{selectedFY} · total devices</p>
                <div className="flex-1 flex items-center justify-center">
                  <div className="relative w-full" style={{ height: 220 }}>
                    <ResponsiveContainer width="100%" height={220}>
                      <PieChart>
                        <Pie data={hwOsDonut} dataKey="value" nameKey="name" cx="50%" cy="50%"
                          innerRadius={60} outerRadius={88} paddingAngle={3} labelLine={false}>
                          {hwOsDonut.map((d) => (
                            <Cell key={d.name} fill={HW_COLORS[d.name as keyof typeof HW_COLORS] ?? "#94a3b8"} />
                          ))}
                        </Pie>
                        <Tooltip contentStyle={{ borderRadius: 10, fontSize: 12 }} formatter={(v, n) => [`${v} devices`, n]} />
                        <Legend iconSize={12} wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{ paddingBottom: 28 }}>
                      <div className="text-center">
                        <p className="text-3xl font-extrabold" style={{ color: "#1B2A4A" }}>
                          {hwOsDonut.reduce((s, d) => s + d.value, 0)}
                        </p>
                        <p className="text-[11px] text-slate-400 font-medium">Total</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 flex flex-col">
                <h3 className="text-sm font-bold mb-1" style={{ color: "#1B2A4A" }}>Primary vs Secondary</h3>
                <p className="text-xs text-slate-400 mb-2">{selectedFY} · total devices</p>
                <div className="flex-1 flex items-center justify-center">
                  <div className="relative w-full" style={{ height: 220 }}>
                    <ResponsiveContainer width="100%" height={220}>
                      <PieChart>
                        <Pie data={hwSubDonut} dataKey="value" nameKey="name" cx="50%" cy="50%"
                          innerRadius={60} outerRadius={88} paddingAngle={3} labelLine={false}>
                          {hwSubDonut.map((d) => (
                            <Cell key={d.name} fill={HW_COLORS[d.name as keyof typeof HW_COLORS] ?? "#94a3b8"} />
                          ))}
                        </Pie>
                        <Tooltip contentStyle={{ borderRadius: 10, fontSize: 12 }} formatter={(v, n) => [`${v} devices`, n]} />
                        <Legend iconSize={12} wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{ paddingBottom: 28 }}>
                      <div className="text-center">
                        <p className="text-3xl font-extrabold" style={{ color: "#1B2A4A" }}>
                          {hwSubDonut.reduce((s, d) => s + d.value, 0)}
                        </p>
                        <p className="text-[11px] text-slate-400 font-medium">Total</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

          </>
        )}
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          WARRANTY EXPIRY REPORT
      ══════════════════════════════════════════════════════════════════════ */}
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl text-white" style={{ background: "#d97706" }}>
              <Laptop size={16} />
            </div>
            <div>
              <h2 className="text-lg font-bold" style={{ color: "#1B2A4A" }}>Warranty Expiry Report</h2>
              <p className="text-slate-500 text-xs mt-0.5">Quarter-wise breakdown by Primary/Secondary · Mac/Windows · based on warranty expiry date</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-xl px-1 py-1">
              {warrantyFYs.map((fy) => (
                <button key={fy} onClick={() => setWarrantyFY(fy)}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
                  style={warrantyFY === fy ? { background: "#d97706", color: "#fff" } : { color: "#64748b" }}>
                  {fy}
                </button>
              ))}
            </div>
            <button onClick={exportWarrantyReport} disabled={warrantyFYAssets.length === 0}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-white disabled:opacity-40"
              style={{ background: "#d97706" }}>
              <Download size={14} /> Export {warrantyFY}
            </button>
          </div>
        </div>

        {hwAssets.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm px-8 py-10 text-center">
            <p className="text-slate-400 text-sm">Import hardware assets to see warranty expiry data.</p>
          </div>
        ) : (
          <>
            {/* Summary stat cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[
                { label: "Primary — Mac",       value: warrantyTotals.primaryMac,       bg: "#FFF2EE", color: "#FF4A1C",  border: "#FFD0C0" },
                { label: "Primary — Windows",   value: warrantyTotals.primaryWindows,   bg: "#EEF1F6", color: "#1B2A4A",  border: "#C5CDD9" },
                { label: "Secondary — Mac",     value: warrantyTotals.secondaryMac,     bg: "#FFF7ED", color: "#EA580C",  border: "#FDD5A0" },
                { label: "Secondary — Windows", value: warrantyTotals.secondaryWindows, bg: "#F1F5F9", color: "#8BA3B8",  border: "#CBD5E1" },
              ].map(({ label, value, bg, color, border }) => (
                <div key={label} className="rounded-2xl border px-5 py-4 text-center shadow-sm"
                  style={{ background: bg, borderColor: border }}>
                  <p className="text-3xl font-extrabold" style={{ color }}>{value}</p>
                  <p className="text-xs font-semibold mt-1" style={{ color, opacity: 0.8 }}>{label}</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">expiring in {warrantyFY}</p>
                </div>
              ))}
            </div>

            {/* Charts row */}
            <div className="grid lg:grid-cols-2 gap-6">
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                <h3 className="text-sm font-bold mb-1" style={{ color: "#1B2A4A" }}>Primary — Mac vs Windows Warranty Expiry by Quarter</h3>
                <p className="text-xs text-slate-400 mb-4">{warrantyFY} · based on warranty expiry date</p>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={warrantyQtrData} barCategoryGap="30%" margin={{ top: 18, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                    <Tooltip contentStyle={{ borderRadius: 10, fontSize: 12 }} />
                    <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="primaryMac"     name="Primary Mac"     fill="#FF4A1C" radius={[4,4,0,0]}><LabelList dataKey="primaryMac"     position="top" style={{ fontSize: 11, fontWeight: 700, fill: "#FF4A1C" }} formatter={(v: number) => v || ""} /></Bar>
                    <Bar dataKey="primaryWindows" name="Primary Windows" fill="#1B2A4A" radius={[4,4,0,0]}><LabelList dataKey="primaryWindows" position="top" style={{ fontSize: 11, fontWeight: 700, fill: "#1B2A4A" }} formatter={(v: number) => v || ""} /></Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                <h3 className="text-sm font-bold mb-1" style={{ color: "#1B2A4A" }}>Secondary — Mac vs Windows Warranty Expiry by Quarter</h3>
                <p className="text-xs text-slate-400 mb-4">{warrantyFY} · based on warranty expiry date</p>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={warrantyQtrData} barCategoryGap="30%" margin={{ top: 18, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                    <Tooltip contentStyle={{ borderRadius: 10, fontSize: 12 }} />
                    <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="secondaryMac"     name="Secondary Mac"     fill="#EA580C" radius={[4,4,0,0]}><LabelList dataKey="secondaryMac"     position="top" style={{ fontSize: 11, fontWeight: 700, fill: "#EA580C" }} formatter={(v: number) => v || ""} /></Bar>
                    <Bar dataKey="secondaryWindows" name="Secondary Windows" fill="#8BA3B8" radius={[4,4,0,0]}><LabelList dataKey="secondaryWindows" position="top" style={{ fontSize: 11, fontWeight: 700, fill: "#6B7280" }} formatter={(v: number) => v || ""} /></Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Full breakdown table */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100" style={{ background: "#1B2A4A" }}>
                <h3 className="text-sm font-semibold text-white">Warranty Expiry Quarter-wise Summary — {warrantyFY}</h3>
                <p className="text-xs mt-0.5" style={{ color: "#8BA3B8" }}>Q1 = Feb–Apr · Q2 = May–Jul · Q3 = Aug–Oct · Q4 = Nov–Jan · based on warranty expiry date</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                      <th className="px-5 py-3 text-left font-semibold" rowSpan={2}>Quarter</th>
                      <th className="px-3 py-2 text-center font-semibold border-b border-slate-100" colSpan={3} style={{ color: "#FF4A1C" }}>Primary</th>
                      <th className="px-3 py-2 text-center font-semibold border-b border-slate-100" colSpan={3} style={{ color: "#8BA3B8" }}>Secondary</th>
                      <th className="px-3 py-2 text-center font-semibold" rowSpan={2} style={{ color: "#1B2A4A" }}>Grand Total</th>
                    </tr>
                    <tr className="bg-slate-50 text-xs text-slate-500">
                      <th className="px-4 py-2 text-center font-semibold" style={{ color: "#FF4A1C" }}>Mac</th>
                      <th className="px-4 py-2 text-center font-semibold" style={{ color: "#1B2A4A" }}>Windows</th>
                      <th className="px-4 py-2 text-center font-semibold text-slate-500">Sub Total</th>
                      <th className="px-4 py-2 text-center font-semibold" style={{ color: "#EA580C" }}>Mac</th>
                      <th className="px-4 py-2 text-center font-semibold" style={{ color: "#8BA3B8" }}>Windows</th>
                      <th className="px-4 py-2 text-center font-semibold text-slate-500">Sub Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {warrantyQtrData.map((row) => {
                      const primTotal = row.primaryMac + row.primaryWindows;
                      const secTotal  = row.secondaryMac + row.secondaryWindows;
                      return (
                        <tr key={row.label} className="hover:bg-amber-50/30 transition-colors">
                          <td className="px-5 py-3 font-semibold text-slate-700">{row.label}</td>
                          <td className="px-4 py-3 text-center font-bold" style={{ color: "#FF4A1C" }}>{row.primaryMac}</td>
                          <td className="px-4 py-3 text-center font-bold" style={{ color: "#1B2A4A" }}>{row.primaryWindows}</td>
                          <td className="px-4 py-3 text-center font-semibold text-slate-600 bg-orange-50/40">{primTotal}</td>
                          <td className="px-4 py-3 text-center font-bold" style={{ color: "#EA580C" }}>{row.secondaryMac}</td>
                          <td className="px-4 py-3 text-center font-bold" style={{ color: "#8BA3B8" }}>{row.secondaryWindows}</td>
                          <td className="px-4 py-3 text-center font-semibold text-slate-600 bg-slate-50/60">{secTotal}</td>
                          <td className="px-4 py-3 text-center font-bold" style={{ color: "#1B2A4A" }}>{primTotal + secTotal}</td>
                        </tr>
                      );
                    })}
                    <tr className="font-bold text-sm border-t-2 border-slate-200" style={{ background: "#F5F1EB" }}>
                      <td className="px-5 py-3" style={{ color: "#1B2A4A" }}>FY Total</td>
                      <td className="px-4 py-3 text-center" style={{ color: "#FF4A1C" }}>{warrantyTotals.primaryMac}</td>
                      <td className="px-4 py-3 text-center" style={{ color: "#1B2A4A" }}>{warrantyTotals.primaryWindows}</td>
                      <td className="px-4 py-3 text-center text-slate-700 bg-orange-50/40">{warrantyTotals.primaryMac + warrantyTotals.primaryWindows}</td>
                      <td className="px-4 py-3 text-center" style={{ color: "#EA580C" }}>{warrantyTotals.secondaryMac}</td>
                      <td className="px-4 py-3 text-center" style={{ color: "#8BA3B8" }}>{warrantyTotals.secondaryWindows}</td>
                      <td className="px-4 py-3 text-center text-slate-700 bg-slate-50/60">{warrantyTotals.secondaryMac + warrantyTotals.secondaryWindows}</td>
                      <td className="px-4 py-3 text-center" style={{ color: "#1B2A4A" }}>
                        {warrantyTotals.primaryMac + warrantyTotals.primaryWindows + warrantyTotals.secondaryMac + warrantyTotals.secondaryWindows}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Device list */}
            {warrantyFYAssets.length > 0 && (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-700">
                    All devices with warranty expiring in {warrantyFY}
                    <span className="ml-2 text-slate-400 font-normal">({warrantyFYAssets.length})</span>
                  </h3>
                </div>
                <div className="overflow-x-auto max-h-80 scrollbar-thin">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50 text-slate-500 sticky top-0">
                      <tr>
                        <th className="px-4 py-2 text-left font-medium">User</th>
                        <th className="px-4 py-2 text-left font-medium">Model</th>
                        <th className="px-4 py-2 text-left font-medium">Serial No</th>
                        <th className="px-4 py-2 text-left font-medium">OS</th>
                        <th className="px-4 py-2 text-left font-medium">Substatus</th>
                        <th className="px-4 py-2 text-left font-medium">Location</th>
                        <th className="px-4 py-2 text-left font-medium">Warranty Expiry</th>
                        <th className="px-4 py-2 text-left font-medium">Qtr</th>
                        <th className="px-4 py-2 text-left font-medium">Days</th>
                        <th className="px-4 py-2 text-left font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {warrantyFYAssets
                        .slice()
                        .sort((a, b) => a.warrantyExpiry.localeCompare(b.warrantyExpiry))
                        .map((a) => {
                          const daysLeft = Math.ceil((new Date(a.warrantyExpiry).getTime() - Date.now()) / 86_400_000);
                          const wInfo    = getFiscalInfo(a.warrantyExpiry);
                          return (
                            <tr key={a.id} className="hover:bg-amber-50/20">
                              <td className="px-4 py-2 font-medium text-slate-700">{a.userName}</td>
                              <td className="px-4 py-2 text-slate-600">{a.laptopModel || "—"}</td>
                              <td className="px-4 py-2 font-mono text-slate-500">{a.serialNo}</td>
                              <td className="px-4 py-2">
                                <span className={cn("font-semibold px-2 py-0.5 rounded-full text-[11px]",
                                  getOsType(a.laptopModel) === "Mac" ? "bg-orange-50 text-orange-700" : "bg-slate-100 text-slate-600")}>
                                  {getOsType(a.laptopModel)}
                                </span>
                              </td>
                              <td className="px-4 py-2">
                                <span className={cn("font-semibold px-2 py-0.5 rounded-full text-[11px]",
                                  a.substatus === "Primary" ? "bg-orange-50 text-orange-700" : "bg-slate-100 text-slate-600")}>
                                  {a.substatus}
                                </span>
                              </td>
                              <td className="px-4 py-2 text-slate-500">{a.location || "—"}</td>
                              <td className="px-4 py-2 font-medium text-slate-700">{a.warrantyExpiry}</td>
                              <td className="px-4 py-2 text-slate-500">{wInfo ? Q_LABELS[wInfo.q - 1].split(" ")[0] : "—"}</td>
                              <td className="px-4 py-2">
                                <span className={cn("font-semibold text-[11px] px-2 py-0.5 rounded-full",
                                  daysLeft < 0 ? "bg-red-50 text-red-600" :
                                  daysLeft <= 30 ? "bg-orange-50 text-orange-600" :
                                  "bg-yellow-50 text-yellow-700")}>
                                  {daysLeft < 0 ? `${Math.abs(daysLeft)}d expired` : `${daysLeft}d left`}
                                </span>
                              </td>
                              <td className="px-4 py-2">
                                <span className={cn("text-[11px] font-semibold px-2 py-0.5 rounded-full",
                                  a.status === "Active" ? "bg-green-50 text-green-700" : "bg-slate-100 text-slate-500")}>
                                  {a.status}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </div>

    </div>
  );
}
