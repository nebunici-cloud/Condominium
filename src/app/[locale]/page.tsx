import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { getUserCapabilities, isStaff } from "@/lib/capabilities";

// Module entry routing: staff land in the admin back office,
// residents land on their portal. A user who is both defaults to the
// admin side and can switch modules from the nav.
export default async function Home({
  params,
}: {
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

  // No tenant yet: the admin layout owns the onboarding flow (invite
  // acceptance happens there too), so send them through it.
  if (!membership) {
    redirect(`/${locale}/dashboard`);
  }

  const capabilities = await getUserCapabilities(supabase, membership.tenant_id, user.id);
  redirect(isStaff(capabilities) ? `/${locale}/dashboard` : `/${locale}/my`);
}
