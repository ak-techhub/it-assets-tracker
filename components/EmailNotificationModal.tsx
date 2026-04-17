"use client";
import { useState, useMemo, useRef, useEffect } from "react";
import { Mail, Copy, ExternalLink, X, CheckCircle2, Search, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { getContacts } from "@/lib/headcount";

export interface EmailPayload {
  to: string;
  subject: string;
  body: string;
  employeeName?: string;
}

interface Props {
  payload: EmailPayload;
  onClose: () => void;
}

export default function EmailNotificationModal({ payload, onClose }: Props) {
  const contacts    = useMemo(() => getContacts(), []);
  const autoFilled  = !!payload.to;

  const [to, setTo]           = useState(payload.to);
  const [subject, setSubject] = useState(payload.subject);
  const [body, setBody]       = useState(payload.body);
  const [copied, setCopied]   = useState(false);

  // Typeahead state
  const [inputValue, setInputValue]     = useState(payload.to || "");
  // Always open dropdown on mount so suggestions are immediately visible
  const [showDropdown, setShowDropdown] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropRef  = useRef<HTMLUListElement>(null);

  // Always focus input when modal opens; open dropdown if contacts exist
  useEffect(() => {
    if (contacts.length > 0) setShowDropdown(true);
    setTimeout(() => inputRef.current?.focus(), 100);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Filter contacts by what the user types
  const suggestions = useMemo(() => {
    const q = inputValue.toLowerCase().trim();
    if (!q || (autoFilled && inputValue === to)) {
      // Show best guesses based on employeeName at the top, rest below
      if (payload.employeeName) {
        const nameParts = payload.employeeName.toLowerCase().split(" ").filter(p => p.length > 1);
        const matched = contacts.filter((c) =>
          nameParts.some((p) => c.name.toLowerCase().includes(p))
        );
        const rest = contacts.filter((c) =>
          !nameParts.some((p) => c.name.toLowerCase().includes(p))
        );
        return [...matched, ...rest].slice(0, 12);
      }
      return contacts.slice(0, 12);
    }
    return contacts.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q) ||
        c.employeeId.toLowerCase().includes(q)
    ).slice(0, 12);
  }, [contacts, inputValue, payload.employeeName, autoFilled, to]);

  const selectContact = (email: string) => {
    setTo(email);
    setInputValue(email);
    setShowDropdown(false);
  };

  const handleInputChange = (v: string) => {
    setInputValue(v);
    // If it looks like an email address, use it directly
    if (v.includes("@")) setTo(v);
    else setTo("");
    setShowDropdown(true);
  };

  const openMailto = () => {
    const addr = to || inputValue;
    const href = `mailto:${encodeURIComponent(addr)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.open(href, "_blank");
  };

  const copyBody = async () => {
    const addr = to || inputValue;
    await navigator.clipboard.writeText(`To: ${addr}\nSubject: ${subject}\n\n${body}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const validTo = !!(to || (inputValue.includes("@") && inputValue.includes(".")));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-2 text-slate-800">
            <Mail size={18} className="text-indigo-500" />
            <span className="font-semibold">Send Email Notification</span>
            {payload.employeeName && (
              <span className="text-xs text-slate-400 ml-1">— {payload.employeeName}</span>
            )}
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
        </div>

        <div className="px-5 py-4 space-y-3 overflow-y-auto flex-1">

          {/* ── To field with typeahead ── */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-medium text-slate-500">To (Recipient Email)</label>
              {contacts.length > 0 ? (
                autoFilled && to ? (
                  <span className="flex items-center gap-1 text-[11px] text-green-600 font-medium">
                    <CheckCircle2 size={11} /> Auto-filled · {contacts.length} contacts loaded
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-[11px] text-indigo-600 font-medium">
                    <Search size={11} /> {contacts.length} contacts — click to search
                  </span>
                )
              ) : (
                <span className="text-[11px] text-amber-600 flex items-center gap-1">
                  <AlertCircle size={11} /> Upload Global Headcount on Import page first
                </span>
              )}
            </div>

            <div className="relative">
              <div className="relative flex items-center">
                <Search size={13} className="absolute left-3 text-slate-400 pointer-events-none" />
                <input
                  ref={inputRef}
                  type="text"
                  value={inputValue}
                  onChange={(e) => handleInputChange(e.target.value)}
                  onFocus={() => setShowDropdown(true)}
                  onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
                  placeholder={contacts.length > 0 ? "Type name, email or ID to search…" : "employee@company.com"}
                  className={cn(
                    "w-full pl-8 pr-3 py-2.5 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300",
                    to
                      ? "border-green-400 bg-green-50 text-green-800"
                      : "border-slate-200"
                  )}
                />
                {inputValue && (
                  <button type="button"
                    onMouseDown={() => { setInputValue(""); setTo(""); setShowDropdown(true); }}
                    className="absolute right-3 text-slate-300 hover:text-slate-500">
                    <X size={13} />
                  </button>
                )}
              </div>

              {/* Dropdown */}
              {showDropdown && contacts.length > 0 && (
                <ul ref={dropRef}
                  className="absolute z-20 mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-lg max-h-52 overflow-y-auto">
                  {suggestions.length > 0 ? (
                    suggestions.map((c) => (
                      <li key={c.employeeId + c.email}>
                        <button type="button"
                          onMouseDown={() => selectContact(c.email)}
                          className="w-full text-left px-3 py-2.5 hover:bg-indigo-50 transition-colors border-b border-slate-50 last:border-0">
                          <p className="text-sm font-medium text-slate-800">{c.name}</p>
                          <p className="text-xs text-indigo-600 mt-0.5">{c.email}
                            {c.employeeId && c.employeeId !== c.name && (
                              <span className="ml-2 text-slate-400 text-[11px]">ID: {c.employeeId}</span>
                            )}
                          </p>
                        </button>
                      </li>
                    ))
                  ) : (
                    <li className="px-3 py-3 text-xs text-slate-400 text-center">
                      No contacts match &ldquo;{inputValue}&rdquo;
                    </li>
                  )}
                </ul>
              )}
            </div>

            {/* Show resolved email below if input contains a name (not email) */}
            {to && inputValue !== to && (
              <p className="mt-1 text-xs text-green-600 flex items-center gap-1">
                <CheckCircle2 size={11} /> Sending to: <strong>{to}</strong>
              </p>
            )}
          </div>

          {/* Subject */}
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Subject</label>
            <input type="text" value={subject} onChange={(e) => setSubject(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
          </div>

          {/* Body */}
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Email Body</label>
            <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={11}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs font-mono leading-relaxed focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-none" />
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-slate-100 flex items-center justify-between gap-3 shrink-0 bg-white">
          <button onClick={copyBody}
            className={cn(
              "flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm border transition-colors",
              copied ? "border-green-300 bg-green-50 text-green-700" : "border-slate-200 text-slate-600 hover:bg-slate-50"
            )}>
            {copied ? <CheckCircle2 size={14} /> : <Copy size={14} />}
            {copied ? "Copied!" : "Copy Email"}
          </button>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="px-4 py-2 text-sm text-slate-500 hover:text-slate-700 border border-slate-200 rounded-lg">
              Close
            </button>
            <button onClick={openMailto} disabled={!validTo}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors",
                validTo ? "bg-indigo-600 hover:bg-indigo-700 text-white" : "bg-indigo-100 text-indigo-300 cursor-not-allowed"
              )}>
              <ExternalLink size={14} /> Open in Email Client
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
