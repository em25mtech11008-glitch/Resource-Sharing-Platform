import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "P2P GPU Platform | Node Control Center",
  description: "Real-time discovery, telemetry, and safe control of distributed GPU nodes",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-[#0d1117] text-[#c9d1d9] antialiased min-h-screen">
        {children}
      </body>
    </html>
  );
}
