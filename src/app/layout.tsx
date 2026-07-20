import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Frame Atlas",
  description: "A visual reference platform for documentary form",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-neutral-950 text-neutral-100 font-sans">{children}</body>
    </html>
  );
}
