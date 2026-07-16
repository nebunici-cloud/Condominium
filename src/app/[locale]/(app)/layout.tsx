import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { createClient } from "@/lib/supabase/server";
import { getUserCapabilities } from "@/lib/capabilities";
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

  let tenantId = membership?.tenant_id;

  if (!tenantId) {
    const { data: acceptedTenantId } = await supabase.rpc("accept_pending_invite");
    if (acceptedTenantId) {
      tenantId = acceptedTenantId;
    } else {
      return <OnboardingForm />;
    }
  }

  const capabilities = await getUserCapabilities(supabase, tenantId, user.id);

  const tRoles = await getTranslations("roles");
  const [{ data: profile }, { data: userRoleRows }] = await Promise.all([
    supabase.from("profiles").select("full_name, email").eq("id", user.id).maybeSingle(),
    supabase
      .from("user_roles")
      .select("roles(code, name)")
      .eq("tenant_id", tenantId)
      .eq("user_id", user.id),
  ]);

  const displayName = profile?.full_name || profile?.email || user.email || "";
  const roleLabels = Array.from(
    new Set(
      (userRoleRows ?? [])
        .map((row) => row.roles)
        .filter((role): role is { code: string; name: string } => Boolean(role))
        .map((role) => (tRoles.has(role.code) ? tRoles(role.code) : role.name))
    )
  );

  return (
    <div className="flex min-h-full flex-col">
      <AppNav capabilities={capabilities} displayName={displayName} roleLabels={roleLabels} />
      <div className="flex-1">{children}</div>
    </div>
  );
}
