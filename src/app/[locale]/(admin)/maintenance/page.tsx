import { getTranslations, getLocale } from "next-intl/server";

import { createClient } from "@/lib/supabase/server";
import { getSignedUrlMap } from "@/lib/storage";
import { getCurrentCapabilities, getUserCapabilities } from "@/lib/capabilities";
import { formatDate, formatDateTime } from "@/lib/period";
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
// a resident's behalf is already allowed by the insert policy; this
// gives them the UI, scoped to the associations they manage.
import { NewRequestDialog } from "@/app/[locale]/(portal)/my/requests/new-request-dialog";

// Maps an activity event to its timeline label key.
function eventLabelKey(eventType: string, toStatus: string | null): string {
  if (eventType === "created") return "eventCreated";
  if (eventType === "planned") return "eventPlanned";
  if (eventType === "status_changed") {
    return (
      { in_progress: "eventStarted", resolved: "eventResolved", rejected: "eventRejected", open: "eventReopened" }[
        toStatus ?? ""
      ] ?? "eventUpdated"
    );
  }
  return "eventUpdated";
}

export default async function MaintenancePage() {
  const t = await getTranslations("maintenance");
  const locale = await getLocale();
  const supabase = await createClient();

  const context = await getCurrentCapabilities(supabase);
  const canManage = (context?.capabilities ?? []).includes("maintenance.request.manage");

  // Units + buildings the admin may file against (associations they
  // manage). RLS re-checks on insert; this keeps the picker honest.
  let fileUnits: { id: string; label: string }[] = [];
  let fileBuildings: { id: string; label: string }[] = [];
  if (canManage && context) {
    const { data: associations } = await supabase.from("associations").select("id, name");
    const manageable = new Set<string>();
    await Promise.all(
      (associations ?? []).map(async (association) => {
        const caps = await getUserCapabilities(supabase, context.tenantId, context.userId, association.id);
        if (caps.includes("maintenance.request.manage")) manageable.add(association.id);
      })
    );
    if (manageable.size > 0) {
      const [{ data: unitRows }, { data: buildingRows }] = await Promise.all([
        supabase
          .from("units")
          .select("id, unit_number, buildings!inner(name, association_id, associations(name))")
          .order("unit_number", { ascending: true }),
        supabase
          .from("buildings")
          .select("id, name, association_id, associations(name)")
          .order("name", { ascending: true }),
      ]);
      fileUnits = (unitRows ?? [])
        .filter((u) => u.buildings?.association_id && manageable.has(u.buildings.association_id))
        .map((u) => ({
          id: u.id,
          label: [u.buildings?.associations?.name, u.buildings?.name, `ap. ${u.unit_number}`]
            .filter(Boolean)
            .join(" · "),
        }));
      fileBuildings = (buildingRows ?? [])
        .filter((b) => manageable.has(b.association_id))
        .map((b) => ({
          id: b.id,
          label: [b.associations?.name, b.name].filter(Boolean).join(" · "),
        }));
    }
  }

  const { data: requests } = await supabase
    .from("maintenance_requests")
    .select(
      "id, title, description, status, resolution_note, created_at, created_by, category, priority, due_date, photo_paths, resolution_photo_paths, visibility, unit_id, building_id, units(unit_number, buildings(name, associations(name))), buildings(name, associations(name))"
    )
    .order("created_at", { ascending: false })
    .limit(200);

  const requestIds = (requests ?? []).map((r) => r.id);

  const [{ data: events }, { data: followers }] = await Promise.all([
    requestIds.length
      ? supabase
          .from("maintenance_request_events")
          .select("request_id, actor_user_id, event_type, to_status, created_at")
          .in("request_id", requestIds)
          .order("created_at", { ascending: true })
      : Promise.resolve({ data: [] as { request_id: string; actor_user_id: string | null; event_type: string; to_status: string | null; created_at: string }[] }),
    requestIds.length
      ? supabase.from("maintenance_request_followers").select("request_id").in("request_id", requestIds)
      : Promise.resolve({ data: [] as { request_id: string }[] }),
  ]);

  const followerCount = new Map<string, number>();
  for (const f of followers ?? []) {
    followerCount.set(f.request_id, (followerCount.get(f.request_id) ?? 0) + 1);
  }

  const eventsByRequest = new Map<string, typeof events>();
  for (const e of events ?? []) {
    const list = eventsByRequest.get(e.request_id) ?? [];
    list.push(e);
    eventsByRequest.set(e.request_id, list);
  }

  // Names for reporters and event actors.
  const userIds = Array.from(
    new Set([
      ...(requests ?? []).map((r) => r.created_by),
      ...(events ?? []).map((e) => e.actor_user_id),
    ].filter((id): id is string => Boolean(id)))
  );
  const { data: profiles } = userIds.length
    ? await supabase.from("profiles").select("id, full_name, email").in("id", userIds)
    : { data: [] };
  const nameById = new Map((profiles ?? []).map((p) => [p.id, p.full_name || p.email || ""]));

  const photoUrls = await getSignedUrlMap(
    supabase,
    "maintenance-photos",
    (requests ?? []).flatMap((r) => [...r.photo_paths, ...r.resolution_photo_paths])
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
      const isCommon = request.visibility === "public";
      const building = isCommon ? request.buildings : request.units?.buildings;
      const locationLabel = [
        building?.associations?.name,
        building?.name,
        isCommon ? t("scopeCommon") : request.units ? `ap. ${request.units.unit_number}` : null,
      ]
        .filter(Boolean)
        .join(" · ");
      const overdue =
        request.due_date !== null &&
        request.due_date < today &&
        (request.status === "open" || request.status === "in_progress");
      const timeline = eventsByRequest.get(request.id) ?? [];
      const affected = followerCount.get(request.id) ?? 0;

      return (
        <Card key={request.id}>
          <CardHeader>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium">{request.title}</p>
                  <Badge variant={isCommon ? "default" : "secondary"}>
                    {isCommon ? t("scopeCommon") : t("scopeApartment")}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  {[t(maintenanceCategoryLabelKeys[request.category ?? "other"]), locationLabel]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {t("reportedBy", {
                    name: nameById.get(request.created_by ?? "") || t("unknownUser"),
                    at: formatDateTime(request.created_at, locale),
                  })}
                  {request.due_date && (
                    <span className={overdue ? "ml-2 font-semibold text-red-600" : "ml-2"}>
                      {t("dueColumn")}: {formatDate(request.due_date)}
                      {overdue && ` (${t("overdue")})`}
                    </span>
                  )}
                  {isCommon && affected > 0 && (
                    <span className="ml-2">· {t("affectedHouseholds", { count: affected })}</span>
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
              <p className="text-sm whitespace-pre-wrap text-muted-foreground">{request.description}</p>
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
            {request.resolution_photo_paths.length > 0 && (
              <div>
                <p className="mb-1 text-xs font-medium text-muted-foreground">{t("resolutionPhotos")}</p>
                <div className="flex flex-wrap gap-2">
                  {request.resolution_photo_paths.map((path) => {
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
              </div>
            )}
            {request.resolution_note && (
              <p className="rounded-md bg-muted/60 p-3 text-sm whitespace-pre-wrap">
                <span className="font-medium">{t("resolutionLabel")}: </span>
                {request.resolution_note}
              </p>
            )}

            {timeline.length > 0 && (
              <ol className="flex flex-col gap-1 border-l pl-4 text-xs text-muted-foreground">
                {timeline.map((event, i) => (
                  <li key={i} className="relative">
                    <span className="absolute -left-[1.05rem] top-1 size-1.5 rounded-full bg-muted-foreground/50" />
                    <span className="font-medium text-foreground">
                      {t(eventLabelKey(event.event_type, event.to_status))}
                    </span>{" "}
                    {event.actor_user_id && nameById.get(event.actor_user_id) && (
                      <>— {nameById.get(event.actor_user_id)} </>
                    )}
                    · {formatDateTime(event.created_at, locale)}
                  </li>
                ))}
              </ol>
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
        {canManage && context && (fileUnits.length > 0 || fileBuildings.length > 0) && (
          <NewRequestDialog tenantId={context.tenantId} units={fileUnits} buildings={fileBuildings} />
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
