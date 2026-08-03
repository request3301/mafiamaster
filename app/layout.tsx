import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Mafia Master — прототипы интерфейса",
  description: "Три интерактивных направления Telegram Mini App для ведущего спортивной мафии.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
