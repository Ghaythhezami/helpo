import type { Metadata } from "next";
import "./style.css";

export const metadata: Metadata = {
  title: "Students | Educator Helper",
  description: "The future student space for Educator Helper.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
