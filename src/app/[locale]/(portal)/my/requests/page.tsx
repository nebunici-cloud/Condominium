import { getTranslations } from "next-intl/server";

import { createClient } from "@/lib/supabase/server";
import { getSignedUrlMap } from "@/lib/storage";
import { formatDate } from "@/lib/period";
import {
  maintenanceCategoryLabelKeys,
  maintenanceStatusBadgeClasses,
  maintenanceStatusLabelKeys,
} from "@/lib/maintenance-status";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

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
  category: string | null;
  due_date: string | null;
  photo_paths: string[];
  resolution_photo_paths: string[];
};

// The resident's maintenance area: requests they filed (any) plus the
// open common-area requests in their building(s) they can rally behind
// ("affects me too") instead of filing duplicates.
export default async function MyRequestsPage() {
  const t = await getTranslations("maintenance");
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
        "id, tenant_id, unit_id, building_id, visibility, title, description, status, resolution_note, created_at, category, due_date, photo_paths, resolution_photo_paths"
      )
      .eq("created_by", userId)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("maintenance_requests")
      .select(
        "id, tenant_id, unit_id, building_id, visibility, title, description, status, resolution_note, created_at, category, due_date, photo_paths, resolution_photo_paths"
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
  const buildingOptions = Array.from(
    new Map(
      (units ?? [])
        .filter((u) => u.buildings)
        .map((u) => [u.buildings!.id, { id: u.buildings!.id, label: u.buildings!.name }])
    ).values()
  );
  const tenantId = (units ?? [])[0]?.tenant_id;

  const mineRows = (mine ?? []) as RequestRow[];
  const commonRows = (common ?? []) as RequestRow[];
  const allRows = [...mineRows, ...commonRows];

  // Follower counts + which of these I already follow.
  const requestIds = allRows.map((r) => r.id);
  const { data: followerRows } = requestIds.length
    ? await supabase
        .from("maintenance_request_followers")
        .select("request_id, user_id")
        .in("request_id", requestIds)
    : { data: [] };
  const followerCount = new Map<string, number>();
  const iFollow = new Set<string>();
  for (const row of followerRows ?? []) {
    followerCount.set(row.request_id, (followerCount.get(row.request_id) ?? 0) + 1);
    if (row.user_id === userId) iFollow.add(row.request_id);
  }

  const photoUrls = await getSignedUrlMap(
    supabase,
    "maintenance-photos",
    allRows.flatMap((r) => [...r.photo_paths, ...r.resolution_photo_paths])
  );

  const renderCard = (request: RequestRow, showFollow: boolean) => {
    const isCommon = request.visibility === "public";
    const affected = followerCount.get(request.id) ?? 0;
    return (
      <Card key={request.id}>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="text-base">{request.title}</CardTitle>
              <CardDescription>
                {[
                  isCommon ? t("scopeCommon") : t("scopeApartment"),
                  t(maintenanceCategoryLabelKeys[request.category ?? "other"]),
                  formatDate(request.created_at.slice(0, 10)),
                ]
                  .filter(Boolean)
                  .join(" · ")}
                {request.due_date &&
                  request.status !== "resolved" &&
                  request.status !== "rejected" && (
                    <span className="mt-0.5 block font-medium text-foreground">
                      {t("expectedBy", { date: formatDate(request.due_date) })}
                    </span>
                  )}
              </CardDescription>
            </div>
            <Badge className={maintenanceStatusBadgeClasses[request.status] ?? ""}>
              {t(maintenanceStatusLabelKeys[request.status] ?? "statusOpen")}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
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
                    <img src={url} alt="" className="size-20 rounded-md border object-cover" />
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
                      <img src={url} alt="" className="size-20 rounded-md border object-cover" />
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
          {isCommon && (
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
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
        {tenantId && (unitOptions.length > 0 || buildingOptions.length > 0) && (
          <NewRequestDialog tenantId={tenantId} units={unitOptions} buildings={buildingOptions} />
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
