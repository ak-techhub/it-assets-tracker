"use client";
import { useState, useCallback } from "react";
import ExcelUpload from "@/components/ExcelUpload";
import RequestsTable from "@/components/RequestsTable";
import HeadcountUpload from "@/components/HeadcountUpload";
import { getRequests, clearAllRequests } from "@/lib/store";
import { AccessoryRequest } from "@/lib/types";
import { Trash2, RefreshCw, Clock } from "lucide-react";

const LAST_IMPORT_KEY = "it_assets_last_import";

function getLastImport(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(LAST_IMPORT_KEY);
}

function setLastImport(): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(LAST_IMPORT_KEY, new Date().toISOString());
}

export default function UploadPage() {
  const [requests, setRequests] = useState<AccessoryRequest[]>(() => {
    if (typeof window !== "undefined") return getRequests();
    return [];
  });
  const [lastImport, setLastImportState] = useState<string | null>(() => getLastImport());

  const refresh = useCallback(() => setRequests(getRequests()), []);

  const handleImported = () => {
    setLastImport();
    setLastImportState(new Date().toISOString());
    refresh();
  };

  const handleClear = () => {
    if (confirm("Delete ALL imported requests and tracking data? This cannot be undone.")) {
      clearAllRequests();
      localStorage.removeItem(LAST_IMPORT_KEY);
      setRequests([]);
      setLastImportState(null);
    }
  };

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleString("en-GB", {
      day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Import &amp; Manage Requests</h1>
          <p className="text-slate-500 text-sm mt-1">
            Upload a ServiceNow Excel export. Re-uploading always preserves your saved collection and IT dispatch records.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {lastImport && (
            <span className="flex items-center gap-1.5 text-xs text-slate-400 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
              <Clock size={12} /> Last import: {fmtDate(lastImport)}
            </span>
          )}
          <button
            onClick={refresh}
            className="flex items-center gap-1.5 px-3 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50"
          >
            <RefreshCw size={14} /> Refresh
          </button>
          {requests.length > 0 && (
            <button
              onClick={handleClear}
              className="flex items-center gap-1.5 px-3 py-2 text-sm text-red-600 border border-red-200 rounded-lg hover:bg-red-50"
            >
              <Trash2 size={14} /> Clear All
            </button>
          )}
        </div>
      </div>

      {/* Merge behaviour explanation */}
      <div className="bg-indigo-50 border border-indigo-200 rounded-xl px-5 py-4 text-sm text-indigo-800 space-y-1.5">
        <p className="font-semibold text-indigo-900">How re-import works</p>
        <ul className="space-y-1 text-xs text-indigo-700 list-none">
          <li>✅ <strong>Existing employees</strong> — ServiceNow fields (state, approval, assigned to) are refreshed from the new file.</li>
          <li>✅ <strong>New employees or new RITMs</strong> in the Excel are added automatically.</li>
          <li>🔒 <strong>Collection status, IT dispatch actions, dates, and notes</strong> you recorded are never overwritten.</li>
          <li>📂 <strong>Employees absent</strong> from the new Excel remain in the system with all their data.</li>
        </ul>
      </div>

      {/* Upload */}
      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <h2 className="text-base font-semibold text-slate-700 mb-4">Upload ServiceNow Excel</h2>
        <ExcelUpload onImported={handleImported} />
      </section>

      {/* Headcount / employee directory */}
      <section>
        <h2 className="text-base font-semibold text-slate-700 mb-3">Employee Directory (for Email Auto-fill)</h2>
        <HeadcountUpload onUpdated={() => {}} />
      </section>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-4 py-3">
        <span className="font-medium text-slate-600">Legend:</span>
        <span><span className="inline-block w-2 h-2 rounded-full bg-green-400 mr-1" />SN Approval: <strong>Approved</strong></span>
        <span><span className="inline-block w-2 h-2 rounded-full bg-yellow-400 mr-1" />SN Approval: <strong>Pending</strong> (Requested)</span>
        <span><span className="inline-block w-2 h-2 rounded-full bg-orange-400 mr-1" />SN Approval: <strong>Not Approved</strong></span>
        <span><span className="inline-block w-2 h-2 rounded-full bg-red-400 mr-1" />SN Approval: <strong>Rejected</strong></span>
        <span><span className="inline-block w-2 h-2 rounded-full bg-blue-400 mr-1" />SN State: <strong>Work in Progress</strong></span>
        <span><span className="inline-block w-2 h-2 rounded-full bg-green-400 mr-1" />SN State: <strong>Closed Complete</strong></span>
        <span><span className="inline-block w-2 h-2 rounded-full bg-yellow-400 mr-1" />Collection: <strong>Pending</strong> (not yet actioned)</span>
      </div>

      {/* Requests table */}
      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-slate-700">
            All Requests{" "}
            <span className="text-slate-400 font-normal ml-1">({requests.length})</span>
          </h2>
        </div>
        <RequestsTable requests={requests} onUpdate={refresh} />
      </section>
    </div>
  );
}
