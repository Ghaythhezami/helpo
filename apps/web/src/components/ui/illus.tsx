/* eslint-disable @next/next/no-img-element -- decorative SVG illustrations are served as static files */
import type { CSSProperties } from "react";

/** Decorative illustration from /public/illustrations. Always hidden from assistive tech. */
export function Illus({ name, size = 64, className, style }: { name: string; size?: number; className?: string; style?: CSSProperties }) {
  return <img src={`/illustrations/${name}.svg`} alt="" aria-hidden="true" width={size} height={size} className={className} style={style} />;
}
