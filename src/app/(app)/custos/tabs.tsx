"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/custos", label: "Lançamentos" },
  { href: "/custos/extrato", label: "Extrato" },
  { href: "/custos/demonstrativo", label: "Demonstrativo (Real)" },
];

export function CustosTabs() {
  const pathname = usePathname();

  return (
    <div className="mb-5 flex gap-1.5 border-b border-border">
      {TABS.map((tab) => {
        const active = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`px-5 py-2.5 text-[13px] ${
              active
                ? "border-b-2 border-primary-fill font-semibold text-text"
                : "text-text-muted"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
