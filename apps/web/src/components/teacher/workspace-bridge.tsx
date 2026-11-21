"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { ResourceKind } from "@helpo/shared";

/** What the side menu needs to drive the open lesson workspace. */
export interface WorkspaceInfo {
  lessonId: string;
  title: string;
  tab: ResourceKind;
  setTab: (tab: ResourceKind) => void;
  boardOpen: boolean;
  toggleBoard: () => void;
  openShare: () => void;
  openResults: () => void;
}

interface Bridge {
  info: WorkspaceInfo | null;
  register: (info: WorkspaceInfo | null) => void;
}

const BridgeContext = createContext<Bridge>({ info: null, register: () => undefined });

export function WorkspaceBridgeProvider({ children }: { children: ReactNode }) {
  const [info, setInfo] = useState<WorkspaceInfo | null>(null);
  const register = useCallback((next: WorkspaceInfo | null) => setInfo(next), []);
  const value = useMemo(() => ({ info, register }), [info, register]);
  return <BridgeContext.Provider value={value}>{children}</BridgeContext.Provider>;
}

export const useWorkspaceInfo = () => useContext(BridgeContext).info;

/** Called by the workspace so the menu can show the current lesson and its actions. */
export function useRegisterWorkspace(info: WorkspaceInfo) {
  const { register } = useContext(BridgeContext);
  const { lessonId, title, tab, boardOpen, setTab, toggleBoard, openShare, openResults } = info;
  useEffect(() => {
    register({ lessonId, title, tab, boardOpen, setTab, toggleBoard, openShare, openResults });
  }, [register, lessonId, title, tab, boardOpen, setTab, toggleBoard, openShare, openResults]);
  useEffect(() => () => register(null), [register]);
}
