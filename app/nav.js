"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

export default function Nav() {
  const path = usePathname();
  const [me, setMe] = useState(null);
  useEffect(() => {
    if (path === "/login") return;
    fetch("/api/me").then((r) => r.json()).then(setMe).catch(() => {});
  }, [path]);
  if (path === "/login") return null;

  async function logout() {
    await fetch("/api/login", { method: "DELETE" });
    window.location.href = "/login";
  }
  const link = (href, label) => (
    <Link href={href} className={path === href || (href !== "/" && path.startsWith(href + "/")) ? "active" : ""}>{label}</Link>
  );
  const admin = me?.role === "admin";
  return (
    <header className="top">
      <strong>Westfleur Centre</strong>
      <nav>
        {admin && link("/tenants", "Tenants")}
        {admin && link("/invoices", "Invoices")}
        {link("/", "Meters")}
        {admin && link("/report", "Report")}
        {admin && link("/settings", "Settings")}
        <button className="linkbtn" onClick={logout} title={me?.user ? `Signed in as ${me.user}` : ""}>Sign out</button>
      </nav>
    </header>
  );
}
