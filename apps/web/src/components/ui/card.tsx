import type { HTMLAttributes, ReactNode } from "react";

export function Panel({ className = "", children, ...rest }: HTMLAttributes<HTMLElement> & { children: ReactNode }) {
  return (
    <section className={`panel ${className}`.trim()} {...rest}>
      {children}
    </section>
  );
}

/** Purple gradient pill header with an icon on the left (section title). */
export function PillHeader({ id, icon, children, as: Tag = "h2" }: { id?: string; icon: ReactNode; children: ReactNode; as?: "h2" | "h3" }) {
  return (
    <div className="pillh">
      <span className="ico">{icon}</span>
      <Tag id={id}>{children}</Tag>
    </div>
  );
}

export function Hero({ className = "", children }: { className?: string; children: ReactNode }) {
  return <div className={`hero ${className}`.trim()}>{children}</div>;
}
