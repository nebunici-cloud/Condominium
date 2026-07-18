import { getTranslations, getLocale } from "next-intl/server";

import { createClient } from "@/lib/supabase/server";
import { getSignedUrlMap } from "@/lib/storage";
import { formatDate, formatDateTime } from "@/lib/period";
import { maintenanceCategoryLabelKeys } from "@/lib/maintenance-status";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CategoryIcon } from "@/components/maintenance-category-icon";
import { MaintenanceStatusTrack } from "@/components/maintenance-status-track";
import { MaintenanceTimeline, type TimelineEvent } from "@/components/maintenance-timeline";
import { PhotoGallery } from "@/components/photo-gallery";

import { NewRequestDialog } from "./new-request-dialog";
import { FollowButton } from "./follow-button";

type RequestRow = {
  id: string;
  tenant_id: string;
  unit_id: string | null;
  building_id: string | null;
  visibility: string;
  title: string;
  description: string | null;
  status: string;
  resolution_note: string | null;
  created_at: string;
  created_by: string | null;
  category: string | null;
  due_date: string | null;
  photo_paths: string[];
  resolution_photo_paths: string[];
  units: { unit_number: string } | null;
};

// The resident's maintenance area: requests they filed (any) plus the
// open common-area requests in their building(s) they can rally behind
// ("affects me too") instead of filing duplicates.
export default async function MyRequestsPage() {
  const t = await getTranslations("maintenance");
  const locale = await getLocale();
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const userId = user?.id ?? "";

  const { data: unitIds } = await supabase.rpc("user_unit_ids");

  const [{ data: units }, { data: mine }, { data: common }] = await Promise.all([
    (unitIds ?? []).length
      ? supabase
          .from("units")
          .select("id, tenant_id, unit_number, building_id, buildings(id, name)")
          .in("id", unitIds ?? [])
      : Promise.resolve({
          data: [] as {
            id: string;
            tenant_id: string;
            unit_number: string;
            building_id: string;
            buildings: { id: string; name: string } | null;
          }[],
        }),
    supabase
      .from("maintenance_requests")
      .select(
        "id, tenant_id, unit_id, building_id, visibility, title, description, status, resolution_note, created_at, created_by, category, due_date, photo_paths, resolution_photo_paths, units(unit_number)"
      )
      .eq("created_by", userId)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("maintenance_requests")
      .select(
        "id, tenant_id, unit_id, building_id, visibility, title, description, status, resolution_note, created_at, created_by, category, due_date, photo_paths, resolution_photo_paths, units(unit_number)"
      )
      .eq("visibility", "public")
      .neq("created_by", userId)
      .in("status", ["open", "in_progress"])
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  const unitOptions = (units ?? []).map((unit) => ({
    id: unit.id,
    label: [unit.buildings?.name, `ap. ${unit.unit_number}`].filter(Boolean).join(", "),
  }));
  const tenantId = (units ?? [])[0]?.tenant_id;

  const mineRows = (mine ?? []) as RequestRow[];
  const commonRows = (common ?? []) as RequestRow[];
  const allRows = [...mineRows, ...commonRows];
  const requestIds = allRows.map((r) => r.id);

  // Follower counts + which of these I already follow, and the activity
  // log for every request. The reporter is shown by apartment number
  // (from the request's unit), not by name.
  const [{ data: followerRows }, { data: eventRows }] = await Promise.all([
    requestIds.length
      ? supabase
          .from("maintenance_request_followers")
          .select("request_id, user_id")
          .in("request_id", requestIds)
      : Promise.resolve({ data: [] as { request_id: string; user_id: string }[] }),
    requestIds.length
      ? supabase
          .from("maintenance_request_events")
          .select("request_id, event_type, to_status, created_at")
          .in("request_id", requestIds)
          .order("created_at", { ascending: true })
      : Promise.resolve({
          data: [] as {
            request_id: string;
            event_type: string;
            to_status: string | null;
            created_at: string;
          }[],
        }),
  ]);

  const followerCount = new Map<string, number>();
  const iFollow = new Set<string>();
  for (const row of followerRows ?? []) {
    followerCount.set(row.request_id, (followerCount.get(row.request_id) ?? 0) + 1);
    if (row.user_id === userId) iFollow.add(row.request_id);
  }

  const eventsByRequest = new Map<string, TimelineEvent[]>();
  for (const e of eventRows ?? []) {
    const list = eventsByRequest.get(e.request_id) ?? [];
    list.push({ eventType: e.event_type, toStatus: e.to_status, createdAt: e.created_at });
    eventsByRequest.set(e.request_id, list);
  }

  // Rally view: the most-supported common issues float to the top.
  commonRows.sort(
    (a, b) =>
      (followerCount.get(b.id) ?? 0) - (followerCount.get(a.id) ?? 0) ||
      b.created_at.localeCompare(a.created_at)
  );

  const photoUrls = await getSignedUrlMap(
    supabase,
    "maintenance-photos",
    allRows.flatMap((r) => [...r.photo_paths, ...r.resolution_photo_paths])
  );

  const toGallery = (paths: string[], alt: string) =>
    paths
      .map((path) => ({ url: photoUrls.get(path), alt }))
      .filter((p): p is { url: string; alt: string } => Boolean(p.url));

  const renderCard = (request: RequestRow, showFollow: boolean) => {
    const isCommon = request.visibility === "public";
    const affected = followerCount.get(request.id) ?? 0;
    const isClosed = request.status === "resolved" || request.status === "rejected";
    return (
      <Card key={request.id} className={isClosed ? "opacity-75" : undefined}>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <CardTitle className="text-base">{request.title}</CardTitle>
              <CardDescription>
                <span className="inline-flex items-center gap-1">
                  <CategoryIcon category={request.category} />
                  {[
                    isCommon ? t("visibilityPublic") : t("visibilityPrivate"),
                    t(maintenanceCategoryLabelKeys[request.category ?? "other"]),
                    formatDate(request.created_at.slice(0, 10)),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
                {isCommon && request.units?.unit_number && (
                  <span className="mt-0.5 block">
                    {t("reportedByUnit", {
                      unit: request.units.unit_number,
                      at: formatDateTime(request.created_at, locale),
                    })}
                  </span>
                )}
                {request.due_date && !isClosed && (
                  <span className="mt-0.5 block font-medium text-foreground">
                    {t("expectedBy", { date: formatDate(request.due_date) })}
                  </span>
                )}
              </CardDescription>
            </div>
            <MaintenanceStatusTrack status={request.status} />
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {request.description && (
            <p className="text-sm whitespace-pre-wrap text-muted-foreground">{request.description}</p>
          )}
          <PhotoGallery photos={toGallery(request.photo_paths, t("photoReportedAlt"))} />
          {request.resolution_photo_paths.length > 0 && (
            <div>
              <p className="mb-1 text-xs font-medium text-muted-foreground">{t("resolutionPhotos")}</p>
              <PhotoGallery
                photos={toGallery(request.resolution_photo_paths, t("photoResolutionAlt"))}
              />
            </div>
          )}
          {request.resolution_note && (
            <p className="rounded-md bg-muted/60 p-3 text-sm whitespace-pre-wrap">
              <span className="font-medium">{t("resolutionLabel")}: </span>
              {request.resolution_note}
            </p>
          )}
          <MaintenanceTimeline events={eventsByRequest.get(request.id) ?? []} />
          {isCommon && (
            <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
              <p className="text-xs text-muted-foreground">
                {t("affectedHouseholds", { count: affected })}
              </p>
              {showFollow && tenantId && (
                <FollowButton
                  requestId={request.id}
                  tenantId={tenantId}
                  following={iFollow.has(request.id)}
                />
              )}
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  return (
    <main className="mx-auto max-w-3xl p-4 sm:p-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">{t("myTitle")}</h1>
        {tenantId && unitOptions.length > 0 && (
          <NewRequestDialog tenantId={tenantId} units={unitOptions} />
        )}
      </div>

      <div className="flex flex-col gap-8">
        {commonRows.length > 0 && (
          <section>
            <h2 className="mb-3 text-sm font-medium text-muted-foreground">{t("commonSection")}</h2>
            <div className="flex flex-col gap-4">
              {commonRows.map((request) => renderCard(request, true))}
            </div>
          </section>
        )}

        <section>
          <h2 className="mb-3 text-sm font-medium text-muted-foreground">{t("mySection")}</h2>
          {mineRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("myEmpty")}</p>
          ) : (
            <div className="flex flex-col gap-4">
              {mineRows.map((request) => renderCard(request, false))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
