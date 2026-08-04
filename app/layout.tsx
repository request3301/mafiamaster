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
    description: "Пульт ведущего спортивной мафии: раздача ролей, речи по кругу, голосование, проверки, ночь и откат действий.",
    openGraph: {
      title: "Mafia Master — пульт ведущего",
      description: "Раздайте роли в приложении или своей колодой, затем проведите партию по автоматическому сценарию.",
      type: "website",
      images: [{ url: `${origin}/og.png`, width: 1672, height: 941, alt: "Mafia Master — пульт ведущего" }],
    },
    twitter: {
      card: "summary_large_image",
      title: "Mafia Master — пульт ведущего",
      description: "Раздайте роли в приложении или своей колодой, затем проведите партию по автоматическому сценарию.",
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
