import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { getAppSession } from "@/lib/app-session";
import { loadNotifications } from "@/lib/notifications";
import { AppNav } from "@/components/app-nav";
import { OnboardingForm } from "@/components/onboarding-form";

// Back-office shell: staff only. RLS remains the real security
// boundary -- this guard is UX routing (a resident deep-linking an
// admin URL lands on their portal instead of an empty admin page).
export default async function AdminLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const result = await getAppSession();

  if (result.status === "unauthenticated") {
    redirect(`/${locale}/login`);
  }
  if (result.status === "onboarding") {
    return <OnboardingForm />;
  }

  const { session } = result;

  if (!session.isStaff) {
    redirect(`/${locale}/my`);
  }

  const tRoles = await getTranslations("roles");
  const roleLabels = Array.from(
    new Set(
      session.roles.map((role) => (tRoles.has(role.code) ? tRoles(role.code) : role.name))
    )
  );
  const { items, unreadCount } = await loadNotifications();

  return (
    <div className="flex min-h-full flex-col">
      <AppNav
        capabilities={session.capabilities}
        displayName={session.displayName}
        roleLabels={roleLabels}
        showPortalSwitch={session.myUnitIds.length > 0}
        notifications={items}
        unreadCount={unreadCount}
      />
      <div className="flex-1">{children}</div>
    </div>
  );
}
