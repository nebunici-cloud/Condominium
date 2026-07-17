import { getTranslations } from "next-intl/server";

import { createClient } from "@/lib/supabase/server";
import { getSignedUrlMap } from "@/lib/storage";
import { getCurrentCapabilities, getUserCapabilities } from "@/lib/capabilities";
import { formatDate } from "@/lib/period";
import {
  maintenanceCategoryLabelKeys,
  maintenancePriorityBadgeClasses,
  maintenancePriorityLabelKeys,
  maintenancePriorityRank,
  maintenanceStatusBadgeClasses,
  maintenanceStatusLabelKeys,
} from "@/lib/maintenance-status";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

import { TriageActions } from "./triage-actions";
// Reuses the resident portal's file-a-request dialog. Staff filing on
// a resident's behalf (a phoned-in complaint) is already allowed by
// the maintenance_requests insert policy; this just gives them the UI,
// with a unit picker scoped to the associations they manage.
import { NewRequestDialog } from "@/app/[locale]/(portal)/my/requests/new-request-dialog";

// Staff triage queue across every association the viewer manages (RLS
// scopes the rows). Active requests first, terminal ones below. Laid
// out as cards, not a wide table, so the triage actions are always
// visible (a table pushed them off-screen on narrower viewports).
export default async function MaintenancePage() {
  const t = await getTranslations("maintenance");
  const supabase = await createClient();

  const context = await getCurrentCapabilities(supabase);
  const canManage = (context?.capabilities ?? []).includes("maintenance.request.manage");

  // Units the admin may file a request against: units in associations
  // where they actually hold maintenance.request.manage. The insert
  // policy re-checks this, so the filter is just to keep the picker
  // honest for admins scoped to a subset of associations.
  let fileUnits: { id: string; label: string }[] = [];
  if (canManage && context) {
    const { data: associations } = await supabase.from("associations").select("id, name");
    const manageable = new Set<string>();
    await Promise.all(
      (associations ?? []).map(async (association) => {
        const caps = await getUserCapabilities(
          supabase,
          context.tenantId,
          context.userId,
          association.id
        );
        if (caps.includes("maintenance.request.manage")) manageable.add(association.id);
      })
    );
    if (manageable.size > 0) {
      const { data: unitRows } = await supabase
        .from("units")
        .select("id, unit_number, buildings!inner(name, association_id, associations(name))")
        .order("unit_number", { ascending: true });
      fileUnits = (unitRows ?? [])
        .filter((u) => u.buildings?.association_id && manageable.has(u.buildings.association_id))
        .map((u) => ({
          id: u.id,
          label: [u.buildings?.associations?.name, u.buildings?.name, `ap. ${u.unit_number}`]
            .filter(Boolean)
            .join(" · "),
        }));
    }
  }

  const { data: requests } = await supabase
    .from("maintenance_requests")
    .select(
      "id, title, description, status, resolution_note, created_at, category, priority, due_date, photo_paths, units(unit_number, buildings(name, associations(name)))"
    )
    .order("created_at", { ascending: false })
    .limit(200);

  const photoUrls = await getSignedUrlMap(
    supabase,
    "maintenance-photos",
    (requests ?? []).flatMap((r) => r.photo_paths)
  );

  const today = new Date().toISOString().slice(0, 10);
  const active = (requests ?? [])
    .filter((r) => r.status === "open" || r.status === "in_progress")
    .sort(
      (a, b) =>
        (maintenancePriorityRank[a.priority] ?? 9) - (maintenancePriorityRank[b.priority] ?? 9) ||
        a.created_at.localeCompare(b.created_at)
    );
  const closed = (requests ?? []).filter((r) => r.status === "resolved" || r.status === "rejected");

  const renderCards = (rows: typeof active) =>
    rows.map((request) => {
      const unitLabel = [
        request.units?.buildings?.associations?.name,
        request.units?.buildings?.name,
        request.units ? `ap. ${request.units.unit_number}` : null,
      ]
        .filter(Boolean)
        .join(" · ");
      const overdue =
        request.due_date !== null &&
        request.due_date < today &&
        (request.status === "open" || request.status === "in_progress");

      return (
        <Card key={request.id}>
          <CardHeader>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium">{request.title}</p>
                <p className="text-sm text-muted-foreground">
                  {[t(maintenanceCategoryLabelKeys[request.category ?? "other"]), unitLabel]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {formatDate(request.created_at.slice(0, 10))}
                  {request.due_date && (
                    <span className={overdue ? "ml-2 font-semibold text-red-600" : "ml-2"}>
                      {t("dueColumn")}: {formatDate(request.due_date)}
                      {overdue && ` (${t("overdue")})`}
                    </span>
                  )}
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                <Badge className={maintenancePriorityBadgeClasses[request.priority] ?? ""}>
                  {t(maintenancePriorityLabelKeys[request.priority] ?? "priorityNormal")}
                </Badge>
                <Badge className={maintenanceStatusBadgeClasses[request.status] ?? ""}>
                  {t(maintenanceStatusLabelKeys[request.status] ?? "statusOpen")}
                </Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {request.description && (
              <p className="text-sm whitespace-pre-wrap text-muted-foreground">
                {request.description}
              </p>
            )}
            {request.photo_paths.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {request.photo_paths.map((path) => {
                  const url = photoUrls.get(path);
                  if (!url) return null;
                  return (
                    <a key={path} href={url} target="_blank" rel="noreferrer">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={url} alt="" className="size-16 rounded-md border object-cover" />
                    </a>
                  );
                })}
              </div>
            )}
            {request.resolution_note && (
              <p className="rounded-md bg-muted/60 p-3 text-sm whitespace-pre-wrap">
                <span className="font-medium">{t("resolutionLabel")}: </span>
                {request.resolution_note}
              </p>
            )}
            {canManage && (
              <div className="border-t pt-3">
                <TriageActions
                  requestId={request.id}
                  status={request.status}
                  priority={request.priority}
                  dueDate={request.due_date}
                />
              </div>
            )}
          </CardContent>
        </Card>
      );
    });

  return (
    <main className="mx-auto max-w-4xl p-4 sm:p-8">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        {canManage && context && fileUnits.length > 0 && (
          <NewRequestDialog tenantId={context.tenantId} units={fileUnits} />
        )}
      </div>

      {(requests ?? []).length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <div className="flex flex-col gap-8">
          <section>
            <h2 className="mb-3 text-sm font-medium text-muted-foreground">
              {t("activeSection", { count: active.length })}
            </h2>
            {active.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("noActive")}</p>
            ) : (
              <div className="flex flex-col gap-4">{renderCards(active)}</div>
            )}
          </section>

          {closed.length > 0 && (
            <section>
              <h2 className="mb-3 text-sm font-medium text-muted-foreground">
                {t("closedSection", { count: closed.length })}
              </h2>
              <div className="flex flex-col gap-4">{renderCards(closed)}</div>
            </section>
          )}
        </div>
      )}
    </main>
  );
}
