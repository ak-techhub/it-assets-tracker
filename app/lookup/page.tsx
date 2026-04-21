"use client";
import { useState, useMemo, useCallback } from "react";
import { getRequests } from "@/lib/store";
import { AccessoryRequest } from "@/lib/types";
import AcknowledgmentForm from "@/components/AcknowledgmentForm";
import {
  Search, Package, CheckCircle2, Download, Users, X, Filter,
} from "lucide-react";
import { formatDate, statusColor, employeeTypeColor, exportToExcel, cn } from "@/lib/utils";

export default function LookupPage() {
  const [refreshKey, setRefreshKey] = useState(0);
  const [formKey, setFormKey]       = useState(0);   // incremented to force form remount
  const [query, setQuery] = useState("");
  const [filterApproval, setFilterApproval] = useState("All");
  const [filterType, setFilterType] = useState("All");
  const [selected, setSelected] = useState<AccessoryRequest | null>(null);

  const all = useMemo(() => getRequests(), [refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const assigneeOptions = useMemo(() => {
    const names = new Set<string>();
    all.forEach((r) => r.accessories.forEach((a) => { if (a.assignedTo?.trim()) names.add(a.assignedTo.trim()); }));
    return Array.from(names).sort();
  }, [all]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return all.filter((r) => {
      const matchQ =
        !q ||
        r.employeeName.toLowerCase().includes(q) ||
        r.accessories.some((a) => a.ritm.toLowerCase().includes(q) || a.reqNumber.toLowerCase().includes(q));
      const matchApproval = filterApproval === "All" || r.approvalState === filterApproval;
      const matchType = filterType === "All" || r.employeeType === filterType;
      return matchQ && matchApproval && matchType;
    });
  }, [all, query, filterApproval, filterType]);

  const handleAcknowledged = useCallback(() => {
    const freshAll = getRequests();
    setRefreshKey((k) => k + 1);
    setFormKey((k) => k + 1);           // force AcknowledgmentForm to remount with fresh data
    setSelected((prev) => {
      if (!prev) return prev;
      return freshAll.find((r) => r.id === prev.id) ?? prev;
    });
  }, []);

  const pendingCount = (req: AccessoryRequest) =>
    req.accessories.filter((a) => a.status === "pending").length;

  return (
    <div className="h-[calc(100vh-64px)] flex flex-col overflow-hidden">
      {/* Page header */}
      <div className="px-6 py-4 border-b border-slate-200 bg-white shrink-0">
        <h1 className="text-xl font-bold text-slate-800">Collect Accessories</h1>
        <p className="text-slate-500 text-xs mt-0.5">
          Select an employee from the list to view their accessories and record collection or IT dispatch.
        </p>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* ──────────── LEFT: Employee List ──────────── */}
        <aside className="w-80 shrink-0 border-r border-slate-200 bg-white flex flex-col overflow-hidden">
          {/* Filters */}
          <div className="p-3 border-b border-slate-100 space-y-2">
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={query}
                onChange={(e) => { setQuery(e.target.value); }}
                placeholder="Search name, RITM, REQ…"
                className="w-full pl-8 pr-3 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-indigo-300"
              />
              {query && (
                <button onClick={() => setQuery("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500">
                  <X size={12} />
                </button>
              )}
            </div>
            <div className="flex gap-2">
              <select
                value={filterApproval}
                onChange={(e) => setFilterApproval(e.target.value)}
                className="flex-1 border border-slate-200 rounded-lg px-2 py-1.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300"
              >
                {["All", "Approved", "Pending", "Not Approved", "Rejected"].map((v) => (
                  <option key={v} value={v}>{v === "All" ? "All Approvals" : v}</option>
                ))}
              </select>
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                className="flex-1 border border-slate-200 rounded-lg px-2 py-1.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300"
              >
                {["All", "New Hire", "Existing"].map((v) => (
                  <option key={v} value={v}>{v === "All" ? "All Types" : v}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-400 flex items-center gap-1">
                <Users size={12} /> {filtered.length} of {all.length} people
              </span>
              {filtered.length > 0 && (
                <button
                  onClick={() => exportToExcel(filtered)}
                  className="text-xs text-emerald-600 hover:text-emerald-700 flex items-center gap-1"
                >
                  <Download size={11} /> Export list
                </button>
              )}
            </div>
          </div>

          {/* Employee list */}
          <ul className="flex-1 overflow-y-auto divide-y divide-slate-100">
            {filtered.length === 0 ? (
              <li className="flex flex-col items-center justify-center py-12 text-slate-400 text-sm gap-2">
                <Package size={32} className="opacity-25" />
                {all.length === 0 ? "No data imported yet." : "No matches found."}
              </li>
            ) : (
              filtered.map((req) => {
                const pc = pendingCount(req);
                const isSelected = selected?.id === req.id;
                return (
                  <li
                    key={req.id}
                    onClick={() => setSelected(req)}
                    className={cn(
                      "px-3 py-3 cursor-pointer transition-colors hover:bg-indigo-50/50 border-l-2",
                      isSelected
                        ? "bg-indigo-50 border-l-indigo-500"
                        : "border-l-transparent"
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className={cn(
                          "w-8 h-8 rounded-full flex items-center justify-center font-semibold text-sm shrink-0",
                          isSelected ? "bg-indigo-500 text-white" : "bg-indigo-100 text-indigo-600"
                        )}>
                          {(req.employeeName || "?")[0].toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className={cn("text-sm font-medium truncate", isSelected ? "text-indigo-800" : "text-slate-800")}>
                            {req.employeeName}
                          </p>
                          <p className="text-[10px] text-slate-400 truncate">
                            {req.accessories[0]?.assignedTo || req.accessories[0]?.assignmentGroup || "—"}
                          </p>
                        </div>
                      </div>
                      <div className="shrink-0 flex flex-col items-end gap-1">
                        <span className={cn("text-[10px] font-medium px-1.5 py-0.5 rounded-full", employeeTypeColor(req.employeeType))}>
                          {req.employeeType}
                        </span>
                      </div>
                    </div>
                    <div className="mt-1.5 ml-10 flex items-center gap-2">
                      <span className={cn("text-[10px] font-medium px-1.5 py-0.5 rounded-full", statusColor(req.approvalState))}>
                        {req.approvalState}
                      </span>
                      {pc > 0 ? (
                        <span className="text-[10px] text-amber-600 font-medium">{pc} pending</span>
                      ) : (
                        <span className="text-[10px] text-green-600 flex items-center gap-0.5">
                          <CheckCircle2 size={10} /> All done
                        </span>
                      )}
                      <span className="text-[10px] text-slate-400">{req.accessories.length} item{req.accessories.length !== 1 ? "s" : ""}</span>
                    </div>
                  </li>
                );
              })
            )}
          </ul>
        </aside>

        {/* ──────────── RIGHT: Detail Panel ──────────── */}
        <main className="flex-1 overflow-y-auto bg-slate-50">
          {!selected ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-3">
              <Filter size={48} className="opacity-20" />
              <p className="font-medium">Select an employee from the list</p>
              <p className="text-sm">Their accessories and actions will appear here.</p>
            </div>
          ) : (
            <div className="p-6 max-w-3xl mx-auto space-y-4">
              {/* Detail header */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm px-5 py-4 flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-full bg-indigo-500 text-white flex items-center justify-center font-bold text-lg shrink-0">
                    {(selected.employeeName || "?")[0].toUpperCase()}
                  </div>
                  <div>
                    <h2 className="text-base font-semibold text-slate-800">{selected.employeeName}</h2>
                    <div className="flex items-center flex-wrap gap-2 mt-1">
                      <span className={cn("text-xs font-medium px-2 py-0.5 rounded-full", employeeTypeColor(selected.employeeType))}>
                        {selected.employeeType}
                      </span>
                      <span className={cn("text-xs font-medium px-2 py-0.5 rounded-full", statusColor(selected.approvalState))}>
                        {selected.approvalState}
                      </span>
                      {selected.accessories[0]?.assignedTo && (
                        <span className="text-xs text-slate-500">
                          Assigned: <strong>{selected.accessories[0].assignedTo}</strong>
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => exportToExcel([selected])}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-emerald-700 border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 rounded-lg transition-colors"
                  >
                    <Download size={13} /> Export
                  </button>
                  <button
                    onClick={() => setSelected(null)}
                    className="flex items-center gap-1 px-3 py-1.5 text-xs text-slate-500 hover:text-slate-700 border border-slate-200 rounded-lg"
                  >
                    <X size={13} /> Close
                  </button>
                </div>
              </div>

              {/* Acknowledgment form with tabs */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <AcknowledgmentForm
                  key={`${selected.id}-${formKey}`}
                  request={selected}
                  assigneeOptions={assigneeOptions}
                  onAcknowledged={handleAcknowledged}
                />
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
