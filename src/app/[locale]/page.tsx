import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

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

  // Residents land on their own home page; staff land on the ops
  // dashboard.
  const { data: myUnitIds } = await supabase.rpc("user_unit_ids");
  redirect(
    (myUnitIds ?? []).length > 0 ? `/${locale}/my` : `/${locale}/dashboard`
  );
}
