import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Telecom Outage Heat Map",
  description: "Professional NOC Dashboard",
};

export default function RootLayout({
                                     children,
                                   }: Readonly<{
  children: React.ReactNode;
}>) {
  // Note: user and handleSignOut should be integrated with your
  // Firebase Auth provider/context in a client component.
  const userEmail = "engineer@telecom.com";

  return (
      <html lang="en" className="h-full antialiased">
      <body className="h-full flex flex-col bg-bg-primary text-[var(--text-primary)]">
      {/* Top Navigation Bar */}
      <header className="h-12 flex-shrink-0 flex items-center justify-between px-4 border-b border-border-subtle bg-bg-surface">
        <div className="flex items-center gap-4">
          <h1 className="text-sm font-semibold uppercase tracking-wider">
            Telecom Outage Heat Map
          </h1>

          {/* Live Status Indicator */}
          <div className="flex items-center gap-2 px-2 py-1 rounded bg-[var(--bg-elevated)] border border-border-subtle">
            <div className="w-2 h-2 rounded-full bg-[var(--alarm-ok)] animate-pulse" />
            <span className="text-[10px] font-mono font-medium text-[var(--alarm-ok)] uppercase">
                System Live
              </span>
          </div>
        </div>

        <div className="flex items-center gap-4">
            <span className="text-xs font-mono text-[var(--text-secondary)]">
              {userEmail}
            </span>
          <button
              className="text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
              // onClick={handleSignOut}
          >
            Sign Out
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 relative overflow-hidden">
        {children}
      </main>
      </body>
      </html>
  );
}