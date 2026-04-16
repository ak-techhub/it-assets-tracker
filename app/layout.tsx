import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import Navbar from "@/components/Navbar";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist-sans" });

export const metadata: Metadata = {
  title: "IT Assets Tracker",
  description: "Manage and track IT accessories requests and collections",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geist.variable} h-full`}>
      <body className="min-h-screen bg-slate-50 flex flex-col">
        <Navbar />
        <main className="flex-1">{children}</main>
        <footer className="text-center text-xs text-slate-400 py-3 border-t border-slate-200">
          IT Assets Tracker &copy; {new Date().getFullYear()}
        </footer>
      </body>
    </html>
  );
}
