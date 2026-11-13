"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

// Small stroke icons so the sidebar needs no icon library.
const ICONS = {
  todo: <><rect x="4" y="4" width="16" height="16" rx="3" /><path d="M8 12l3 3 5-6" /></>,
  tenants: <><circle cx="9" cy="8" r="3.2" /><path d="M3 19c.6-3.3 3-5 6-5s5.4 1.7 6 5" /><path d="M16 5.5a3 3 0 0 1 0 5.6M18 14.3c1.6.6 2.6 2.1 3 4.7" /></>,
  invoices: <><path d="M6 3h9l4 4v14H6z" /><path d="M15 3v4h4M9 12h7M9 16h7M9 8h3" /></>,
  meters: <><circle cx="12" cy="13" r="8" /><path d="M12 13l4-4M8 17h8" /></>,
  report: <><path d="M4 20V4M4 20h16" /><path d="M8 16v-4M12 16V8M16 16v-6" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1" /></>,
  payments: <><rect x="3" y="6" width="18" height="13" rx="2" /><path d="M3 10h18M16 15h2" /></>,
  expenses: <><path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" /><path d="M9 8h6M9 12h6M9 16h3" /></>,
  income: <><path d="M12 19V5M6 11l6-6 6 6" /><path d="M5 21h14" /></>,
  pnl: <><path d="M4 19h16" /><path d="M6 16l4-5 3 3 5-7" /></>,
  menu: <path d="M4 6h16M4 12h16M4 18h16" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  logout: <><path d="M10 4H5v16h5" /><path d="M14 8l4 4-4 4M18 12H9" /></>,
};
const Icon = ({ name }) => (
  <svg className="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {ICONS[name]}
  </svg>
);

const SECTIONS = [
  { title: "Property", admin: true, items: [
    { href: "/todos", label: "To-do", icon: "todo" },
    { href: "/tenants", label: "Tenants", icon: "tenants" },
  ] },
  { title: "Money", admin: true, items: [
    { href: "/invoices", label: "Invoices", icon: "invoices" },
    { href: "/payments", label: "Payments", icon: "payments" },
    { href: "/income", label: "Income", icon: "income" },
    { href: "/expenses", label: "Expenses", icon: "expenses" },
    { href: "/profit-loss", label: "Profit & loss", icon: "pnl" },
  ] },
  { title: "Utilities", items: [
    { href: "/", label: "Meter readings", icon: "meters" },
    { href: "/report", label: "Meter report", icon: "report", admin: true },
  ] },
  { title: "Admin", admin: true, items: [{ href: "/settings", label: "Settings", icon: "settings" }] },
];

export default function Nav() {
  const path = usePathname();
  const [me, setMe] = useState(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (path === "/login") return;
    fetch("/api/me", { cache: "no-store" }).then((r) => r.json()).then(setMe).catch(() => {});
  }, [path]);
  useEffect(() => { setOpen(false); }, [path]);
  if (path === "/login") return null;

  const admin = me?.role === "admin";
  const active = (href) => (href === "/" ? path === "/" : path === href || path.startsWith(href + "/"));
  async function logout() {
    await fetch("/api/login", { method: "DELETE" });
    window.location.href = "/login";
  }
  const current = SECTIONS.flatMap((s) => s.items).find((i) => active(i.href));

  return (
    <>
      <header className="mobilebar">
        <button className="iconbtn" onClick={() => setOpen(true)} aria-label="Open menu"><Icon name="menu" /></button>
        <span className="mobilebar-title">{current?.label || "Westfleur Centre"}</span>
      </header>
      {open && <div className="scrim" onClick={() => setOpen(false)} aria-hidden="true" />}
      <aside className={"sidebar" + (open ? " open" : "")} aria-label="Main menu">
        <div className="brand">
          <div className="brand-mark" aria-hidden="true">W</div>
          <div>
            <div className="brand-name">Westfleur Centre</div>
            <div className="brand-sub">25 Wesfleur Circle, Atlantis</div>
          </div>
          <button className="iconbtn close" onClick={() => setOpen(false)} aria-label="Close menu"><Icon name="close" /></button>
        </div>
        <nav className="side-nav">
          {SECTIONS.filter((s) => !s.admin || admin).map((s) => {
            const items = s.items.filter((i) => !i.admin || admin);
            if (!items.length) return null;
            return (
              <div key={s.title} className="side-group">
                <div className="side-title">{s.title}</div>
                {items.map((i) => (
                  <Link key={i.href} href={i.href} className={"side-link" + (active(i.href) ? " active" : "")} aria-current={active(i.href) ? "page" : undefined}>
                    <Icon name={i.icon} />{i.label}
                  </Link>
                ))}
              </div>
            );
          })}
        </nav>
        <div className="side-foot">
          {me?.user && (
            <div className="who">
              <div className="avatar" aria-hidden="true">{me.user.slice(0, 1).toUpperCase()}</div>
              <div>
                <div className="who-name">{me.user}</div>
                <div className="who-role">{me.role === "admin" ? "Admin" : "Meter reader"}</div>
              </div>
            </div>
          )}
          <button className="side-link as-button" onClick={logout}><Icon name="logout" />Sign out</button>
        </div>
      </aside>
    </>
  );
}
