import type { Metadata, Viewport } from "next";
import { currentUser } from "@/server/supabase";
import { getWalletView } from "@/server/commerce";
import { WalletSetup } from "./WalletSetup";

export const metadata: Metadata = { title: "Wallet setup" };
export const viewport: Viewport = { themeColor: "#16132b", colorScheme: "dark" };
export const dynamic = "force-dynamic";

export default async function WalletSetupPage() {
  const user = await currentUser().catch(() => null);
  const wallet = user ? await getWalletView(user.id, user.email).catch(() => null) : null;
  return <WalletSetup initialUser={user ? { email: user.email } : null} initialWallet={wallet} publishableKey={process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? ""} sandbox={!(process.env.STRIPE_API_KEY ?? "").startsWith("sk_live_")} />;
}
