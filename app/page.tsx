import Link from "next/link";
import { Upload, Search, BarChart3, ArrowRight } from "lucide-react";

const cards = [
  {
    href: "/upload",
    icon: Upload,
    color: "bg-indigo-500",
    title: "Import Requests",
    desc: "Upload an Excel file containing accessory requests. Review, manage, and organize all employee requests.",
    cta: "Go to Import",
  },
  {
    href: "/lookup",
    icon: Search,
    color: "bg-emerald-500",
    title: "Collect Accessories",
    desc: "Employees search by name or ID to view their approved accessories and acknowledge collection or request shipment.",
    cta: "Go to Collection",
  },
  {
    href: "/reports",
    icon: BarChart3,
    color: "bg-violet-500",
    title: "Reports & Analytics",
    desc: "View fulfilment summaries, delivery breakdowns, pending items, and export full data to Excel.",
    cta: "View Reports",
  },
];

export default function Home() {
  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-16">
      <div className="text-center mb-14">
        <h1 className="text-4xl font-bold text-slate-800 mb-3">IT Assets Tracker</h1>
        <p className="text-slate-500 text-lg max-w-xl mx-auto">
          Streamline the tracking, collection, and reporting of employee accessory requests.
        </p>
      </div>
      <div className="grid sm:grid-cols-3 gap-6">
        {cards.map(({ href, icon: Icon, color, title, desc, cta }) => (
          <Link
            key={href}
            href={href}
            className="group bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow p-6 flex flex-col"
          >
            <div className={`${color} text-white w-12 h-12 rounded-xl flex items-center justify-center mb-4`}>
              <Icon size={22} />
            </div>
            <h2 className="text-lg font-semibold text-slate-800 mb-2">{title}</h2>
            <p className="text-sm text-slate-500 flex-1 mb-4">{desc}</p>
            <span className="flex items-center gap-1 text-sm font-medium text-indigo-600 group-hover:gap-2 transition-all">
              {cta} <ArrowRight size={15} />
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
