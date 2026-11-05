import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SuperSoul",
  description: "One-to-one and one-to-many video calling",
  icons: {
    icon: "/supersoul.png",
    apple: "/supersoul.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Google+Sans:wght@400;500;700&family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@24,500,0,0&display=swap"
          rel="stylesheet"
        />
        <link rel="icon" href="/supersoul.png" type="image/png" />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
