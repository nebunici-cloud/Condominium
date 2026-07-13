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
    .select("roles(role_capabilities(capability_code))")
    .eq("tenant_id", membership.tenant_id)
    .eq("user_id", user.id);

  const capabilities = Array.from(
    new Set(
      (userRoleRows ?? []).flatMap((userRole) =>
        (userRole.roles?.[0]?.role_capabilities ?? []).map((rc) => rc.capability_code)
      )
    )
  );

  return (
    <div className="flex min-h-full flex-col">
      <AppNav capabilities={capabilities} />
      <div className="flex-1">{children}</div>
    </div>
  );
}
