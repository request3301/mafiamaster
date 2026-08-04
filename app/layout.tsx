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
    description: "Интерактивные прототипы стола, голосования, попила, фолов, отстрелов и проверок для ведущего спортивной мафии.",
    openGraph: {
      title: "Mafia Master — пульт ведущего",
      description: "Три подхода к управлению партией на пространственном столе.",
      type: "website",
      images: [{ url: `${origin}/og.png`, width: 1672, height: 941, alt: "Mafia Master — пульт ведущего" }],
    },
    twitter: {
      card: "summary_large_image",
      title: "Mafia Master — пульт ведущего",
      description: "Три подхода к управлению партией на пространственном столе.",
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
