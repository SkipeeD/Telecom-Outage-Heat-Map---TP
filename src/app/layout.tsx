import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/components/AuthProvider";
import { FilterProvider } from "@/components/FilterProvider";
import Navbar from "@/components/Navbar";
import { NameEntryDialog } from "@/components/NameEntryDialog";
import { Geist } from "next/font/google";
import { cn } from "@/lib/utils";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

export const metadata: Metadata = {
  title: "SIGNALIS | Outage Heat Map",
  description: "Professional Telecom NOC Dashboard",
};

export default function RootLayout({
                                     children,
                                   }: Readonly<{
  children: React.ReactNode;
}>) {
  return (
      <html lang="en" className={cn("h-full antialiased", "font-sans", geist.variable)}>
      <body className="h-full flex flex-col bg-bg-primary text-text-primary">
        <AuthProvider>
          <FilterProvider>
            <Navbar />
            {/* Main Content Area */}
            <main className="flex-1 relative overflow-hidden">
              {children}
            </main>
            <NameEntryDialog />
          </FilterProvider>
        </AuthProvider>
      </body>
      </html>
  );
}