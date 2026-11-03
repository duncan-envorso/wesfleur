import "./globals.css";
import Nav from "./nav";

export const metadata = { title: "Westfleur Centre — meter readings" };
export const viewport = { width: "device-width", initialScale: 1, themeColor: "#0f3d3e" };

export default function RootLayout({ children }) {
  return (
    <html lang="en-ZA">
      <body>
        <Nav />
        <main>{children}</main>
      </body>
    </html>
  );
}
