import type { Metadata } from "next";
import { Playfair_Display, Manrope } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const playfair = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
  style: ["normal", "italic"],
});

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "MemO — Agent Task Ledger & Vector Audit Memory",
  description:
    "Decoupled AI-agent task manager and append-only audit ledger on MongoDB Atlas, with semantic audit search over Atlas Vector Search.",
  icons: {
    icon: "https://z-cdn.chatglm.cn/z-ai/static/logo.svg",
  },
  applicationName: "MemO",
  openGraph: {
    title: "MemO — Agent Task Ledger & Vector Audit Memory",
    description:
      "Append-only agent audit ledger with semantic search over MongoDB Atlas Vector Search.",
    siteName: "MemO",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "MemO — Agent Task Ledger & Vector Audit Memory",
    description:
      "Append-only agent audit ledger with semantic search over Atlas Vector Search.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${playfair.variable} ${manrope.variable} font-sans antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
