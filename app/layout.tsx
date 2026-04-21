import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import Navbar from "@/components/Navbar";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist-sans" });

export const metadata: Metadata = {
  title: "Genesys IT Assets Tracker",
  description: "Genesys — IT Accessories Management & Dispatch Dashboard",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geist.variable} h-full`}>
      <body
        className="min-h-screen flex flex-col relative"
        style={{ background: "#F5F1EB", color: "#1B2A4A" }}
      >
        {/* ── Genesys wave background ── fixed, 50% opacity ── */}
        <div
          aria-hidden
          className="fixed inset-0 -z-10 pointer-events-none"
          style={{
            backgroundImage: "url('/genesys-bg.png')",
            backgroundSize: "cover",
            backgroundPosition: "center bottom",
            backgroundRepeat: "no-repeat",
            opacity: 0.5,
          }}
        />

        <Navbar />
        <main className="flex-1">{children}</main>
        <footer
          className="text-center text-xs py-3"
          style={{ background: "#1B2A4A", color: "#00B0B9", borderTop: "1px solid #243557" }}
        >
          <span className="font-semibold tracking-widest" style={{ color: "rgba(255,255,255,0.55)" }}>
            GENESYS
          </span>
          {" · "}IT Assets Tracker © {new Date().getFullYear()}
        </footer>
      </body>
    </html>
  );
}
