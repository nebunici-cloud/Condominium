import { getTranslations } from "next-intl/server";
import { ChevronRightIcon } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { getCurrentCapabilities, getUserCapabilities } from "@/lib/capabilities";
import { TENANT_WIDE_CAPABILITY_GROUPS } from "@/lib/permission-groups";
import { Link } from "@/i18n/navigation";
import { Breadcrumbs } from "@/components/breadcrumbs";

import { PermissionsMatrix } from "./permissions-matrix";

// Column order shared with the per-association matrix.
const ROLE_CODES = [
  "administrator",
  "board_president",
  "accountant",
  "council_member",
  "owner",
  "occupant_tenant",
] as const;

// Landing page for permissions: the organization-wide grants as a
// matrix (roles x capabilities that apply across the whole tenant),
// then one link per association for the association-scoped matrix.
export default async function PermissionsAssociationPickerPage() {
  const t = await getTranslations("permissions");
  const tRoles = await getTranslations("roles");
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: membership } = await supabase
    .from("tenant_users")
    .select("tenant_id")
    .limit(1)
    .maybeSingle();

  if (!user || !membership) {
    return null;
  }
  const tenantId = membership.tenant_id;

  const tenantCapabilities = await getUserCapabilities(supabase, tenantId, user.id);
  const canManageTenantWide = tenantCapabilities.includes("core.role.manage");

  const { data: associations } = await supabase
    .from("associations")
    .select("id, name")
    .order("created_at", { ascending: true });

  const manageable: { id: string; name: string }[] = [];
  for (const association of associations ?? []) {
    const context = await getCurrentCapabilities(supabase, association.id);
    if ((context?.capabilities ?? []).includes("core.role.manage")) {
      manageable.push(association);
    }
  }

  // Organization-wide matrix data (association_id null grants).
  let orgMatrix: {
    roles: { id: string; label: string }[];
    groups: { group: string; rows: { code: string; grantedRoleIds: string[] }[] }[];
  } | null = null;

  if (canManageTenantWide) {
    const { data: roleRows } = await supabase
      .from("roles")
      .select("id, code, name")
      .eq("tenant_id", tenantId);
    const rolesByCode = new Map((roleRows ?? []).map((role) => [role.code, role]));
    const roles = ROLE_CODES.flatMap((code) => {
      const role = rolesByCode.get(code);
      if (!role) return [];
      return [{ id: role.id, label: tRoles.has(role.code) ? tRoles(role.code) : role.name }];
    });

    const { data: grantedRows } = await supabase
      .from("role_capabilities")
      .select("role_id, capability_code")
      .is("association_id", null)
      .in("role_id", roles.map((role) => role.id));

    const grantedByCode = new Map<string, string[]>();
    for (const row of grantedRows ?? []) {
      const list = grantedByCode.get(row.capability_code) ?? [];
      list.push(row.role_id);
      grantedByCode.set(row.capability_code, list);
    }

    orgMatrix = {
      roles,
      groups: TENANT_WIDE_CAPABILITY_GROUPS.map((group) => ({
        group: group.group,
        rows: group.codes.map((code) => ({
          code,
          grantedRoleIds: grantedByCode.get(code) ?? [],
        })),
      })),
    };
  }

  return (
    <>
      <Breadcrumbs items={[{ label: t("pageTitle") }]} />

      <div className="mb-6">
        <h1 className="text-2xl font-semibold">{t("pageTitle")}</h1>
        <p className="text-sm text-muted-foreground">{t("pickerSubtitle")}</p>
      </div>

      {orgMatrix && (
        <section className="mb-10">
          <h2 className="mb-1 text-lg font-medium">{t("tenantWideTitle")}</h2>
          <p className="mb-4 text-sm text-muted-foreground">{t("tenantWideHint")}</p>
          <PermissionsMatrix
            tenantId={tenantId}
            associationId={null}
            roles={orgMatrix.roles}
            groups={orgMatrix.groups}
          />
        </section>
      )}

      <h2 className="mb-1 text-lg font-medium">{t("associationsTitle")}</h2>
      <p className="mb-4 text-sm text-muted-foreground">{t("associationsHint")}</p>
      {manageable.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("noManageableAssociations")}</p>
      ) : (
        <div className="grid gap-2">
          {manageable.map((association) => (
            <Link
              key={association.id}
              href={`/settings/team/permissions/${association.id}`}
              className="flex items-center justify-between rounded-md border p-4 hover:bg-accent"
            >
              <span className="font-medium">{association.name}</span>
              <ChevronRightIcon className="size-4 text-muted-foreground" />
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
