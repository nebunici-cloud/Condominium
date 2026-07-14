import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ChevronRightIcon } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { getCurrentCapabilities } from "@/lib/capabilities";
import { Link } from "@/i18n/navigation";
import { Breadcrumbs } from "@/components/breadcrumbs";

const ROLE_CODES = [
  "administrator",
  "board_president",
  "accountant",
  "council_member",
  "owner",
  "occupant_tenant",
] as const;

export default async function AssociationPermissionsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const t = await getTranslations("permissions");
  const tRoles = await getTranslations("roles");
  const tAssociations = await getTranslations("associations");
  const supabase = await createClient();

  const { data: association } = await supabase
    .from("associations")
    .select("id, name")
    .eq("id", id)
    .maybeSingle();

  if (!association) {
    notFound();
  }

  const context = await getCurrentCapabilities(supabase, association.id);
  if (!(context?.capabilities ?? []).includes("core.role.manage")) {
    notFound();
  }

  return (
    <main className="mx-auto max-w-2xl p-4 sm:p-8">
      <Breadcrumbs
        items={[
          { label: tAssociations("title"), href: "/associations" },
          { label: association.name, href: `/associations/${association.id}` },
          { label: t("pageTitle") },
        ]}
      />

      <div className="mb-6">
        <h1 className="text-2xl font-semibold">{t("pageTitle")}</h1>
        <p className="text-sm text-muted-foreground">
          {t("pageSubtitle", { association: association.name })}
        </p>
      </div>

      <div className="grid gap-2">
        {ROLE_CODES.map((code) => (
          <Link
            key={code}
            href={`/associations/${association.id}/permissions/${code}`}
            className="flex items-center justify-between rounded-md border p-4 hover:bg-accent"
          >
            <span className="font-medium">{tRoles.has(code) ? tRoles(code) : code}</span>
            <ChevronRightIcon className="size-4 text-muted-foreground" />
          </Link>
        ))}
      </div>
    </main>
  );
}
