"use client";
import React, { useState } from "react";
import { Trash2, ChevronDown, ChevronUp, Package, Send, Building2, Store } from "lucide-react";
import { AccessoryRequest } from "@/lib/types";
import { formatDate, deliveryLabel, statusColor, employeeTypeColor, cn } from "@/lib/utils";
import { deleteRequest } from "@/lib/store";

interface Props {
  requests: AccessoryRequest[];
  onUpdate: () => void;
}

export default function RequestsTable({ requests, onUpdate }: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [filterApproval, setFilterApproval] = useState("All");
  const [filterStatus, setFilterStatus] = useState("All");
  const [filterType, setFilterType] = useState("All");

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const filtered = requests.filter((r) => {
    const q = search.toLowerCase();
    const matchSearch =
      !q ||
      r.employeeName.toLowerCase().includes(q) ||
      r.accessories.some(
        (a) =>
          a.ritm.toLowerCase().includes(q) ||
          a.reqNumber.toLowerCase().includes(q) ||
          a.name.toLowerCase().includes(q)
      );
    const matchApproval = filterApproval === "All" || r.approvalState === filterApproval;
    const matchStatus = filterStatus === "All" || r.status === filterStatus;
    const matchType = filterType === "All" || r.employeeType === filterType;
    return matchSearch && matchApproval && matchStatus && matchType;
  });

  if (requests.length === 0) {
    return (
      <div className="text-center py-16 text-slate-400">
        <Package size={48} className="mx-auto mb-3 opacity-30" />
        <p className="font-medium">No requests yet</p>
        <p className="text-sm">Import an Excel file above to get started.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by employee name, RITM or REQ…"
          className="flex-1 min-w-52 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
        />
        <select
          value={filterApproval}
          onChange={(e) => setFilterApproval(e.target.value)}
          className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white"
        >
          {["All", "Approved", "Pending", "Not Approved", "Rejected"].map((v) => (
            <option key={v}>{v === "All" ? "All Approvals" : v}</option>
          ))}
        </select>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white"
        >
          {["All", "pending", "partially_fulfilled", "fulfilled"].map((v) => (
            <option key={v} value={v}>
              {v === "All" ? "All Statuses" : v.replace("_", " ")}
            </option>
          ))}
        </select>
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white"
        >
          {["All", "New Hire", "Existing"].map((v) => (
            <option key={v}>{v === "All" ? "All Types" : v}</option>
          ))}
        </select>
        <span className="self-center text-sm text-slate-500">
          {filtered.length} of {requests.length} shown
        </span>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-slate-200 overflow-hidden bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600 text-left">
            <tr>
              <th className="px-4 py-3 font-medium w-8"></th>
              <th className="px-4 py-3 font-medium">Requested For</th>
              <th className="px-4 py-3 font-medium hidden sm:table-cell">Type</th>
              <th className="px-4 py-3 font-medium hidden md:table-cell">Assigned To</th>
              <th className="px-4 py-3 font-medium hidden md:table-cell">Items</th>
              <th className="px-4 py-3 font-medium">SN Approval</th>
              <th className="px-4 py-3 font-medium hidden lg:table-cell">Earliest Request</th>
              <th className="px-4 py-3 font-medium">Collection</th>
              <th className="px-4 py-3 font-medium w-10"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.map((req) => (
              <React.Fragment key={req.id}>
                <tr
                  className="hover:bg-slate-50 cursor-pointer"
                  onClick={() => toggle(req.id)}
                >
                  <td className="px-4 py-3 text-slate-400">
                    {expanded.has(req.id) ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-800">{req.employeeName}</div>
                    <div className="text-xs text-slate-400 mt-0.5">
                      {req.accessories[0]?.assignmentGroup}
                    </div>
                  </td>
                  <td className="px-4 py-3 hidden sm:table-cell">
                    <span className={cn("text-xs font-medium px-2 py-1 rounded-full", employeeTypeColor(req.employeeType))}>
                      {req.employeeType}
                    </span>
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell text-slate-600 text-sm">
                    {req.accessories[0]?.assignedTo || "—"}
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell text-slate-600">
                    {req.accessories.length} item{req.accessories.length !== 1 ? "s" : ""}
                  </td>
                  <td className="px-4 py-3">
                    <span className={cn("text-xs font-medium px-2 py-1 rounded-full", statusColor(req.approvalState))}>
                      {req.approvalState}
                    </span>
                  </td>
                  <td className="px-4 py-3 hidden lg:table-cell text-slate-500 text-xs">
                    {formatDate(req.accessories.slice().sort((a, b) => a.openedDate.localeCompare(b.openedDate))[0]?.openedDate)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-1">
                      <span className={cn("text-xs font-medium px-2 py-1 rounded-full capitalize w-fit", statusColor(req.status))}>
                        {req.status.replace(/_/g, " ")}
                      </span>
                      <span className="text-xs text-slate-400">
                        {req.accessories.filter(a => a.status !== 'pending').length}/{req.accessories.length} done
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={(e) => { e.stopPropagation(); deleteRequest(req.id); onUpdate(); }}
                      className="text-slate-300 hover:text-red-500 transition-colors"
                    >
                      <Trash2 size={15} />
                    </button>
                  </td>
                </tr>

                {expanded.has(req.id) && (
                  <tr key={`${req.id}-exp`} className="bg-slate-50">
                    <td colSpan={9} className="px-6 py-4">
                      <div className="mb-2 text-xs text-slate-500 font-medium uppercase tracking-wide">
                        Accessories ({req.accessories.length})
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs border border-slate-200 rounded-lg overflow-hidden">
                          <thead className="bg-white text-slate-500">
                            <tr>
                              <th className="px-3 py-2 text-left font-medium">RITM</th>
                              <th className="px-3 py-2 text-left font-medium">REQ</th>
                              <th className="px-3 py-2 text-left font-medium">Item</th>
                              <th className="px-3 py-2 text-left font-medium">Qty</th>
                              <th className="px-3 py-2 text-left font-medium">Opened</th>
                              <th className="px-3 py-2 text-left font-medium">Delivery</th>
                              <th className="px-3 py-2 text-left font-medium">
                                ServiceNow State
                                <span className="block text-slate-400 font-normal text-[10px]">from SN ticket</span>
                              </th>
                              <th className="px-3 py-2 text-left font-medium">
                                Collection Status
                                <span className="block text-slate-400 font-normal text-[10px]">tracked here</span>
                              </th>
                              <th className="px-3 py-2 text-left font-medium">
                                IT Dispatch
                                <span className="block text-slate-400 font-normal text-[10px]">Office / Vendor</span>
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 bg-white">
                            {req.accessories.map((item) => (
                              <tr key={item.id} className="hover:bg-slate-50">
                                <td className="px-3 py-2 font-mono text-indigo-600">{item.ritm}</td>
                                <td className="px-3 py-2 font-mono text-slate-500">{item.reqNumber}</td>
                                <td className="px-3 py-2 font-medium text-slate-700">{item.name}</td>
                                <td className="px-3 py-2 text-slate-500">{item.quantity}</td>
                                <td className="px-3 py-2 text-slate-500">{formatDate(item.openedDate)}</td>
                                <td className="px-3 py-2 text-slate-500">{deliveryLabel(item.deliveryMethod)}</td>
                                <td className="px-3 py-2">
                                  <span className={cn("px-1.5 py-0.5 rounded-full font-medium", statusColor(item.state))}>
                                    {item.state}
                                  </span>
                                </td>
                                <td className="px-3 py-2">
                                  <span className={cn("px-1.5 py-0.5 rounded-full font-medium capitalize", statusColor(item.status))}>
                                    {item.status}
                                  </span>
                                </td>
                                <td className="px-3 py-2">
                                  {item.itAction ? (
                                    <div className="space-y-0.5">
                                      <span className={cn(
                                        "inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full font-medium text-[11px]",
                                        item.itAction.shipmentType === "ship_office"
                                          ? "bg-indigo-100 text-indigo-700"
                                          : "bg-violet-100 text-violet-700"
                                      )}>
                                        {item.itAction.shipmentType === "ship_office"
                                          ? <><Building2 size={10} /> Office</>
                                          : <><Store size={10} /> Vendor</>}
                                      </span>
                                      <div className="text-[10px] text-slate-400">{formatDate(item.itAction.initiatedDate)}</div>
                                      <div className="text-[10px] text-slate-500 truncate max-w-[100px]" title={item.itAction.initiatedBy}>
                                        {item.itAction.initiatedBy}
                                      </div>
                                    </div>
                                  ) : (
                                    <span className="text-slate-300 text-[11px] flex items-center gap-1">
                                      <Send size={10} /> —
                                    </span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="text-center py-10 text-slate-400 text-sm">
            No requests match your filters.
          </div>
        )}
      </div>
    </div>
  );
}
