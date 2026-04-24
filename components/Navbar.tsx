"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Upload, Search, BarChart3, RefreshCw, Laptop } from "lucide-react";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { useState } from "react";

const links = [
  { href: "/upload",   label: "Import & Manage",    icon: Upload },
  { href: "/hardware", label: "Hardware Assets",     icon: Laptop },
  { href: "/lookup",   label: "Collect Accessories", icon: Search },
  { href: "/reports",  label: "Reports",             icon: BarChart3 },
];


/** Clears every key the app writes to localStorage */
function clearAllData() {
  const keys = [
    "it_assets_requests",
    "it_assets_headcount",
    "it_assets_last_import",
    "it_assets_merge_log",
  ];
  keys.forEach((k) => localStorage.removeItem(k));
  // also clear any dynamic keys
  Object.keys(localStorage)
    .filter((k) => k.startsWith("it_assets_"))
    .forEach((k) => localStorage.removeItem(k));
}

export default function Navbar() {
  const path = usePathname();
  const router = useRouter();
  const [showConfirm, setShowConfirm] = useState(false);

  function handleFreshStart() {
    clearAllData();
    setShowConfirm(false);
    router.push("/upload");
    router.refresh();
  }

  return (
    <>
      {/* ── Navbar ─────────────────────────────────────────────────────────── */}
      <header
        className="sticky top-0 z-50 shadow-md"
        style={{ background: "#1B2A4A" }}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex items-center justify-between h-[88px]">

          {/* Logo */}
          <Link href="/" className="flex items-center gap-4 select-none">
            <div className="bg-white rounded-2xl px-5 py-2.5 flex items-center shadow-md">
              <Image
                src="/genesys-logo.png"
                alt="Genesys"
                width={200}
                height={60}
                priority
                className="object-contain h-14 w-auto"
              />
            </div>
            <div className="hidden sm:flex flex-col leading-tight">
              <span className="text-base font-bold tracking-wide" style={{ color: "#FF4A1C" }}>
                IT Assets Tracker
              </span>
              <span className="text-xs font-medium" style={{ color: "rgba(255,255,255,0.5)" }}>
                Accessories Management
              </span>
            </div>
          </Link>

          {/* Nav links */}
          <nav className="flex items-center gap-1">
            {links.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex items-center gap-2 px-5 py-2.5 rounded-xl text-base font-semibold transition-all",
                  path === href
                    ? "text-white"
                    : "text-slate-300 hover:text-white hover:bg-white/10"
                )}
                style={path === href ? { background: "#FF4A1C" } : undefined}
              >
                <Icon size={18} />
                <span className="hidden sm:inline">{label}</span>
              </Link>
            ))}

            {/* Fresh-start button */}
            <button
              onClick={() => setShowConfirm(true)}
              title="New Session — clear all data and start fresh"
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-base font-semibold
                         text-slate-300 hover:text-white hover:bg-white/10 transition-all ml-2
                         border border-white/20 hover:border-white/40"
            >
              <RefreshCw size={17} />
              <span className="hidden sm:inline">New Session</span>
            </button>
          </nav>
        </div>
      </header>

      {/* ── Confirmation modal ─────────────────────────────────────────────── */}
      {showConfirm && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
            {/* Header */}
            <div className="px-6 py-5 flex items-center gap-3" style={{ background: "#1B2A4A" }}>
              <div
                className="p-2 rounded-full"
                style={{ background: "#FF4A1C" }}
              >
                <RefreshCw size={18} className="text-white" />
              </div>
              <div>
                <h2 className="text-white font-bold text-base">Start New Session?</h2>
                <p className="text-slate-300 text-xs mt-0.5">This cannot be undone</p>
              </div>
            </div>

            {/* Body */}
            <div className="px-6 py-5 space-y-3">
              <p className="text-slate-700 text-sm">
                All locally stored data will be permanently cleared:
              </p>
              <ul className="text-sm text-slate-600 list-disc list-inside space-y-1">
                <li>Imported ServiceNow accessory requests</li>
                <li>Uploaded Global Headcount / email directory</li>
                <li>All dispatch and acknowledgment records</li>
              </ul>
              <p className="text-slate-500 text-xs pt-1">
                You will be redirected to the Import page to upload fresh data.
              </p>
            </div>

            {/* Actions */}
            <div className="px-6 pb-6 flex justify-end gap-3">
              <button
                onClick={() => setShowConfirm(false)}
                className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600
                           bg-slate-100 hover:bg-slate-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleFreshStart}
                className="px-5 py-2 rounded-lg text-sm font-bold text-white
                           transition-all hover:opacity-90 active:scale-95"
                style={{ background: "#FF4A1C" }}
              >
                Yes, Clear & Start Fresh
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
