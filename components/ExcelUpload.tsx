"use client";
import { useCallback, useRef, useState } from "react";
import {
  Upload, FileSpreadsheet, CheckCircle, AlertCircle, X, Download,
  UserPlus, RefreshCw, PackagePlus, Shield, ChevronDown, ChevronUp,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { parseExcelToRequests } from "@/lib/utils";
import { mergeRequests, MergeResult } from "@/lib/store";
import { downloadTemplate } from "@/lib/template";

interface Props {
  onImported: (count: number) => void;
}

export default function ExcelUpload({ onImported }: Props) {
  const [dragging, setDragging]     = useState(false);
  const [status, setStatus]         = useState<"idle" | "loading" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg]     = useState("");
  const [mergeResult, setMergeResult] = useState<MergeResult | null>(null);
  const [fileName, setFileName]     = useState("");
  const [showColumns, setShowColumns] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const processFile = async (file: File) => {
    if (!file.name.match(/\.(xlsx|xls|csv)$/i)) {
      setStatus("error");
      setErrorMsg("Please upload an Excel (.xlsx, .xls) or CSV file.");
      return;
    }
    setStatus("loading");
    setMergeResult(null);
    try {
      const buffer   = await file.arrayBuffer();
      const requests = parseExcelToRequests(buffer);
      if (requests.length === 0) {
        setStatus("error");
        setErrorMsg("No valid rows found. Check that your columns match the expected format.");
        return;
      }
      const result = mergeRequests(requests);
      setMergeResult(result);
      setFileName(file.name);
      setStatus("success");
      onImported(requests.length);
    } catch (e) {
      setStatus("error");
      setErrorMsg("Failed to parse file. " + (e instanceof Error ? e.message : ""));
    }
  };

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const reset = () => { setStatus("idle"); setMergeResult(null); setErrorMsg(""); };

  return (
    <div className="space-y-4">
      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        className={cn(
          "border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors",
          dragging ? "border-indigo-400 bg-indigo-50" : "border-slate-300 hover:border-indigo-300 hover:bg-slate-50"
        )}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) processFile(f); e.target.value = ""; }}
        />
        <FileSpreadsheet className="mx-auto mb-3 text-indigo-400" size={40} />
        <p className="text-slate-700 font-medium mb-1">Drop your Excel file here, or click to browse</p>
        <p className="text-sm text-slate-400">.xlsx, .xls, .csv — max 50 MB</p>
        <p className="text-xs text-indigo-500 mt-2">
          Re-uploading an updated Excel will refresh ServiceNow data while keeping all your collection &amp; IT dispatch records.
        </p>
      </div>

      {/* Loading */}
      {status === "loading" && (
        <div className="flex items-center gap-2 text-sm text-slate-600 bg-slate-50 rounded-lg px-4 py-3 border border-slate-200">
          <Upload size={16} className="animate-bounce text-indigo-500" />
          Parsing and merging with saved data…
        </div>
      )}

      {/* Error */}
      {status === "error" && (
        <div className="flex items-center justify-between gap-2 text-sm text-red-700 bg-red-50 rounded-lg px-4 py-3 border border-red-200">
          <span className="flex items-center gap-2"><AlertCircle size={16} />{errorMsg}</span>
          <button onClick={reset}><X size={14} /></button>
        </div>
      )}

      {/* Success + Merge summary */}
      {status === "success" && mergeResult && (
        <div className="bg-green-50 border border-green-200 rounded-xl overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-2 text-green-700 text-sm font-medium">
              <CheckCircle size={16} />
              <span>
                <strong>&ldquo;{fileName}&rdquo;</strong> merged successfully
              </span>
            </div>
            <button onClick={reset} className="text-green-400 hover:text-green-700">
              <X size={14} />
            </button>
          </div>

          {/* Merge stats grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-green-200 border-t border-green-200 text-xs">
            <StatCell
              icon={<UserPlus size={13} />}
              label="New Employees"
              value={mergeResult.newEmployees}
              color="text-indigo-700 bg-indigo-50"
            />
            <StatCell
              icon={<RefreshCw size={13} />}
              label="Employees Updated"
              value={mergeResult.updatedEmployees}
              color="text-blue-700 bg-blue-50"
            />
            <StatCell
              icon={<PackagePlus size={13} />}
              label="New Items Added"
              value={mergeResult.newItems}
              color="text-emerald-700 bg-emerald-50"
            />
            <StatCell
              icon={<Shield size={13} />}
              label="Tracking Preserved"
              value={mergeResult.preservedItems}
              color="text-amber-700 bg-amber-50"
            />
          </div>

          {/* Detail note */}
          <div className="px-4 py-2.5 text-xs text-green-700 bg-green-50 border-t border-green-200 space-y-0.5">
            <p>
              <span className="font-semibold">{mergeResult.updatedItems} item(s)</span> had their ServiceNow data refreshed (state, assigned to, approval).
            </p>
            {mergeResult.preservedItems > 0 && (
              <p className="flex items-center gap-1">
                <Shield size={11} className="text-amber-500 shrink-0" />
                <span>
                  <span className="font-semibold">{mergeResult.preservedItems} item(s)</span> already had collection or IT dispatch records — those were <strong>kept intact</strong>.
                </span>
              </p>
            )}
          </div>
        </div>
      )}

      {/* Expected columns — collapsible */}
      <div className="bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700 overflow-hidden">
        <button
          type="button"
          onClick={() => setShowColumns((v) => !v)}
          className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-amber-100 transition-colors"
        >
          <div className="flex items-center gap-2">
            <FileSpreadsheet size={13} />
            <span className="font-semibold">Expected Excel columns (ServiceNow sc_req_item export)</span>
          </div>
          {showColumns ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
        {showColumns && (
          <div className="px-4 pb-3 space-y-1 border-t border-amber-200">
            <p className="mt-2">
              Opened &bull; Updated &bull; Requested for &bull; Request &bull; Number &bull; Item &bull;
              Quantity &bull; Assigned to &bull; Assignment group &bull; State &bull; Approval &bull;
              Short description &bull; Description &bull; Close notes &bull; Comments and Work notes
            </p>
            <p className="text-amber-600">Matches the standard ServiceNow <em>sc_req_item</em> export format.</p>
            <button
              type="button"
              onClick={downloadTemplate}
              className="mt-1 flex items-center gap-1 text-indigo-600 hover:text-indigo-800 font-medium"
            >
              <Download size={12} /> Download Template
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCell({
  icon, label, value, color,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-1 py-3 text-center", color)}>
      <div className="flex items-center gap-1 font-semibold text-base">{icon}{value}</div>
      <p className="text-[11px] opacity-80">{label}</p>
    </div>
  );
}
