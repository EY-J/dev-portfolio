import type { Metadata } from "next";
import type { ReactNode } from "react";

import Footer from "@/components/layout/Footer";
import Navbar from "@/components/layout/Navbar";

import "./globals.css";

export const metadata: Metadata = {
  title: "Developer Portfolio",
  description: "Developer portfolio",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <Navbar />
        {children}
        <Footer />
      </body>
    </html>
  );
}
