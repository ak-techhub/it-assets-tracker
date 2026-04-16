"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Package, Upload, Search, BarChart3 } from "lucide-react";
import { cn } from "@/lib/utils";

const links = [
  { href: "/upload", label: "Import & Manage", icon: Upload },
  { href: "/lookup", label: "Collect Accessories", icon: Search },
  { href: "/reports", label: "Reports", icon: BarChart3 },
];

export default function Navbar() {
  const path = usePathname();
  return (
    <header className="bg-white border-b border-slate-200 shadow-sm sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 flex items-center justify-between h-16">
        <Link href="/" className="flex items-center gap-2 font-semibold text-slate-800 text-lg">
          <span className="bg-indigo-600 text-white p-1.5 rounded-lg">
            <Package size={18} />
          </span>
          IT Assets Tracker
        </Link>
        <nav className="flex items-center gap-1">
          {links.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors",
                path === href
                  ? "bg-indigo-50 text-indigo-700"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-800"
              )}
            >
              <Icon size={16} />
              <span className="hidden sm:inline">{label}</span>
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
