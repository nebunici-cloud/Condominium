import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { AppNav } from "@/components/app-nav";
import { OnboardingForm } from "@/components/onboarding-form";

export default async function AppLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/${locale}/login`);
  }

  const { data: membership } = await supabase
    .from("tenant_users")
    .select("tenant_id")
    .limit(1)
    .maybeSingle();

  if (!membership) {
    return <OnboardingForm />;
  }

  const { data: userRoleRows } = await supabase
    .from("user_roles")
    .select("role_id")
    .eq("tenant_id", membership.tenant_id)
    .eq("user_id", user.id);

  const roleIds = (userRoleRows ?? []).map((userRole) => userRole.role_id);

  const { data: capabilityRows } =
    roleIds.length > 0
      ? await supabase
          .from("role_capabilities")
          .select("capability_code")
          .in("role_id", roleIds)
      : { data: [] };

  const capabilities = Array.from(
    new Set((capabilityRows ?? []).map((row) => row.capability_code))
  );

  return (
    <div className="flex min-h-full flex-col">
      <AppNav capabilities={capabilities} />
      <div className="flex-1">{children}</div>
    </div>
  );
}
