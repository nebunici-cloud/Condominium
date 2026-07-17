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
  params: Promise<{ associationId: string }>;
}) {
  const { associationId } = await params;
  const t = await getTranslations("permissions");
  const tRoles = await getTranslations("roles");
  const supabase = await createClient();

  const { data: association } = await supabase
    .from("associations")
    .select("id, name")
    .eq("id", associationId)
    .maybeSingle();

  if (!association) {
    notFound();
  }

  const context = await getCurrentCapabilities(supabase, association.id);
  if (!(context?.capabilities ?? []).includes("core.role.manage")) {
    notFound();
  }

  return (
    <>
      <Breadcrumbs
        items={[
          { label: t("pageTitle"), href: "/settings/team/permissions" },
          { label: association.name },
        ]}
      />

      <div className="mb-6">
        <h1 className="text-2xl font-semibold">{association.name}</h1>
        <p className="text-sm text-muted-foreground">
          {t("pageSubtitle", { association: association.name })}
        </p>
      </div>

      <div className="grid gap-2">
        {ROLE_CODES.map((code) => (
          <Link
            key={code}
            href={`/settings/team/permissions/${association.id}/${code}`}
            className="flex items-center justify-between rounded-md border p-4 hover:bg-accent"
          >
            <span className="font-medium">{tRoles.has(code) ? tRoles(code) : code}</span>
            <ChevronRightIcon className="size-4 text-muted-foreground" />
          </Link>
        ))}
      </div>
    </>
  );
}
