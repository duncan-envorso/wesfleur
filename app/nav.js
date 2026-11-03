"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export default function Nav() {
  const path = usePathname();
  if (path === "/login") return null;

  async function logout() {
    await fetch("/api/login", { method: "DELETE" });
    window.location.href = "/login";
  }

  const link = (href, label) => (
    <Link href={href} className={path === href ? "active" : ""}>{label}</Link>
  );

  return (
    <header className="top">
      <strong>Westfleur Centre</strong>
      <nav>
        {link("/tenants", "Tenants")}
        {link("/", "Meters")}
        {link("/report", "Report")}
        {link("/settings", "Settings")}
        <button className="linkbtn" onClick={logout}>Sign out</button>
      </nav>
    </header>
  );
}
