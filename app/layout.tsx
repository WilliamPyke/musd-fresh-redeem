import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Fresh Redeem — unofficial MUSD helper",
  description:
    "Unofficial same-transaction MUSD redemption helper for Mezo. Not affiliated with Mezo.",
  robots: { index: false, follow: false },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
