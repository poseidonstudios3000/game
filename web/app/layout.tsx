import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";
import { Header } from "@/components/Header";
import { APP_CHANNEL, APP_VERSION_LABEL } from "@/lib/version";

export const metadata: Metadata = {
  title: "HoodPump",
  description:
    "Bonding-curve memecoin launchpad on Robinhood Chain. Launch a coin, ride the curve, graduate to the DEX.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        <Providers>
          <Header />
          <main className="mx-auto w-full max-w-6xl px-4 pb-24 pt-8">
            {children}
          </main>
          <footer className="border-t border-edge px-4 py-6 text-center text-xs text-mute">
            HoodPump {APP_VERSION_LABEL} · {APP_CHANNEL} — bonding-curve
            launchpad. Not financial advice. Everything can go to zero.
          </footer>
        </Providers>
      </body>
    </html>
  );
}
