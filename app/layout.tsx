import type { Metadata } from "next";
import { Inter, Lora } from "next/font/google";
import "./globals.css";
import PomodoroProvider from "@/components/learn/PomodoroProvider";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const lora = Lora({
  variable: "--font-lora",
  subsets: ["latin"],
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  title: "Hugh — You can learn anything",
  description: "Hugh is your AI learning companion. Build a structured learning plan, track your progress, and prove your knowledge through voice conversations.",
  openGraph: {
    title:       "Hugh — You can learn anything",
    description: "Your AI learning companion. Build a plan, track progress, and prove mastery through voice.",
    siteName:    "Hugh",
  },
  twitter: {
    card:        "summary",
    title:       "Hugh — You can learn anything",
    description: "Your AI learning companion. Build a plan, track progress, and prove mastery through voice.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} ${lora.variable} h-full`}>
      <body className="h-full bg-[#0F172A] font-sans text-slate-100 antialiased">
        <PomodoroProvider>
          {children}
        </PomodoroProvider>
      </body>
    </html>
  );
}
