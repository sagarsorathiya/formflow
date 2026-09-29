import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { AdminNav } from "@/components/layout/admin-nav";
import { AdminSidebar } from "@/components/layout/admin-sidebar";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  if (session.user.role !== "SUPER_ADMIN") redirect("/dashboard");

  return (
    <div className="flex h-screen overflow-hidden bg-[#f5f5f7] dark:bg-[#0b1120]">
      {/* Dark sidebar — always visible on desktop */}
      <AdminSidebar />

      {/* Right column */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <AdminNav user={session.user} />
        <main className="flex-1 overflow-y-auto px-6 py-6" role="main">
          {children}
        </main>
      </div>
    </div>
  );
}
