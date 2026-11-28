"use client";
import { useEffect, useState } from "react";

/** True while the tab is visible: decorative loops (sparks, icon loops, rotating lines) pause in background tabs. */
export function useTabVisible(): boolean {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const on = () => setVisible(document.visibilityState !== "hidden");
    on();
    document.addEventListener("visibilitychange", on);
    return () => document.removeEventListener("visibilitychange", on);
  }, []);
  return visible;
}
