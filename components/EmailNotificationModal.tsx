"use client";
import { useState } from "react";
import { Mail, Copy, ExternalLink, X, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

export interface EmailPayload {
  to: string;
  subject: string;
  body: string;
}

interface Props {
  payload: EmailPayload;
  onClose: () => void;
}

export default function EmailNotificationModal({ payload, onClose }: Props) {
  const [to, setTo] = useState(payload.to);
  const [subject, setSubject] = useState(payload.subject);
  const [body, setBody] = useState(payload.body);
  const [copied, setCopied] = useState(false);

  const openMailto = () => {
    const href = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.open(href, "_blank");
  };

  const copyBody = async () => {
    await navigator.clipboard.writeText(`To: ${to}\nSubject: ${subject}\n\n${body}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2 text-slate-800">
            <Mail size={18} className="text-indigo-500" />
            <span className="font-semibold">Send Email Notification</span>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Fields */}
        <div className="px-5 py-4 space-y-3">
          {/* To */}
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">To (Recipient Email)</label>
            <input
              type="email"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="employee@company.com"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
            />
          </div>

          {/* Subject */}
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Subject</label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
            />
          </div>

          {/* Body */}
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Email Body</label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={12}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs font-mono leading-relaxed focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-none"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-slate-100 flex items-center justify-between gap-3">
          <button
            onClick={copyBody}
            className={cn(
              "flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm border transition-colors",
              copied
                ? "border-green-300 bg-green-50 text-green-700"
                : "border-slate-200 text-slate-600 hover:bg-slate-50"
            )}
          >
            {copied ? <CheckCircle2 size={14} /> : <Copy size={14} />}
            {copied ? "Copied!" : "Copy Email"}
          </button>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-slate-500 hover:text-slate-700 border border-slate-200 rounded-lg"
            >
              Close
            </button>
            <button
              onClick={openMailto}
              disabled={!to.trim()}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors",
                to.trim()
                  ? "bg-indigo-600 hover:bg-indigo-700 text-white"
                  : "bg-indigo-100 text-indigo-300 cursor-not-allowed"
              )}
            >
              <ExternalLink size={14} /> Open in Email Client
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
