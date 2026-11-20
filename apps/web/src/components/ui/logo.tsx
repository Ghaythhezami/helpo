"use client";
import Link from "next/link";
import { useId } from "react";
import { BRAND } from "@helpo/shared";

export function LogoMark({ className }: { className?: string }) {
  const id = useId();
  return (
    <svg viewBox="0 0 48 40" aria-hidden="true" className={className}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#8E70FF" />
          <stop offset="1" stopColor="#4F24B5" />
        </linearGradient>
      </defs>
      <path d="M24 4 2 15l22 11 22-11z" fill={`url(#${id})`} />
      <path d="M11 21v9c0 4 6 8 13 8s13-4 13-8v-9l-13 6.5z" fill="#6035CF" />
      <path d="M11 21l13 6.5L37 21" fill="none" stroke="#fff" strokeOpacity=".35" strokeWidth="1.5" />
      <path d="M44 16v12" stroke="#FFC83D" strokeWidth="3" strokeLinecap="round" />
      <circle cx="44" cy="30" r="3.2" fill="#FFC83D" />
    </svg>
  );
}

export function Logo({ href, label }: { href: string; label: string }) {
  return (
    <Link className="logo" href={href} aria-label={label}>
      <LogoMark />
      <span>{BRAND.name}</span>
      <svg className="sp" viewBox="0 0 22 30" aria-hidden="true">
        <path d="M18 3 8 9M20 14l-12 1M16 26l-8-8" stroke="#FFC83D" strokeWidth="4" strokeLinecap="round" fill="none" />
      </svg>
    </Link>
  );
}
