import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { Baloo_Bhaijaan_2, Fredoka, Nunito, Tajawal } from "next/font/google";
import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale, isRtl } from "@helpo/shared";
import "./globals.css";
import "@/styles/teacher.css";
import "@/styles/student.css";
import "@/styles/extras.css";
import "@/styles/app.css";
import "@/styles/v7.css";
import "@/styles/v8.css";
import "@/styles/v8-games.css";
import "@/styles/v8-cards.css";
import { layoutMetadata } from "@/lib/meta";
import { Providers } from "./providers";

const nunito = Nunito({ subsets: ["latin"], weight: ["600", "700", "800", "900"], variable: "--font-nunito", display: "swap" });
const fredoka = Fredoka({ subsets: ["latin"], weight: ["600"], variable: "--font-fredoka", display: "swap" });
const tajawal = Tajawal({ subsets: ["arabic"], weight: ["500", "700", "800", "900"], variable: "--font-tajawal", display: "swap" });
const baloo = Baloo_Bhaijaan_2({ subsets: ["arabic"], weight: ["600", "700"], variable: "--font-baloo", display: "swap" });

export async function generateMetadata(): Promise<Metadata> {
  return layoutMetadata("meta.title.default", true);
}

export const viewport: Viewport = { themeColor: "#F4F0FE", width: "device-width", initialScale: 1 };

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const stored = (await cookies()).get(LOCALE_COOKIE)?.value;
  const locale = isLocale(stored) ? stored : DEFAULT_LOCALE;
  return (
    <html lang={locale} dir={isRtl(locale) ? "rtl" : "ltr"} className={`${nunito.variable} ${fredoka.variable} ${tajawal.variable} ${baloo.variable}`}>
      <body>
        <Providers locale={locale}>{children}</Providers>
      </body>
    </html>
  );
}
