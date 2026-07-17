import { getTranslations } from "next-intl/server";

import { createClient } from "@/lib/supabase/server";
import { getSignedUrlMap } from "@/lib/storage";
import { getCurrentCapabilities } from "@/lib/capabilities";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { TriageActions } from "./triage-actions";

// Staff triage queue across every association the viewer manages (RLS
// scopes the rows). Active requests first, terminal ones below.
export default async function MaintenancePage() {
  const t = await getTranslations("maintenance");
  const supabase = await createClient();

  const context = await getCurrentCapabilities(supabase);
  const canManage = (context?.capabilities ?? []).includes("maintenance.request.manage");

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

  const renderRows = (rows: typeof active) =>
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
        <TableRow key={request.id}>
          <TableCell>
            <p className="font-medium">{request.title}</p>
            <p className="text-xs text-muted-foreground">
              {t(maintenanceCategoryLabelKeys[request.category ?? "other"])}
            </p>
            {request.description && (
              <p className="mt-0.5 max-w-md text-xs whitespace-pre-wrap text-muted-foreground">
                {request.description}
              </p>
            )}
            {request.resolution_note && (
              <p className="mt-1 max-w-md text-xs whitespace-pre-wrap">
                <span className="font-medium">{t("resolutionLabel")}: </span>
                {request.resolution_note}
              </p>
            )}
            {request.photo_paths.length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {request.photo_paths.map((path) => {
                  const url = photoUrls.get(path);
                  if (!url) return null;
                  return (
                    <a key={path} href={url} target="_blank" rel="noreferrer">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={url} alt="" className="size-12 rounded border object-cover" />
                    </a>
                  );
                })}
              </div>
            )}
          </TableCell>
          <TableCell className="text-muted-foreground">{unitLabel}</TableCell>
          <TableCell>{formatDate(request.created_at.slice(0, 10))}</TableCell>
          <TableCell>
            {request.due_date ? (
              <span className={overdue ? "font-semibold text-red-600" : undefined}>
                {formatDate(request.due_date)}
                {overdue && ` (${t("overdue")})`}
              </span>
            ) : (
              <span className="text-muted-foreground">—</span>
            )}
          </TableCell>
          <TableCell>
            <Badge className={maintenancePriorityBadgeClasses[request.priority] ?? ""}>
              {t(maintenancePriorityLabelKeys[request.priority] ?? "priorityNormal")}
            </Badge>
          </TableCell>
          <TableCell>
            <Badge className={maintenanceStatusBadgeClasses[request.status] ?? ""}>
              {t(maintenanceStatusLabelKeys[request.status] ?? "statusOpen")}
            </Badge>
          </TableCell>
          {canManage && (
            <TableCell className="text-right">
              <TriageActions
                requestId={request.id}
                status={request.status}
                priority={request.priority}
                dueDate={request.due_date}
              />
            </TableCell>
          )}
        </TableRow>
      );
    });

  const header = (
    <TableHeader>
      <TableRow>
        <TableHead>{t("requestColumn")}</TableHead>
        <TableHead>{t("unitColumn")}</TableHead>
        <TableHead>{t("dateColumn")}</TableHead>
        <TableHead>{t("dueColumn")}</TableHead>
        <TableHead>{t("priorityColumn")}</TableHead>
        <TableHead>{t("statusColumn")}</TableHead>
        {canManage && <TableHead className="text-right" />}
      </TableRow>
    </TableHeader>
  );

  return (
    <main className="mx-auto max-w-5xl p-4 sm:p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>

      {(requests ?? []).length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <div className="flex flex-col gap-8">
          <section>
            <h2 className="mb-2 text-sm font-medium text-muted-foreground">
              {t("activeSection", { count: active.length })}
            </h2>
            {active.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("noActive")}</p>
            ) : (
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  {header}
                  <TableBody>{renderRows(active)}</TableBody>
                </Table>
              </div>
            )}
          </section>

          {closed.length > 0 && (
            <section>
              <h2 className="mb-2 text-sm font-medium text-muted-foreground">
                {t("closedSection", { count: closed.length })}
              </h2>
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  {header}
                  <TableBody>{renderRows(closed)}</TableBody>
                </Table>
              </div>
            </section>
          )}
        </div>
      )}
    </main>
  );
}
