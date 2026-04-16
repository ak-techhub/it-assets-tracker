"use client";
import { useState, useRef } from "react";
import { getRequests, getReportSummary } from "@/lib/store";
import { AccessoryRequest, AccessoryItem } from "@/lib/types";
import { exportToExcel, formatDate, deliveryLabel, statusColor, employeeTypeColor, cn } from "@/lib/utils";
import * as XLSX from "xlsx";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, CartesianGrid,
} from "recharts";
import { Download, RefreshCw, Package, CheckCircle2, Truck, Users, X } from "lucide-react";

const COLORS = ["#6366f1", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4"];

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
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
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
    </div>
  );
}
