const MAX_FILE = 20 * 1024 * 1024;
const FILE_TYPES = [".pdf", ".docx", ".pptx", ".txt", ".md"];
export const PROMPT_MIN = 10;
export const PROMPT_MAX = 4000;

export function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function validateFile(file: File): "type" | "size" | null {
  const ext = `.${file.name.split(".").pop()?.toLowerCase()}`;
  if (!FILE_TYPES.includes(ext)) return "type";
  if (file.size > MAX_FILE) return "size";
  return null;
}

export function titleFromFile(name: string): string {
  return name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim().slice(0, 140) || name;
}
