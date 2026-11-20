/* eslint-disable @next/next/no-img-element -- decorative layered SVGs */
import type { CSSProperties } from "react";
import { AVATAR_BACKGROUNDS } from "@/lib/student-helpers";

const ORDER = ["backpack", "scarf", "hat", "glasses"] as const;

/** Round character with earned accessories layered on top. `only` previews a single accessory. */
export function Avatar({ items, background = "lavender", size = 48, only, plain }: { items: string[]; background?: string; size?: number; only?: string; plain?: boolean }) {
  const style = { ["--s" as string]: `${size}px`, ["--avbg" as string]: AVATAR_BACKGROUNDS[background] ?? background } as CSSProperties;
  const visible = only ? [only] : items;
  return (
    <span className={`avatar ${plain ? "plain" : ""}`} style={style} aria-hidden="true">
      <img src="/illustrations/avatar-base.svg" alt="" width={200} height={200} />
      {ORDER.filter((k) => visible.includes(k)).map((k) => (
        <img key={k} className="ov" style={{ display: "block" }} src={`/illustrations/avatar-${k}.svg`} alt="" width={200} height={200} />
      ))}
    </span>
  );
}
