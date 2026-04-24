"use client";
import { useState, useRef, useEffect, useMemo } from "react";
import { getRequests, getReportSummary } from "@/lib/store";
import { getHardwareAssets } from "@/lib/hardware";
import { AccessoryRequest, AccessoryItem, HardwareAsset } from "@/lib/types";
import { exportToExcel, formatDate, deliveryLabel, statusColor, employeeTypeColor, cn } from "@/lib/utils";
import * as XLSX from "xlsx";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, CartesianGrid,
} from "recharts";
import { Download, RefreshCw, Package, CheckCircle2, Truck, Users, X, Send, Laptop } from "lucide-react";

const COLORS = ["#6366f1", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4"];
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
  else                          { q = 4; fyStart = yr - 1; } // Jan → prev FY Q4
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

function getAvailableFYs(assets: HardwareAsset[]): string[] {
  const set = new Set<string>();
  for (const a of assets) {
    const info = getFiscalInfo(a.assignedDate);
    if (info) set.add(info.fy);
  }
  const sorted = Array.from(set).sort().reverse();
  if (!sorted.includes("FY 2026-27")) sorted.unshift("FY 2026-27");
  return sorted;
}

// ── Drill-down result panel ──────────────────────────────────────────────────
type DrillItem = AccessoryItem & { employeeName: string; employeeType: string; approvalState: string };

function DrillPanel({
  title, items, requests, onClose,
}: {
  title: string;
  items: DrillItem[];
  requests: AccessoryRequest[];
  onClose: () => void;
}) {
  const exportDrill = () => {
    // Build a minimal AccessoryRequest list for export
    const map = new Map<string, AccessoryRequest>();
    for (const item of items) {
      const src = requests.find((r) => r.employeeName === item.employeeName);
      if (!src) continue;
      if (!map.has(src.id)) map.set(src.id, { ...src, accessories: [] });
      map.get(src.id)!.accessories.push(item);
    }
    const rows = items.map((item) => ({
      "Requested for":    item.employeeName,
      "Employee Type":    item.employeeType,
      "RITM Number":      item.ritm,
      "REQ Number":       item.reqNumber,
      "Item":             item.name,
      "Quantity":         item.quantity,
      "Assigned to":      item.assignedTo,
      "Assignment group": item.assignmentGroup,
      "ServiceNow State": item.state,
      "Approval":         item.approvalState,
      "Opened":           item.openedDate,
      "Delivery Method":  deliveryLabel(item.deliveryMethod),
      "Collection Status":item.status,
      "Collection Method":item.collectionMethod === "collect" ? "Collected from Office" : item.collectionMethod === "ship" ? "Shipment Requested" : "",
      "Collected Date":   item.collectedDate ?? "",
      "Acknowledged By":  item.acknowledgedBy ?? "",
      "IT Dispatch Type": item.itAction ? (item.itAction.shipmentType === "ship_office" ? "From Office" : "Via Vendor") : "",
      "IT Initiated Date":item.itAction?.initiatedDate ?? "",
      "IT Initiated By":  item.itAction?.initiatedBy ?? "",
      "IT Notes":         item.itAction?.notes ?? "",
      "Notes":            item.notes ?? "",
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Filtered");
    XLSX.writeFile(wb, `it-assets-${title.replace(/\s+/g, "-").toLowerCase()}-${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  return (
    <div className="bg-white rounded-2xl border-2 border-indigo-200 shadow-lg overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-indigo-50">
        <div>
          <p className="text-sm font-semibold text-indigo-800">{title}</p>
          <p className="text-xs text-indigo-500 mt-0.5">{items.length} item(s)</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={exportDrill}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors"
          >
            <Download size={13} /> Export
          </button>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-white rounded-lg transition-colors">
            <X size={16} />
          </button>
        </div>
      </div>
      <div className="overflow-x-auto max-h-72 scrollbar-thin">
        <table className="w-full text-xs">
          <thead className="bg-slate-50 text-slate-500 sticky top-0">
            <tr>
              <th className="px-4 py-2 text-left font-medium">Employee</th>
              <th className="px-4 py-2 text-left font-medium">RITM</th>
              <th className="px-4 py-2 text-left font-medium">Item</th>
              <th className="px-4 py-2 text-left font-medium">Assigned To</th>
              <th className="px-4 py-2 text-left font-medium">Status</th>
              <th className="px-4 py-2 text-left font-medium">Collected Date</th>
              <th className="px-4 py-2 text-left font-medium">Acknowledged By</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {items.map((item) => (
              <tr key={item.id} className="hover:bg-slate-50">
                <td className="px-4 py-2">
                  <div className="font-medium text-slate-800">{item.employeeName}</div>
                  <span className={cn("text-[10px] font-medium px-1.5 py-0.5 rounded-full", employeeTypeColor(item.employeeType))}>
                    {item.employeeType}
                  </span>
                </td>
                <td className="px-4 py-2 font-mono text-indigo-600">{item.ritm}</td>
                <td className="px-4 py-2 font-medium text-slate-700">{item.name}</td>
                <td className="px-4 py-2 text-slate-600">{item.assignedTo || "—"}</td>
                <td className="px-4 py-2">
                  <span className={cn("px-2 py-0.5 rounded-full font-medium capitalize", statusColor(item.status))}>
                    {item.status}
                  </span>
                </td>
                <td className="px-4 py-2 text-slate-500">{formatDate(item.collectedDate)}</td>
                <td className="px-4 py-2 text-slate-500">{item.acknowledgedBy || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────
export default function ReportsPage() {
  const [requests, setRequests] = useState<AccessoryRequest[]>(() =>
    typeof window !== "undefined" ? getRequests() : []
  );
  const [drill, setDrill] = useState<{ title: string; items: DrillItem[] } | null>(null);
  const drillRef = useRef<HTMLDivElement>(null);

  const refresh = () => { setRequests(getRequests()); setDrill(null); };
  const summary  = getReportSummary();
  const allItems = requests.flatMap((r) =>
    r.accessories.map((a) => ({
      ...a,
      employeeName:  r.employeeName,
      employeeType:  r.employeeType,
      approvalState: r.approvalState,
    }))
  ) as DrillItem[];

  const openDrill = (title: string, items: DrillItem[]) => {
    setDrill({ title, items });
    setTimeout(() => drillRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
  };

  // ── Chart data ──────────────────────────────────────────────────────────
  const approvalData = [
    { name: "Approved",     value: summary.approved },
    { name: "Pending",      value: summary.pending },
    { name: "Not Approved", value: summary.notApproved },
    { name: "Rejected",     value: summary.rejected },
  ].filter((d) => d.value > 0);

  const itemData = [
    { name: "Collected", value: summary.collected },
    { name: "Shipped",   value: summary.shipped },
    { name: "Pending",   value: summary.pendingFulfillment },
  ].filter((d) => d.value > 0);

  const newHireCount  = requests.filter((r) => r.employeeType === "New Hire").length;
  const existingCount = requests.filter((r) => r.employeeType === "Existing").length;
  const empTypeData   = [
    { name: "New Hire", value: newHireCount },
    { name: "Existing", value: existingCount },
  ];

  const assignedMap = new Map<string, { name: string; collected: number; shipped: number; pending: number }>();
  for (const item of allItems) {
    const key = item.assignedTo || "Unassigned";
    if (!assignedMap.has(key)) assignedMap.set(key, { name: key, collected: 0, shipped: 0, pending: 0 });
    const e = assignedMap.get(key)!;
    if (item.status === "collected") e.collected++;
    else if (item.status === "shipped") e.shipped++;
    else e.pending++;
  }
  const assignedData = Array.from(assignedMap.values())
    .sort((a, b) => (b.collected + b.shipped) - (a.collected + a.shipped))
    .slice(0, 10);

  const dateMap = new Map<string, { date: string; collected: number; shipped: number }>();
  for (const item of allItems) {
    if (!item.collectedDate || item.status === "pending") continue;
    if (!dateMap.has(item.collectedDate)) dateMap.set(item.collectedDate, { date: item.collectedDate, collected: 0, shipped: 0 });
    const e = dateMap.get(item.collectedDate)!;
    if (item.status === "collected") e.collected++;
    else if (item.status === "shipped") e.shipped++;
  }
  const dateData = Array.from(dateMap.values())
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((d) => ({ ...d, date: formatDate(d.date) }));

  const pendingItems = requests
    .filter((r) => r.status !== "fulfilled")
    .flatMap((r) =>
      r.accessories
        .filter((a) => a.status === "pending")
        .map((a) => ({ ...a, employeeName: r.employeeName, employeeType: r.employeeType, approvalState: r.approvalState }))
    ) as DrillItem[];

  const statCards = [
    { label: "Total People",    value: summary.totalRequests,      icon: Package,      color: "bg-indigo-50 text-indigo-600",  filter: () => allItems },
    { label: "New Hires",       value: newHireCount,               icon: Users,        color: "bg-purple-50 text-purple-600",  filter: () => allItems.filter((i) => i.employeeType === "New Hire") },
    { label: "Items Collected", value: summary.collected,          icon: CheckCircle2, color: "bg-emerald-50 text-emerald-600",filter: () => allItems.filter((i) => i.status === "collected") },
    { label: "Items Pending",   value: summary.pendingFulfillment, icon: Truck,        color: "bg-orange-50 text-orange-600",  filter: () => allItems.filter((i) => i.status === "pending") },
    { label: "IT Dispatched",   value: summary.totalDispatched,    icon: Send,         color: "bg-violet-50 text-violet-600",  filter: () => allItems.filter((i) => !!i.itAction) },
  ];

  // ── Handlers ────────────────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const onApprovalClick = (data: any) => {
    const name = String(data?.name ?? data?.activePayload?.[0]?.payload?.name ?? "");
    openDrill(`Approval: ${name}`, allItems.filter((i) => i.approvalState === name));
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const onFulfilmentClick = (data: any) => {
    const name = String(data?.name ?? "");
    const statusMap: Record<string, string> = { Collected: "collected", Shipped: "shipped", Pending: "pending" };
    const s = statusMap[name];
    openDrill(`Collection: ${name}`, allItems.filter((i) => i.status === s));
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const onEmpTypeClick = (data: any) => {
    const name = String(data?.name ?? "");
    openDrill(`Employee Type: ${name}`, allItems.filter((i) => i.employeeType === name));
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const onDateBarClick = (data: any, key: "collected" | "shipped") => {
    const dateLabel = String(data?.date ?? data?.activePayload?.[0]?.payload?.date ?? "");
    openDrill(
      `${key === "collected" ? "Collected" : "Shipped"} on ${dateLabel}`,
      allItems.filter((i) => i.status === key && formatDate(i.collectedDate) === dateLabel)
    );
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const onAssignedClick = (data: any, key: "collected" | "shipped" | "pending") => {
    const name = String(data?.name ?? "");
    openDrill(
      `${name} — ${key}`,
      allItems.filter((i) => (i.assignedTo || "Unassigned") === name && i.status === key)
    );
  };

  // IT Dispatch chart data
  const dispatchData = [
    { name: "From Office", value: summary.dispatchedOffice },
    { name: "Via Vendor",  value: summary.dispatchedVendor },
  ].filter((d) => d.value > 0);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const onDispatchClick = (data: any) => {
    const name = String(data?.name ?? "");
    const type = name === "From Office" ? "ship_office" : "ship_vendor";
    openDrill(`IT Dispatch: ${name}`, allItems.filter((i) => i.itAction?.shipmentType === type));
  };

  // IT Dispatch by assignee data
  const dispatchByAssigneeMap = new Map<string, { name: string; office: number; vendor: number }>();
  for (const item of allItems) {
    if (!item.itAction) continue;
    const key = item.itAction.initiatedBy || "Unknown";
    if (!dispatchByAssigneeMap.has(key)) dispatchByAssigneeMap.set(key, { name: key, office: 0, vendor: 0 });
    const e = dispatchByAssigneeMap.get(key)!;
    if (item.itAction.shipmentType === "ship_office") e.office++;
    else e.vendor++;
  }
  const dispatchByAssignee = Array.from(dispatchByAssigneeMap.values())
    .sort((a, b) => (b.office + b.vendor) - (a.office + a.vendor));

  // ── Hardware data ────────────────────────────────────────────────────────
  const [hwAssets, setHwAssets] = useState<HardwareAsset[]>([]);
  useEffect(() => { setHwAssets(getHardwareAssets()); }, []);

  const availableFYs = useMemo(() => getAvailableFYs(hwAssets), [hwAssets]);
  const [selectedFY, setSelectedFY] = useState("FY 2026-27");

  const hwQtrData = useMemo(() => buildHwQuarterData(hwAssets, selectedFY), [hwAssets, selectedFY]);

  const hwFYAssets = useMemo(
    () => hwAssets.filter((a) => getFiscalInfo(a.assignedDate)?.fy === selectedFY),
    [hwAssets, selectedFY]
  );

  const hwOsDonut = useMemo(() => {
    const mac = hwFYAssets.filter((a) => getOsType(a.laptopModel) === "Mac").length;
    const win = hwFYAssets.length - mac;
    return [{ name: "Mac", value: mac }, { name: "Windows", value: win }].filter((d) => d.value > 0);
  }, [hwFYAssets]);

  const hwSubDonut = useMemo(() => [
    { name: "Primary",   value: hwFYAssets.filter((a) => a.substatus === "Primary").length },
    { name: "Secondary", value: hwFYAssets.filter((a) => a.substatus === "Secondary").length },
  ].filter((d) => d.value > 0), [hwFYAssets]);

  const hwStatusDonut = useMemo(() => {
    const map = new Map<string, number>();
    for (const a of hwFYAssets) map.set(a.status, (map.get(a.status) ?? 0) + 1);
    return Array.from(map.entries()).map(([name, value]) => ({ name, value }));
  }, [hwFYAssets]);

  const hwStats = useMemo(() => ({
    total:      hwFYAssets.length,
    mac:        hwFYAssets.filter((a) => getOsType(a.laptopModel) === "Mac").length,
    windows:    hwFYAssets.filter((a) => getOsType(a.laptopModel) === "Windows").length,
    primary:    hwFYAssets.filter((a) => a.substatus === "Primary").length,
    secondary:  hwFYAssets.filter((a) => a.substatus === "Secondary").length,
    legalHold:  hwFYAssets.filter((a) => a.status === "Legal Hold").length,
    bStock:     hwFYAssets.filter((a) => a.status === "B Stock").length,
    refresh:    hwFYAssets.filter((a) => a.status === "Refresh Pending").length,
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

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Reports & Analytics</h1>
          <p className="text-slate-500 text-sm mt-1">Click any chart bar or slice to drill down and export.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={refresh} className="flex items-center gap-1.5 px-3 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">
            <RefreshCw size={14} /> Refresh
          </button>
          <button
            onClick={() => exportToExcel(requests)}
            className="flex items-center gap-2 px-5 py-2.5 text-sm bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-medium transition-colors shadow-sm"
          >
            <Download size={16} /> Download Full Report
          </button>
        </div>
      </div>

      {/* Stat cards — clickable */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {statCards.map(({ label, value, icon: Icon, color, filter }) => (
          <button
            key={label}
            onClick={() => openDrill(label, filter())}
            className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 flex items-center gap-4 hover:border-indigo-300 hover:shadow-md transition-all text-left w-full"
          >
            <div className={cn("w-11 h-11 rounded-xl flex items-center justify-center shrink-0", color)}>
              <Icon size={20} />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-800">{value}</p>
              <p className="text-xs text-slate-500 mt-0.5">{label}</p>
            </div>
          </button>
        ))}
      </div>

      {/* Export banner */}
      <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-5 py-4 flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-emerald-800">Download your collection report</p>
          <p className="text-xs text-emerald-600 mt-0.5">
            Exports 5 sheets: <strong>Summary</strong>, <strong>All Items</strong>, <strong>Collected</strong>, <strong>Shipped</strong>, <strong>Pending</strong>
          </p>
        </div>
        <button
          onClick={() => exportToExcel(requests)}
          className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg transition-colors whitespace-nowrap shrink-0"
        >
          <Download size={16} /> Download Excel Report
        </button>
      </div>

      {/* Row 1: Approval | Fulfilment | New Hire vs Existing */}
      <div className="grid lg:grid-cols-3 gap-6">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-1">Requests by Approval</h3>
          <p className="text-xs text-slate-400 mb-3">Click a bar to see details</p>
          <ResponsiveContainer width="100%" height={190}>
            <BarChart data={approvalData} barSize={36} style={{ cursor: "pointer" }}>
              <XAxis dataKey="name" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip />
              <Bar dataKey="value" radius={[6, 6, 0, 0]} onClick={onApprovalClick}>
                {approvalData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-1">Item Collection Status</h3>
          <p className="text-xs text-slate-400 mb-3">Click a slice to see details</p>
          <ResponsiveContainer width="100%" height={190}>
            <PieChart style={{ cursor: "pointer" }}>
              <Pie
                data={itemData} cx="50%" cy="50%" innerRadius={48} outerRadius={72}
                dataKey="value" paddingAngle={3}
                onClick={(data) => onFulfilmentClick(data)}
              >
                {itemData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Legend iconSize={10} iconType="circle" wrapperStyle={{ fontSize: 12 }} />
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-1">New Hire vs Existing</h3>
          <p className="text-xs text-slate-400 mb-3">Click a slice to see details</p>
          <div className="flex items-center gap-4 h-[190px]">
            <ResponsiveContainer width="55%" height="100%">
              <PieChart style={{ cursor: "pointer" }}>
                <Pie
                  data={empTypeData} cx="50%" cy="50%" innerRadius={45} outerRadius={68}
                  dataKey="value" paddingAngle={3}
                  onClick={(data) => onEmpTypeClick(data)}
                >
                  <Cell fill="#8b5cf6" />
                  <Cell fill="#94a3b8" />
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <div className="space-y-4 flex-1">
              {empTypeData.map((d, i) => (
                <button key={d.name} onClick={() => onEmpTypeClick(d)} className="w-full text-left hover:opacity-80">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-1.5">
                      <div className={`w-2.5 h-2.5 rounded-full ${i === 0 ? "bg-purple-500" : "bg-slate-400"}`} />
                      <span className="text-xs text-slate-600">{d.name}</span>
                    </div>
                    <span className="text-sm font-bold text-slate-800">{d.value}</span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-1.5">
                    <div
                      className={`h-1.5 rounded-full ${i === 0 ? "bg-purple-500" : "bg-slate-400"}`}
                      style={{ width: `${(d.value / Math.max(newHireCount + existingCount, 1)) * 100}%` }}
                    />
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Row 2: Date-wise trend | Assigned-to */}
      <div className="grid lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-1">Collections & Shipments by Date</h3>
          <p className="text-xs text-slate-400 mb-3">Click a bar to see who collected / shipped on that date</p>
          {dateData.length === 0 ? (
            <div className="flex items-center justify-center h-[200px] text-slate-400 text-sm">No collection data yet</div>
          ) : (
            <ResponsiveContainer width="100%" height={210}>
              <BarChart data={dateData} barSize={14} barGap={2} style={{ cursor: "pointer" }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip />
                <Legend iconSize={10} wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="collected" name="Collected" fill="#10b981" radius={[4, 4, 0, 0]}
                  onClick={(data) => onDateBarClick(data, "collected")} />
                <Bar dataKey="shipped"   name="Shipped"   fill="#6366f1" radius={[4, 4, 0, 0]}
                  onClick={(data) => onDateBarClick(data, "shipped")} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-1">Items by Assigned To</h3>
          <p className="text-xs text-slate-400 mb-3">Click a bar segment to see items for that assignee</p>
          {assignedData.length === 0 ? (
            <div className="flex items-center justify-center h-[210px] text-slate-400 text-sm">No data yet</div>
          ) : (
            <ResponsiveContainer width="100%" height={210}>
              <BarChart data={assignedData} layout="vertical" barSize={10} barGap={2} margin={{ left: 10 }} style={{ cursor: "pointer" }}>
                <XAxis type="number" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={120} />
                <Tooltip />
                <Legend iconSize={10} wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="collected" name="Collected" fill="#10b981" radius={[0, 4, 4, 0]} stackId="a"
                  onClick={(data) => onAssignedClick(data, "collected")} />
                <Bar dataKey="shipped"   name="Shipped"   fill="#6366f1" radius={[0, 4, 4, 0]} stackId="a"
                  onClick={(data) => onAssignedClick(data, "shipped")} />
                <Bar dataKey="pending"   name="Pending"   fill="#f59e0b" radius={[0, 4, 4, 0]} stackId="a"
                  onClick={(data) => onAssignedClick(data, "pending")} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* IT Dispatch charts */}
      {summary.totalDispatched > 0 && (
        <div className="grid lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
            <h3 className="text-sm font-semibold text-slate-700 mb-1">IT Dispatch — Office vs Vendor</h3>
            <p className="text-xs text-slate-400 mb-3">Click a slice to see dispatched items</p>
            <ResponsiveContainer width="100%" height={190}>
              <PieChart style={{ cursor: "pointer" }}>
                <Pie
                  data={dispatchData} cx="50%" cy="50%" innerRadius={48} outerRadius={72}
                  dataKey="value" paddingAngle={3}
                  onClick={onDispatchClick}
                >
                  {dispatchData.map((_, i) => <Cell key={i} fill={["#6366f1","#8b5cf6"][i % 2]} />)}
                </Pie>
                <Legend iconSize={10} iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {dispatchByAssignee.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
              <h3 className="text-sm font-semibold text-slate-700 mb-1">IT Dispatch by Assignee</h3>
              <p className="text-xs text-slate-400 mb-3">Click a bar to see items dispatched by that person</p>
              <ResponsiveContainer width="100%" height={190}>
                <BarChart data={dispatchByAssignee} barSize={20} style={{ cursor: "pointer" }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip />
                  <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="office" name="From Office" stackId="a" fill="#6366f1" radius={[0,0,0,0]}
                    onClick={(d) => openDrill(`IT Dispatch Office — ${d.name}`, allItems.filter((i) => i.itAction?.initiatedBy === d.name && i.itAction?.shipmentType === "ship_office"))} />
                  <Bar dataKey="vendor" name="Via Vendor"  stackId="a" fill="#8b5cf6" radius={[4,4,0,0]}
                    onClick={(d) => openDrill(`IT Dispatch Vendor — ${d.name}`, allItems.filter((i) => i.itAction?.initiatedBy === d.name && i.itAction?.shipmentType === "ship_vendor"))} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}

      {/* Drill-down result panel */}
      {drill && (
        <div ref={drillRef}>
          <DrillPanel
            title={drill.title}
            items={drill.items}
            requests={requests}
            onClose={() => setDrill(null)}
          />
        </div>
      )}

      {/* Pending items table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-700">
            Pending Items <span className="font-normal text-slate-400 ml-1">({pendingItems.length})</span>
          </h3>
          {pendingItems.length > 0 && (
            <button
              onClick={() => openDrill("All Pending Items", pendingItems)}
              className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
            >
              View & Export →
            </button>
          )}
        </div>
        {pendingItems.length === 0 ? (
          <div className="text-center py-10 text-slate-400 text-sm flex flex-col items-center gap-2">
            <CheckCircle2 size={32} className="opacity-30" />
            All items have been fulfilled!
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500 text-left">
                <tr>
                  <th className="px-5 py-3 font-medium">Requested For</th>
                  <th className="px-5 py-3 font-medium hidden sm:table-cell">Type</th>
                  <th className="px-5 py-3 font-medium hidden md:table-cell">Assigned To</th>
                  <th className="px-5 py-3 font-medium hidden sm:table-cell">RITM</th>
                  <th className="px-5 py-3 font-medium">Item</th>
                  <th className="px-5 py-3 font-medium">Qty</th>
                  <th className="px-5 py-3 font-medium hidden md:table-cell">Opened</th>
                  <th className="px-5 py-3 font-medium hidden lg:table-cell">Delivery</th>
                  <th className="px-5 py-3 font-medium">SN State</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pendingItems.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50">
                    <td className="px-5 py-3 font-medium text-slate-800">{item.employeeName}</td>
                    <td className="px-5 py-3 hidden sm:table-cell">
                      <span className={cn("text-xs font-medium px-2 py-0.5 rounded-full", employeeTypeColor(item.employeeType ?? "Existing"))}>
                        {item.employeeType ?? "Existing"}
                      </span>
                    </td>
                    <td className="px-5 py-3 hidden md:table-cell text-slate-600 text-sm">{item.assignedTo || "—"}</td>
                    <td className="px-5 py-3 hidden sm:table-cell font-mono text-xs text-indigo-600">{item.ritm}</td>
                    <td className="px-5 py-3 font-medium text-slate-700">{item.name}</td>
                    <td className="px-5 py-3 text-slate-600">{item.quantity}</td>
                    <td className="px-5 py-3 hidden md:table-cell text-slate-500 text-xs">{formatDate(item.openedDate)}</td>
                    <td className="px-5 py-3 hidden lg:table-cell text-slate-500 text-xs">{deliveryLabel(item.deliveryMethod)}</td>
                    <td className="px-5 py-3">
                      <span className={cn("text-xs font-medium px-2 py-0.5 rounded-full", statusColor(item.state))}>
                        {item.state}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* All Requests */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-700">
            All Requests <span className="font-normal text-slate-400 ml-1">({requests.length})</span>
          </h3>
          <button
            onClick={() => openDrill("All Items", allItems)}
            className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
          >
            View All & Export →
          </button>
        </div>
        {requests.length === 0 ? (
          <div className="text-center py-10 text-slate-400 text-sm">No data imported yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500 text-left">
                <tr>
                  <th className="px-5 py-3 font-medium">Requested For</th>
                  <th className="px-5 py-3 font-medium hidden sm:table-cell">Type</th>
                  <th className="px-5 py-3 font-medium hidden md:table-cell">Assigned To</th>
                  <th className="px-5 py-3 font-medium">Approval</th>
                  <th className="px-5 py-3 font-medium hidden md:table-cell">Items</th>
                  <th className="px-5 py-3 font-medium">Collection</th>
                  <th className="px-5 py-3 font-medium hidden lg:table-cell">Imported</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {requests.map((req) => (
                  <tr
                    key={req.id}
                    className="hover:bg-slate-50 cursor-pointer"
                    onClick={() => openDrill(
                      `${req.employeeName} — all items`,
                      req.accessories.map((a) => ({ ...a, employeeName: req.employeeName, employeeType: req.employeeType, approvalState: req.approvalState })) as DrillItem[]
                    )}
                  >
                    <td className="px-5 py-3">
                      <div className="font-medium text-slate-800">{req.employeeName}</div>
                      <div className="text-xs text-slate-400">{req.accessories[0]?.assignmentGroup}</div>
                    </td>
                    <td className="px-5 py-3 hidden sm:table-cell">
                      <span className={cn("text-xs font-medium px-2 py-0.5 rounded-full", employeeTypeColor(req.employeeType))}>
                        {req.employeeType}
                      </span>
                    </td>
                    <td className="px-5 py-3 hidden md:table-cell text-slate-700 text-sm">{req.accessories[0]?.assignedTo || "—"}</td>
                    <td className="px-5 py-3">
                      <span className={cn("text-xs font-medium px-2 py-0.5 rounded-full", statusColor(req.approvalState))}>
                        {req.approvalState}
                      </span>
                    </td>
                    <td className="px-5 py-3 hidden md:table-cell text-slate-500 text-sm">{req.accessories.length}</td>
                    <td className="px-5 py-3">
                      <div className="flex flex-col gap-0.5">
                        <span className={cn("text-xs font-medium px-2 py-0.5 rounded-full capitalize w-fit", statusColor(req.status))}>
                          {req.status.replace(/_/g, " ")}
                        </span>
                        <span className="text-xs text-slate-400">
                          {req.accessories.filter((a) => a.status !== "pending").length}/{req.accessories.length} done
                        </span>
                      </div>
                    </td>
                    <td className="px-5 py-3 hidden lg:table-cell text-slate-400 text-xs">
                      {new Date(req.importedAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          HARDWARE ASSETS REPORT
      ══════════════════════════════════════════════════════════════════════ */}
      <div className="space-y-6">
        {/* Section header + FY selector */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl text-white" style={{ background: "#1B2A4A" }}>
              <Laptop size={20} />
            </div>
            <div>
              <h2 className="text-xl font-bold" style={{ color: "#1B2A4A" }}>Hardware Assets Report</h2>
              <p className="text-slate-500 text-xs mt-0.5">Quarter-wise Mac vs Windows · Primary vs Secondary</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {/* FY selector */}
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
                { label: "Total",         value: hwStats.total,     bg: "#1B2A4A", fg: "#fff" },
                { label: "Mac",           value: hwStats.mac,       bg: "#FF4A1C", fg: "#fff" },
                { label: "Windows",       value: hwStats.windows,   bg: "#e2e8f0", fg: "#1B2A4A" },
                { label: "Primary",       value: hwStats.primary,   bg: "#FF7A50", fg: "#fff" },
                { label: "Secondary",     value: hwStats.secondary, bg: "#8BA3B8", fg: "#fff" },
                { label: "Legal Hold",    value: hwStats.legalHold, bg: "#FEE2E2", fg: "#DC2626" },
                { label: "B Stock",       value: hwStats.bStock,    bg: "#EDE9FE", fg: "#7C3AED" },
                { label: "Refresh Req",   value: hwStats.refresh,   bg: "#FFF7ED", fg: "#EA580C" },
              ].map(({ label, value, bg, fg }) => (
                <div key={label} className="rounded-2xl border border-slate-200 px-3 py-3 text-center shadow-sm"
                  style={{ background: bg }}>
                  <p className="text-2xl font-extrabold" style={{ color: fg }}>{value}</p>
                  <p className="text-[11px] font-medium mt-0.5" style={{ color: fg, opacity: 0.75 }}>{label}</p>
                </div>
              ))}
            </div>

            {/* Chart row 1 — Mac vs Windows by Quarter */}
            <div className="grid lg:grid-cols-2 gap-6">
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                <h3 className="text-sm font-bold mb-1" style={{ color: "#1B2A4A" }}>Mac vs Windows — by Quarter</h3>
                <p className="text-xs text-slate-400 mb-4">{selectedFY} · based on Assigned Date</p>
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={hwQtrData} barCategoryGap="30%">
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                    <Tooltip contentStyle={{ borderRadius: 10, fontSize: 12 }} />
                    <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="Mac"     name="Mac"     fill={HW_COLORS.Mac}     radius={[4,4,0,0]} />
                    <Bar dataKey="Windows" name="Windows" fill={HW_COLORS.Windows} radius={[4,4,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Primary vs Secondary by Quarter */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                <h3 className="text-sm font-bold mb-1" style={{ color: "#1B2A4A" }}>Primary vs Secondary — by Quarter</h3>
                <p className="text-xs text-slate-400 mb-4">{selectedFY} · based on Assigned Date</p>
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={hwQtrData} barCategoryGap="30%">
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                    <Tooltip contentStyle={{ borderRadius: 10, fontSize: 12 }} />
                    <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="Primary"   name="Primary"   fill={HW_COLORS.Primary}   radius={[4,4,0,0]} />
                    <Bar dataKey="Secondary" name="Secondary" fill={HW_COLORS.Secondary} radius={[4,4,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Chart row 2 — Donut breakdowns */}
            <div className="grid lg:grid-cols-3 gap-6">
              {/* OS donut */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 flex flex-col">
                <h3 className="text-sm font-bold mb-1" style={{ color: "#1B2A4A" }}>OS Type Split</h3>
                <p className="text-xs text-slate-400 mb-2">{selectedFY} total</p>
                <div className="flex-1 flex items-center justify-center">
                  <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                      <Pie data={hwOsDonut} dataKey="value" nameKey="name" cx="50%" cy="50%"
                        innerRadius={55} outerRadius={80} paddingAngle={3}
                        label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
                        labelLine={false}>
                        {hwOsDonut.map((d) => (
                          <Cell key={d.name} fill={HW_COLORS[d.name as keyof typeof HW_COLORS] ?? "#94a3b8"} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={{ borderRadius: 10, fontSize: 12 }} />
                      <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Substatus donut */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 flex flex-col">
                <h3 className="text-sm font-bold mb-1" style={{ color: "#1B2A4A" }}>Primary vs Secondary</h3>
                <p className="text-xs text-slate-400 mb-2">{selectedFY} total</p>
                <div className="flex-1 flex items-center justify-center">
                  <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                      <Pie data={hwSubDonut} dataKey="value" nameKey="name" cx="50%" cy="50%"
                        innerRadius={55} outerRadius={80} paddingAngle={3}
                        label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
                        labelLine={false}>
                        {hwSubDonut.map((d) => (
                          <Cell key={d.name} fill={HW_COLORS[d.name as keyof typeof HW_COLORS] ?? "#94a3b8"} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={{ borderRadius: 10, fontSize: 12 }} />
                      <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Status donut */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 flex flex-col">
                <h3 className="text-sm font-bold mb-1" style={{ color: "#1B2A4A" }}>Asset Status Mix</h3>
                <p className="text-xs text-slate-400 mb-2">{selectedFY} total</p>
                <div className="flex-1 flex items-center justify-center">
                  <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                      <Pie data={hwStatusDonut} dataKey="value" nameKey="name" cx="50%" cy="50%"
                        innerRadius={55} outerRadius={80} paddingAngle={3}
                        label={({ percent }) => `${((percent ?? 0) * 100).toFixed(0)}%`}
                        labelLine={false}>
                        {hwStatusDonut.map((d, i) => (
                          <Cell key={d.name} fill={COLORS[i % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={{ borderRadius: 10, fontSize: 12 }} />
                      <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/* Quarter breakdown table */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100" style={{ background: "#1B2A4A" }}>
                <h3 className="text-sm font-semibold text-white">Quarter-wise Summary — {selectedFY}</h3>
                <p className="text-xs mt-0.5" style={{ color: "#8BA3B8" }}>Q1 = Feb–Apr · Q2 = May–Jul · Q3 = Aug–Oct · Q4 = Nov–Jan</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-xs uppercase tracking-wide bg-slate-50 text-slate-500">
                    <tr>
                      <th className="px-5 py-3 text-left font-semibold">Quarter</th>
                      <th className="px-5 py-3 text-center font-semibold" style={{ color: "#FF4A1C" }}>Mac</th>
                      <th className="px-5 py-3 text-center font-semibold" style={{ color: "#1B2A4A" }}>Windows</th>
                      <th className="px-5 py-3 text-center font-semibold text-slate-600">Total OS</th>
                      <th className="px-5 py-3 text-center font-semibold" style={{ color: "#FF7A50" }}>Primary</th>
                      <th className="px-5 py-3 text-center font-semibold" style={{ color: "#8BA3B8" }}>Secondary</th>
                      <th className="px-5 py-3 text-center font-semibold text-slate-600">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {hwQtrData.map((row) => (
                      <tr key={row.label} className="hover:bg-orange-50/30 transition-colors">
                        <td className="px-5 py-3 font-semibold text-slate-700">{row.label}</td>
                        <td className="px-5 py-3 text-center font-bold" style={{ color: "#FF4A1C" }}>{row.Mac}</td>
                        <td className="px-5 py-3 text-center font-bold" style={{ color: "#1B2A4A" }}>{row.Windows}</td>
                        <td className="px-5 py-3 text-center text-slate-600 font-medium">{row.Mac + row.Windows}</td>
                        <td className="px-5 py-3 text-center font-bold" style={{ color: "#FF7A50" }}>{row.Primary}</td>
                        <td className="px-5 py-3 text-center font-bold" style={{ color: "#8BA3B8" }}>{row.Secondary}</td>
                        <td className="px-5 py-3 text-center text-slate-600 font-medium">{row.Primary + row.Secondary}</td>
                      </tr>
                    ))}
                    {/* Totals row */}
                    <tr className="font-bold text-sm border-t-2 border-slate-200" style={{ background: "#F5F1EB" }}>
                      <td className="px-5 py-3" style={{ color: "#1B2A4A" }}>FY Total</td>
                      <td className="px-5 py-3 text-center" style={{ color: "#FF4A1C" }}>{hwStats.mac}</td>
                      <td className="px-5 py-3 text-center" style={{ color: "#1B2A4A" }}>{hwStats.windows}</td>
                      <td className="px-5 py-3 text-center text-slate-700">{hwStats.total}</td>
                      <td className="px-5 py-3 text-center" style={{ color: "#FF7A50" }}>{hwStats.primary}</td>
                      <td className="px-5 py-3 text-center" style={{ color: "#8BA3B8" }}>{hwStats.secondary}</td>
                      <td className="px-5 py-3 text-center text-slate-700">{hwStats.total}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>

    </div>
  );
}
