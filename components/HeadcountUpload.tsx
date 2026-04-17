"use client";
import { useRef, useState, useEffect } from "react";
import {
  Users, Upload, CheckCircle, AlertCircle, X, Trash2,
  ChevronDown, ChevronUp, FileSpreadsheet,
} from "lucide-react";
import { parseAndMergeHeadcount, clearContacts, getContacts, HeadcountMergeResult } from "@/lib/headcount";
import { cn } from "@/lib/utils";

interface Props {
  onUpdated: () => void;
}

export default function HeadcountUpload({ onUpdated }: Props) {
  const [status, setStatus]   = useState<"idle" | "loading" | "success" | "error">("idle");
  const [result, setResult]   = useState<HeadcountMergeResult | null>(null);
  const [errMsg, setErrMsg]   = useState("");
  const [expanded, setExpanded] = useState(true);
  // Loaded on client only to avoid SSR/hydration mismatch
  const [total, setTotal]     = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setTotal(getContacts().length);
  }, [status]);

  const processFile = async (file: File) => {
    if (!file.name.match(/\.(xlsx|xls|csv)$/i)) {
      setStatus("error"); setErrMsg("Please upload an Excel (.xlsx, .xls) or CSV file."); return;
    }
    setStatus("loading");
    try {
      const buf = await file.arrayBuffer();
      const r   = parseAndMergeHeadcount(buf);
      setResult(r);
      setStatus("success");
      onUpdated();
    } catch (e) {
      setStatus("error");
      setErrMsg("Failed to parse. " + (e instanceof Error ? e.message : ""));
    }
  };

  const handleClear = () => {
    if (!confirm("Remove all saved employee contacts?")) return;
    clearContacts();
    setTotal(0);
    setStatus("idle"); setResult(null);
    onUpdated();
  };

  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
      {/* Header — clickable to expand */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-violet-100 flex items-center justify-center shrink-0">
            <Users size={18} className="text-violet-600" />
          </div>
          <div className="text-left">
            <p className="text-sm font-semibold text-slate-800">
              Global Headcount / Employee Directory
            </p>
            <p className="text-xs text-slate-500 mt-0.5">
              Upload employee IDs and email addresses — used to auto-fill notification emails.
              {total > 0 && <span className="ml-1 text-violet-600 font-medium">{total} contacts loaded.</span>}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {total > 0 && (
            <span className="text-xs bg-violet-100 text-violet-700 font-semibold px-2 py-0.5 rounded-full">
              {total} contacts
            </span>
          )}
          {expanded ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-slate-200 px-5 py-4 space-y-4 bg-slate-50/50">
          {/* Drop zone */}
          <div
            onClick={() => inputRef.current?.click()}
            className="border-2 border-dashed border-violet-300 hover:border-violet-400 hover:bg-violet-50/50 rounded-xl p-6 text-center cursor-pointer transition-colors"
          >
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) processFile(f); e.target.value = ""; }}
            />
            <FileSpreadsheet size={28} className="mx-auto mb-2 text-violet-400" />
            <p className="text-sm font-medium text-slate-700">Click to upload Headcount Excel</p>
            <p className="text-xs text-slate-400 mt-1">Expected columns (any order, case-insensitive):</p>
            <p className="text-xs text-violet-600 mt-0.5 font-mono">
              Employee ID &bull; Name &bull; Email
            </p>
          </div>

          {/* Status */}
          {status === "loading" && (
            <div className="flex items-center gap-2 text-sm text-slate-600 bg-white rounded-lg px-4 py-2 border border-slate-200">
              <Upload size={14} className="animate-bounce text-violet-500" /> Parsing contacts…
            </div>
          )}
          {status === "error" && (
            <div className="flex items-center justify-between text-sm text-red-700 bg-red-50 rounded-lg px-4 py-2 border border-red-200">
              <span className="flex items-center gap-2"><AlertCircle size={14} />{errMsg}</span>
              <button onClick={() => setStatus("idle")}><X size={13} /></button>
            </div>
          )}
          {status === "success" && result && (
            <div className="bg-violet-50 border border-violet-200 rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3">
                <span className="flex items-center gap-2 text-sm font-medium text-violet-800">
                  <CheckCircle size={15} /> Contacts synced successfully
                </span>
                <button onClick={() => setStatus("idle")} className="text-violet-300 hover:text-violet-600"><X size={13} /></button>
              </div>
              <div className="grid grid-cols-3 gap-px bg-violet-200 border-t border-violet-200 text-xs">
                {[
                  { label: "Added",   value: result.added },
                  { label: "Updated", value: result.updated },
                  { label: "Total",   value: result.total },
                ].map(({ label, value }) => (
                  <div key={label} className="bg-violet-50 py-2 text-center text-violet-800">
                    <p className="font-bold text-base">{value}</p>
                    <p className="opacity-70">{label}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Clear */}
          {total > 0 && (
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>{total} employee contacts currently saved in this browser.</span>
              <button
                onClick={handleClear}
                className={cn(
                  "flex items-center gap-1 px-2 py-1 rounded-lg border transition-colors",
                  "border-red-200 text-red-500 hover:bg-red-50"
                )}
              >
                <Trash2 size={11} /> Clear contacts
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
