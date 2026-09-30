import { LoginScreen } from "./login-screen";
import { isSsoEnabled } from "@/lib/sso";

// Reads SSO config from the environment per request, so it must not be
// prerendered at build time.
export const dynamic = "force-dynamic";

export default function LoginPage() {
  return <LoginScreen ssoEnabled={isSsoEnabled()} />;
}
