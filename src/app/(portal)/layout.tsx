import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PortalNav } from "@/components/layout/portal-nav";

export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const pendingApprovals = await prisma.workflowTask.count({
    where: { resolvedAssigneeIds: { has: session.user.id }, status: "PENDING" },
  });

  return (
    <PortalNav user={session.user} pendingApprovals={pendingApprovals}>
      {children}
    </PortalNav>
  );
}
