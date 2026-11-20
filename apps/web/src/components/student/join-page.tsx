"use client";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import type { Band } from "@helpo/shared";
import { JoinFlow } from "./join-flow";
import { StudentFrame } from "./frame";

export function JoinPage() {
  const params = useSearchParams();
  const [band, setBand] = useState<Band>("NAVIGATOR");
  return (
    <StudentFrame band={band}>
      <JoinFlow initialCode={params.get("code") ?? undefined} school={params.get("school") ?? "riverside"} onBand={setBand} />
    </StudentFrame>
  );
}
