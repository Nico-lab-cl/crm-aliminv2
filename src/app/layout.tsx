import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import AuthProvider from "@/components/AuthProvider";
import { Suspense } from "react";
import BottomNav from "@/components/BottomNav";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "CRM Alimin - Asesores",
  description: "Dashboard de gestión de leads para asesores de Alimin Lomas del Mar",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body className={`${inter.className} bg-slate-900`}>
        <div className="mobile-container overflow-x-hidden">
          <AuthProvider>
            <main className="flex-1 pb-20">{children}</main>
            <Suspense fallback={null}>
              <BottomNav />
            </Suspense>
          </AuthProvider>
        </div>
      </body>
    </html>
  );
}
