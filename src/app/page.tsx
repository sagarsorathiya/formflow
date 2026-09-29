import { redirect } from "next/navigation";

// Root → redirect to dashboard (middleware handles unauthenticated)
export default function RootPage() {
  redirect("/dashboard");
}
