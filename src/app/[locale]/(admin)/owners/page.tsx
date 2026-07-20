import { getTranslations } from "next-intl/server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentCapabilities } from "@/lib/capabilities";
import type { OwnerAccessStatus } from "@/components/owner-access";

import { NewOwnerDialog } from "./new-owner-dialog";
import { OwnersTable } from "./owners-table";

// The cross-building registry of people: who they are, which
// apartments they currently own, and whether they can use the portal.
export default async function OwnersPage() {
  const t = await getTranslations("owners");
  const supabase = await createClient();
  const context = await getCurrentCapabilities(supabase);
  const capabilities = context?.capabilities ?? [];
  const canInvite = capabilities.includes("core.user.invite");

  const [{ data: owners }, { data: ownershipRows }, { data: pendingInviteRows }] =
    await Promise.all([
      supabase
        .from("owners")
        .select("id, full_name, email, phone, personal_code, user_id, created_at")
        .order("created_at", { ascending: false }),
      supabase
        .from("ownerships")
        .select("owner_id, units(id, unit_number, buildings(name))")
        .is("effective_to", null),
      canInvite
        ? supabase.from("tenant_invites").select("email").is("accepted_at", null)
        : Promise.resolve({ data: [] as { email: string }[] }),
    ]);

  const unitsByOwner = new Map<string, { id: string; label: string }[]>();
  for (const row of ownershipRows ?? []) {
    const unit = row.units;
    if (!unit) continue;
    const list = unitsByOwner.get(row.owner_id) ?? [];
    list.push({
      id: unit.id,
      label: [unit.buildings?.name, `ap. ${unit.unit_number}`].filter(Boolean).join(", "),
    });
    unitsByOwner.set(row.owner_id, list);
  }

  const pendingEmails = new Set((pendingInviteRows ?? []).map((row) => row.email.toLowerCase()));

  const rows = (owners ?? []).map((owner) => {
    const status: OwnerAccessStatus = owner.user_id
      ? "active"
      : !owner.email?.trim()
        ? "no_email"
        : !canInvite
          ? "unknown"
          : pendingEmails.has(owner.email.trim().toLowerCase())
            ? "invited"
            : "not_invited";
    return {
      id: owner.id,
      full_name: owner.full_name,
      email: owner.email,
      phone: owner.phone,
      personal_code: owner.personal_code,
      units: unitsByOwner.get(owner.id) ?? [],
      status,
    };
  });

  return (
    <main className="mx-auto max-w-5xl p-4 sm:p-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        {capabilities.includes("core.owner.create") && <NewOwnerDialog />}
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("noOwners")}</p>
      ) : (
        <OwnersTable
          owners={rows}
          canEdit={capabilities.includes("core.owner.update")}
          canInvite={canInvite}
        />
      )}
    </main>
  );
}
