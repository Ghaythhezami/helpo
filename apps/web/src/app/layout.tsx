import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { Baloo_Bhaijaan_2, Fredoka, Nunito, Tajawal } from "next/font/google";
import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale, isRtl } from "@helpo/shared";
import "./globals.css";
import "@/styles/teacher.css";
import "@/styles/student.css";
import "@/styles/extras.css";
import "@/styles/app.css";
import { Providers } from "./providers";

const nunito = Nunito({ subsets: ["latin"], weight: ["600", "700", "800", "900"], variable: "--font-nunito", display: "swap" });
const fredoka = Fredoka({ subsets: ["latin"], weight: ["600"], variable: "--font-fredoka", display: "swap" });
const tajawal = Tajawal({ subsets: ["arabic"], weight: ["500", "700", "800", "900"], variable: "--font-tajawal", display: "swap" });
const baloo = Baloo_Bhaijaan_2({ subsets: ["arabic"], weight: ["600", "700"], variable: "--font-baloo", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Nibras: lesson kits made friendly", template: "%s · Nibras" },
  description:
    "Nibras turns one lesson into a checked kit of slides, worksheet, quiz, mini-game and cards, then gives students in grades 2 to 12 a calm, age-adapted way to learn.",
  applicationName: "Nibras",
};

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
