import { redirect } from "next/navigation";

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

  return (
    <div className="flex min-h-full flex-col">
      <AppNav capabilities={capabilities} />
      <div className="flex-1">{children}</div>
    </div>
  );
}
