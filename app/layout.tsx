import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const origin = `${protocol}://${host}`;

  return {
    metadataBase: new URL(origin),
    title: "Mafia Master — пульт ведущего",
    description: "Автоматический пульт ведущего спортивной мафии: речи по кругу, голосование, попил, ночь и откат действий.",
    openGraph: {
      title: "Mafia Master — пульт ведущего",
      description: "Партия идёт по сценарию автоматически — ведущий подтверждает только следующий шаг.",
      type: "website",
      images: [{ url: `${origin}/og.png`, width: 1672, height: 941, alt: "Mafia Master — пульт ведущего" }],
    },
    twitter: {
      card: "summary_large_image",
      title: "Mafia Master — пульт ведущего",
      description: "Партия идёт по сценарию автоматически — ведущий подтверждает только следующий шаг.",
      images: [`${origin}/og.png`],
    },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
