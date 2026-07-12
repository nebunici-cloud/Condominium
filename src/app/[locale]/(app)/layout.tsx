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

  return (
    <div className="flex min-h-full flex-col">
      <AppNav />
      <div className="flex-1">{children}</div>
    </div>
  );
}
