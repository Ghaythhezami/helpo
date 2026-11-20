"use client";
import Link from "next/link";
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, MouseEvent, ReactNode, Ref } from "react";

export type ButtonVariant = "primary" | "secondary" | "ghost";
export type ButtonSize = "sm" | "md" | "big";

export function buttonClass(variant: ButtonVariant = "primary", size: ButtonSize = "md", extra?: string): string {
  const parts = variant === "ghost" ? ["lnk"] : ["btn", variant === "secondary" ? "sec" : ""];
  if (variant !== "ghost" && size !== "md") parts.push(size);
  if (extra) parts.push(extra);
  return parts.filter(Boolean).join(" ");
}

interface CommonProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Keeps the button focusable but inert, with the disabled look (and a reason can be given in nearby text). */
  disabled?: boolean;
  children?: ReactNode;
}

export type ButtonProps = CommonProps & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "disabled"> & { ref?: Ref<HTMLButtonElement> };

export function Button({ variant = "primary", size = "md", disabled, className, onClick, type = "button", children, ...rest }: ButtonProps) {
  return (
    <button
      type={type}
      className={buttonClass(variant, size, className)}
      aria-disabled={disabled ? true : undefined}
      onClick={(event: MouseEvent<HTMLButtonElement>) => {
        if (disabled) {
          event.preventDefault();
          return;
        }
        onClick?.(event);
      }}
      {...rest}
    >
      {children}
    </button>
  );
}

export type ButtonLinkProps = CommonProps & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & { href: string };

export function ButtonLink({ variant = "primary", size = "md", disabled, className, href, children, onClick, ...rest }: ButtonLinkProps) {
  return (
    <Link
      href={href}
      className={buttonClass(variant, size, className)}
      aria-disabled={disabled ? true : undefined}
      onClick={(event) => {
        if (disabled) {
          event.preventDefault();
          return;
        }
        onClick?.(event);
      }}
      {...rest}
    >
      {children}
    </Link>
  );
}
