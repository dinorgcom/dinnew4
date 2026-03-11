import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ClerkProvider } from "@clerk/nextjs";
import { env } from "@/lib/env";
import "./globals.css";

export const metadata: Metadata = {
  title: "DIN.ORG Rewrite",
  description: "Greenfield rewrite scaffold for DIN.ORG",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  const content = env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ? (
    <ClerkProvider>{children}</ClerkProvider>
  ) : (
    children
  );

  return (
    <html lang="en">
      <body>{content}</body>
    </html>
  );
}
