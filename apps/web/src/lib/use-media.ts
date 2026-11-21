"use client";
import { useEffect, useState } from "react";

/** Tracks a CSS media query. `initial` is used on the server and for the first client render. */
export function useMedia(query: string, initial = true): boolean {
  const [matches, setMatches] = useState(initial);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setMatches(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [query]);
  return matches;
}
