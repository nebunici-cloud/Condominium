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

// The resident's maintenance requests: file a new one for a unit they
// own/occupy and follow the status of past ones. RLS scopes the list
// to the caller's own submissions.
export default async function MyRequestsPage() {
  const t = await getTranslations("maintenance");
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: unitIds } = await supabase.rpc("user_unit_ids");

  const [{ data: units }, { data: requests }] = await Promise.all([
    (unitIds ?? []).length
      ? supabase
          .from("units")
          .select("id, tenant_id, unit_number, buildings(name)")
          .in("id", unitIds ?? [])
      : Promise.resolve({ data: [] as { id: string; tenant_id: string; unit_number: string; buildings: { name: string } | null }[] }),
    supabase
      .from("maintenance_requests")
      .select("id, unit_id, title, description, status, resolution_note, created_at, category, due_date, photo_paths")
      .eq("created_by", user?.id ?? "")
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  const unitOptions = (units ?? []).map((unit) => ({
    id: unit.id,
    label: [unit.buildings?.name, `ap. ${unit.unit_number}`].filter(Boolean).join(", "),
  }));
  const unitLabelById = new Map(unitOptions.map((u) => [u.id, u.label]));
  const tenantId = (units ?? [])[0]?.tenant_id;

  const photoUrls = await getSignedUrlMap(
    supabase,
    "maintenance-photos",
    (requests ?? []).flatMap((r) => r.photo_paths)
  );

  return (
    <main className="mx-auto max-w-3xl p-4 sm:p-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">{t("myTitle")}</h1>
        {tenantId && unitOptions.length > 0 && (
          <NewRequestDialog tenantId={tenantId} units={unitOptions} />
        )}
      </div>

      {(requests ?? []).length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("myEmpty")}</p>
      ) : (
        <div className="flex flex-col gap-4">
          {(requests ?? []).map((request) => (
            <Card key={request.id}>
              <CardHeader>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <CardTitle className="text-base">{request.title}</CardTitle>
                    <CardDescription>
                      {[
                        unitLabelById.get(request.unit_id),
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
              {(request.description || request.resolution_note || request.photo_paths.length > 0) && (
                <CardContent className="flex flex-col gap-2">
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
                            <img
                              src={url}
                              alt=""
                              className="size-20 rounded-md border object-cover"
                            />
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
                </CardContent>
              )}
            </Card>
          ))}
        </div>
      )}
    </main>
  );
}
