import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "F1 Live",
  description: "Real-time Formula 1 race tracker",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
