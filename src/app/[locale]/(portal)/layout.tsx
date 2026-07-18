import { redirect } from "next/navigation";

import { getAppSession } from "@/lib/app-session";
import { loadNotifications } from "@/lib/notifications";
import { PortalNav } from "@/components/portal-nav";
import { OnboardingForm } from "@/components/onboarding-form";

// Resident portal shell: open to every tenant member (a staff member
// who also owns a unit uses this side too, via the module switcher).
// Mobile-first and deliberately minimal -- residents get a simple app,
// not a scaled-down back office.
export default async function PortalLayout({
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
  const { items, unreadCount } = await loadNotifications();

  return (
    <div className="flex min-h-full flex-col">
      <PortalNav
        displayName={session.displayName}
        showAdminSwitch={session.isStaff}
        notifications={items}
        unreadCount={unreadCount}
      />
      <div className="flex-1">{children}</div>
    </div>
  );
}
