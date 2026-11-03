import "./globals.css";
import Link from "next/link";

export const metadata = { title: "Westfleur Centre — meter readings" };
export const viewport = { width: "device-width", initialScale: 1, themeColor: "#0f3d3e" };

export default function RootLayout({ children }) {
  return (
    <html lang="en-ZA">
      <body>
        <header className="top">
          <strong>Westfleur meters</strong>
          <nav>
            <Link href="/">Capture</Link>
            <Link href="/report">Report</Link>
            <Link href="/settings">Settings</Link>
          </nav>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
