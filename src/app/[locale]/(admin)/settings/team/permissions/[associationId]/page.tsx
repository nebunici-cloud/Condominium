import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentCapabilities } from "@/lib/capabilities";
import { ASSOCIATION_SCOPED_CAPABILITY_GROUPS } from "@/lib/permission-groups";
import { Breadcrumbs } from "@/components/breadcrumbs";

import { PermissionsMatrix } from "../permissions-matrix";

// Column order: staff roles first, resident roles last.
const ROLE_CODES = [
  "administrator",
  "board_president",
  "accountant",
  "council_member",
  "owner",
  "occupant_tenant",
] as const;

// One grid for the whole association: every role's capabilities side
// by side, instead of drilling into each role separately.
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
    .select("id, tenant_id, name")
    .eq("id", associationId)
    .maybeSingle();

  if (!association) {
    notFound();
  }

  const context = await getCurrentCapabilities(supabase, association.id);
  if (!(context?.capabilities ?? []).includes("core.role.manage")) {
    notFound();
  }

  const { data: roleRows } = await supabase
    .from("roles")
    .select("id, code, name")
    .eq("tenant_id", association.tenant_id);

  const rolesByCode = new Map((roleRows ?? []).map((role) => [role.code, role]));
  const roles = ROLE_CODES.flatMap((code) => {
    const role = rolesByCode.get(code);
    if (!role) return [];
    return [{ id: role.id, label: tRoles.has(role.code) ? tRoles(role.code) : role.name }];
  });

  const { data: grantedRows } = await supabase
    .from("role_capabilities")
    .select("role_id, capability_code")
    .eq("association_id", association.id)
    .in("role_id", roles.map((role) => role.id));

  const grantedByCode = new Map<string, string[]>();
  for (const row of grantedRows ?? []) {
    const list = grantedByCode.get(row.capability_code) ?? [];
    list.push(row.role_id);
    grantedByCode.set(row.capability_code, list);
  }

  const groups = ASSOCIATION_SCOPED_CAPABILITY_GROUPS.map((group) => ({
    group: group.group,
    rows: group.codes.map((code) => ({
      code,
      grantedRoleIds: grantedByCode.get(code) ?? [],
    })),
  }));

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

      <PermissionsMatrix
        tenantId={association.tenant_id}
        associationId={association.id}
        roles={roles}
        groups={groups}
      />
    </>
  );
}
