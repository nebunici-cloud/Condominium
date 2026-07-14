import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentCapabilities } from "@/lib/capabilities";
import { ASSOCIATION_SCOPED_CAPABILITY_GROUPS } from "@/lib/permission-groups";
import { Breadcrumbs } from "@/components/breadcrumbs";

import { CapabilityChecklist } from "./capability-checklist";

const ROLE_CODES = [
  "administrator",
  "board_president",
  "accountant",
  "council_member",
  "owner",
  "occupant_tenant",
] as const;

export default async function RolePermissionsPage({
  params,
}: {
  params: Promise<{ id: string; roleCode: string }>;
}) {
  const { id, roleCode } = await params;
  if (!ROLE_CODES.includes(roleCode as (typeof ROLE_CODES)[number])) {
    notFound();
  }

  const t = await getTranslations("permissions");
  const tRoles = await getTranslations("roles");
  const tAssociations = await getTranslations("associations");
  const supabase = await createClient();

  const { data: association } = await supabase
    .from("associations")
    .select("id, tenant_id, name")
    .eq("id", id)
    .maybeSingle();

  if (!association) {
    notFound();
  }

  const context = await getCurrentCapabilities(supabase, association.id);
  if (!(context?.capabilities ?? []).includes("core.role.manage")) {
    notFound();
  }

  const { data: role } = await supabase
    .from("roles")
    .select("id, code, name")
    .eq("tenant_id", association.tenant_id)
    .eq("code", roleCode)
    .maybeSingle();

  if (!role) {
    notFound();
  }

  const { data: grantedRows } = await supabase
    .from("role_capabilities")
    .select("capability_code")
    .eq("role_id", role.id)
    .eq("association_id", association.id);
  const grantedCodes = new Set((grantedRows ?? []).map((row) => row.capability_code));

  const groups = ASSOCIATION_SCOPED_CAPABILITY_GROUPS.map((g) => ({
    group: g.group,
    items: g.codes.map((code) => ({ code, checked: grantedCodes.has(code) })),
  }));

  const roleLabel = tRoles.has(role.code) ? tRoles(role.code) : role.name;

  return (
    <main className="mx-auto max-w-2xl p-4 sm:p-8">
      <Breadcrumbs
        items={[
          { label: tAssociations("title"), href: "/associations" },
          { label: association.name, href: `/associations/${association.id}` },
          { label: t("pageTitle"), href: `/associations/${association.id}/permissions` },
          { label: roleLabel },
        ]}
      />

      <div className="mb-6">
        <h1 className="text-2xl font-semibold">{t("roleTitle", { role: roleLabel })}</h1>
        <p className="text-sm text-muted-foreground">
          {t("roleSubtitle", { association: association.name })}
        </p>
      </div>

      <CapabilityChecklist
        roleId={role.id}
        tenantId={association.tenant_id}
        associationId={association.id}
        groups={groups}
      />
    </main>
  );
}
