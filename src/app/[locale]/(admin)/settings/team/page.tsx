import { getTranslations } from "next-intl/server";

import { createClient } from "@/lib/supabase/server";
import { getUserCapabilities } from "@/lib/capabilities";
import { Link } from "@/i18n/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EndEffectiveDatedButton } from "@/components/end-effective-dated-button";

import { InviteUserDialog } from "./invite-user-dialog";
import { MemberRolesEditor } from "./member-roles-editor";
import { removeMember, revokeInvite } from "./actions";

export default async function RolesPage() {
  const t = await getTranslations("roles");
  const tCommon = await getTranslations("common");
  const tPermissions = await getTranslations("permissions");
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
  const capabilities = await getUserCapabilities(supabase, tenantId, user.id);
  const canInvite = capabilities.includes("core.user.invite");
  const canManageRoles = capabilities.includes("core.role.manage");

  const { data: roles } = await supabase
    .from("roles")
    .select("id, code, name")
    .order("created_at", { ascending: true });

  function roleLabel(role: { code: string; name: string }) {
    return t.has(role.code) ? t(role.code) : role.name;
  }

  const { data: tenantUserRows } = await supabase
    .from("tenant_users")
    .select("user_id")
    .eq("tenant_id", tenantId);
  const memberIds = (tenantUserRows ?? []).map((row) => row.user_id);

  const [{ data: memberProfiles }, { data: memberRoleRows }] = await Promise.all([
    memberIds.length
      ? supabase.from("profiles").select("id, email, full_name").in("id", memberIds)
      : Promise.resolve({ data: [] }),
    memberIds.length
      ? supabase
          .from("user_roles")
          .select("user_id, role_id, roles(code, name)")
          .eq("tenant_id", tenantId)
          .in("user_id", memberIds)
      : Promise.resolve({ data: [] }),
  ]);

  const memberRoleLabels = new Map<string, string[]>();
  const memberRoleIds = new Map<string, string[]>();
  for (const row of memberRoleRows ?? []) {
    const role = row.roles;
    if (!role) continue;
    const labels = memberRoleLabels.get(row.user_id) ?? [];
    labels.push(roleLabel(role));
    memberRoleLabels.set(row.user_id, labels);
    const ids = memberRoleIds.get(row.user_id) ?? [];
    ids.push(row.role_id);
    memberRoleIds.set(row.user_id, ids);
  }

  const members = (memberProfiles ?? []).map((profile) => ({
    id: profile.id,
    label: profile.full_name || profile.email || profile.id,
    roleLabels: memberRoleLabels.get(profile.id) ?? [],
    roleIds: memberRoleIds.get(profile.id) ?? [],
  }));

  const roleOptions = (roles ?? []).map((role) => ({ id: role.id, label: roleLabel(role) }));

  const { data: pendingInviteRows } = canInvite
    ? await supabase
        .from("tenant_invites")
        .select("id, email, roles(code, name)")
        .eq("tenant_id", tenantId)
        .is("accepted_at", null)
        .order("created_at", { ascending: false })
    : { data: [] };

  const pendingInvites = (pendingInviteRows ?? []).map((row) => {
    const role = row.roles;
    return { id: row.id, email: row.email, roleLabel: role ? roleLabel(role) : "—" };
  });

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        {capabilities.includes("core.role.manage") && (
          <Button variant="outline" asChild>
            <Link href="/settings/team/permissions">{tPermissions("pageTitle")}</Link>
          </Button>
        )}
      </div>

      <section>
        <h2 className="mb-4 text-lg font-medium">{t("teamTitle")}</h2>
        {members.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("noMembers")}</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("memberLabel")}</TableHead>
                  <TableHead>{t("memberRolesLabel")}</TableHead>
                  {canManageRoles && <TableHead />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.map((member) => (
                  <TableRow key={member.id}>
                    <TableCell className="font-medium">{member.label}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {member.roleLabels.length === 0 ? (
                          "—"
                        ) : (
                          member.roleLabels.map((label) => (
                            <Badge key={label} variant="secondary">
                              {label}
                            </Badge>
                          ))
                        )}
                      </div>
                    </TableCell>
                    {canManageRoles && (
                      <TableCell>
                        <div className="flex flex-wrap items-center justify-end gap-2">
                          <MemberRolesEditor
                            tenantId={tenantId}
                            userId={member.id}
                            roles={roleOptions}
                            assignedRoleIds={member.roleIds}
                          />
                          {member.id !== user.id && (
                            <EndEffectiveDatedButton
                              id={member.id}
                              action={removeMember}
                              triggerLabel={t("removeMember")}
                              confirmTitle={t("removeMember")}
                              confirmDescription={t("removeMemberConfirm", { name: member.label })}
                              successMessage={t("removeMemberSuccess")}
                              cancelLabel={tCommon("cancel")}
                              confirmLabel={tCommon("confirm")}
                            />
                          )}
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      {canInvite && (
        <section className="mt-10">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
            <h2 className="text-lg font-medium">{t("pendingInvitesTitle")}</h2>
            <InviteUserDialog tenantId={tenantId} roles={roles ?? []} />
          </div>
          {pendingInvites.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("noPendingInvites")}</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("inviteEmailLabel")}</TableHead>
                    <TableHead>{t("inviteRoleLabel")}</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pendingInvites.map((invite) => (
                    <TableRow key={invite.id}>
                      <TableCell className="font-medium">{invite.email}</TableCell>
                      <TableCell>{invite.roleLabel}</TableCell>
                      <TableCell>
                        <EndEffectiveDatedButton
                          id={invite.id}
                          action={revokeInvite}
                          triggerLabel={t("revoke")}
                          confirmTitle={t("revoke")}
                          confirmDescription={t("revokeConfirm")}
                          successMessage={t("revokeSuccess")}
                          cancelLabel={tCommon("cancel")}
                          confirmLabel={tCommon("confirm")}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </section>
      )}
    </>
  );
}
