import Link from "next/link";
import { Upload, Search, BarChart3, Laptop, ArrowRight } from "lucide-react";

const cards = [
  {
    href: "/upload",
    icon: Upload,
    iconBg: "#FF4A1C",
    title: "Import Requests",
    desc: "Upload a ServiceNow Excel export of accessory requests. Review, manage, and organize all employee requests.",
    cta: "Go to Import",
  },
  {
    href: "/hardware",
    icon: Laptop,
    iconBg: "#1B2A4A",
    title: "Hardware Assets",
    desc: "Track laptops by user, serial number, and warranty. Manage legal holds, B Stock lifecycle, and refresh requests.",
    cta: "Manage Hardware",
  },
  {
    href: "/lookup",
    icon: Search,
    iconBg: "#FF7A50",
    title: "Collect Accessories",
    desc: "Employees search by name or ID to view their approved accessories and acknowledge collection or request shipment.",
    cta: "Go to Collection",
  },
  {
    href: "/reports",
    icon: BarChart3,
    iconBg: "#8BA3B8",
    title: "Reports & Analytics",
    desc: "View fulfilment summaries, delivery breakdowns, pending items, and export full data to Excel.",
    cta: "View Reports",
  },
];

export default function Home() {
  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-20">
      {/* Hero */}
      <div className="text-center mb-16">
        <div
          className="inline-block px-4 py-1.5 rounded-full text-xs font-semibold tracking-widest uppercase mb-6"
          style={{ background: "rgba(255,74,28,0.12)", color: "#FF4A1C" }}
        >
          IT Accessories Management
        </div>
        <h1
          className="text-5xl font-extrabold mb-4 leading-tight"
          style={{ color: "#1B2A4A" }}
        >
          IT Assets Tracker
        </h1>
        <p className="text-lg max-w-xl mx-auto" style={{ color: "#4A5C7A" }}>
          Streamline the tracking, collection, and reporting of employee
          accessory requests — powered by Genesys.
        </p>
      </div>

      {/* Cards */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {cards.map(({ href, icon: Icon, iconBg, title, desc, cta }) => (
          <Link
            key={href}
            href={href}
            className="group rounded-2xl border shadow-sm hover:shadow-xl transition-all p-6 flex flex-col"
            style={{
              background: "rgba(255,255,255,0.82)",
              backdropFilter: "blur(12px)",
              borderColor: "rgba(27,42,74,0.1)",
            }}
          >
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center mb-5 text-white"
              style={{ background: iconBg }}
            >
              <Icon size={22} />
            </div>
            <h2 className="text-lg font-bold mb-2" style={{ color: "#1B2A4A" }}>
              {title}
            </h2>
            <p className="text-sm flex-1 mb-5 leading-relaxed" style={{ color: "#4A5C7A" }}>
              {desc}
            </p>
            <span
              className="flex items-center gap-1 text-sm font-semibold group-hover:gap-2.5 transition-all"
              style={{ color: "#FF4A1C" }}
            >
              {cta} <ArrowRight size={15} />
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
