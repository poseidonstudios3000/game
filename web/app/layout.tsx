import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";
import { Header } from "@/components/Header";
import { TestnetBar } from "@/components/TestnetBar";
import { explorerUrl, faucetUrl } from "@/lib/addresses";
import { APP_RELEASE } from "@/lib/version";

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
          <TestnetBar />
          <main className="mx-auto w-full max-w-6xl px-4 pb-24 pt-8">
            {children}
          </main>
          <footer className="flex flex-col items-center gap-2 border-t border-edge px-4 py-6 text-center text-xs text-mute">
            <p>
              HoodPump {APP_RELEASE} — bonding-curve launchpad. Not financial
              advice. Everything can go to zero.
            </p>
            {(explorerUrl || faucetUrl) && (
              <p className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
                {faucetUrl && (
                  <a
                    href={faucetUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-mute underline decoration-dotted underline-offset-2 hover:text-pump"
                  >
                    Testnet faucet ↗
                  </a>
                )}
                {explorerUrl && (
                  <a
                    href={explorerUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-mute underline decoration-dotted underline-offset-2 hover:text-pump"
                  >
                    Block explorer ↗
                  </a>
                )}
              </p>
            )}
          </footer>
        </Providers>
      </body>
    </html>
  );
}
