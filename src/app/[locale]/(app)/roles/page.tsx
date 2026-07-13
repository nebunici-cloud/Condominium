import { getTranslations } from "next-intl/server";

import { createClient } from "@/lib/supabase/server";
import { getUserCapabilities } from "@/lib/capabilities";
import { embedOne } from "@/lib/embed";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
import { revokeInvite } from "./actions";

export default async function RolesPage() {
  const t = await getTranslations("roles");
  const tCommon = await getTranslations("common");
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

  const { data: roles } = await supabase
    .from("roles")
    .select("id, code, name, role_capabilities(capabilities(code, description))")
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
          .select("user_id, roles(code, name)")
          .eq("tenant_id", tenantId)
          .in("user_id", memberIds)
      : Promise.resolve({ data: [] }),
  ]);

  const memberRoleLabels = new Map<string, string[]>();
  for (const row of memberRoleRows ?? []) {
    const role = embedOne(row.roles);
    if (!role) continue;
    const labels = memberRoleLabels.get(row.user_id) ?? [];
    labels.push(roleLabel(role));
    memberRoleLabels.set(row.user_id, labels);
  }

  const members = (memberProfiles ?? []).map((profile) => ({
    id: profile.id,
    label: profile.full_name || profile.email || profile.id,
    roleLabels: memberRoleLabels.get(profile.id) ?? [],
  }));

  const { data: pendingInviteRows } = canInvite
    ? await supabase
        .from("tenant_invites")
        .select("id, email, roles(code, name)")
        .eq("tenant_id", tenantId)
        .is("accepted_at", null)
        .order("created_at", { ascending: false })
    : { data: [] };

  const pendingInvites = (pendingInviteRows ?? []).map((row) => {
    const role = embedOne(row.roles);
    return { id: row.id, email: row.email, roleLabel: role ? roleLabel(role) : "—" };
  });

  return (
    <main className="mx-auto max-w-4xl p-4 sm:p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>

      {!roles || roles.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("noCapabilities")}</p>
      ) : (
        <div className="grid gap-4">
          {roles.map((role) => {
            const roleCapabilities = role.role_capabilities
              .map((rc) => embedOne(rc.capabilities))
              .filter((c): c is { code: string; description: string } => Boolean(c));

            return (
              <Card key={role.id}>
                <CardHeader>
                  <CardTitle>{roleLabel(role)}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="mb-2 text-xs font-medium text-muted-foreground">
                    {t("capabilities")} ({roleCapabilities.length})
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {roleCapabilities.map((capability) => (
                      <Badge key={capability.code} variant="outline" title={capability.description}>
                        {capability.code}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <section className="mt-10">
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
    </main>
  );
}
