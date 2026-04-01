import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/components/AuthProvider";
import Navbar from "@/components/Navbar";

export const metadata: Metadata = {
  title: "Telecom Outage Heat Map",
  description: "Professional NOC Dashboard",
};

export default function RootLayout({
                                     children,
                                   }: Readonly<{
  children: React.ReactNode;
}>) {
  return (
      <html lang="en" className="h-full antialiased">
      <body className="h-full flex flex-col bg-bg-primary text-text-primary">
        <AuthProvider>
          <Navbar />
          {/* Main Content Area */}
          <main className="flex-1 relative overflow-hidden">
            {children}
          </main>
        </AuthProvider>
      </body>
      </html>
  );
}