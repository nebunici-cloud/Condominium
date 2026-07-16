import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentCapabilities } from "@/lib/capabilities";
import { formatDate } from "@/lib/period";
import { Breadcrumbs } from "@/components/breadcrumbs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { ReviewRowActions } from "../review-row-actions";

// Staff review queue for resident self-submitted meter readings:
// everything self_submitted and not yet reviewed, for this building's
// units. Accepting stamps reviewed_at; deleting removes a bad entry.
export default async function MeterReadingReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const t = await getTranslations("meterReadings");
  const tAssociations = await getTranslations("associations");
  const supabase = await createClient();

  const { data: building } = await supabase
    .from("buildings")
    .select("id, name, association_id, associations(name)")
    .eq("id", id)
    .maybeSingle();

  if (!building) {
    notFound();
  }

  const context = await getCurrentCapabilities(supabase, building.association_id);
  const canRecord = (context?.capabilities ?? []).includes("finance.meter_reading.record");

  const { data: units } = await supabase
    .from("units")
    .select("id, unit_number")
    .eq("building_id", id);
  const unitNumberById = new Map((units ?? []).map((u) => [u.id, u.unit_number]));
  const unitIds = (units ?? []).map((u) => u.id);

  const { data: pending } = unitIds.length
    ? await supabase
        .from("meter_readings")
        .select("id, unit_id, meter_type, meter_id, reading_value, reading_date, created_at")
        .in("unit_id", unitIds)
        .eq("self_submitted", true)
        .is("reviewed_at", null)
        .order("created_at", { ascending: false })
    : { data: [] };

  const associationName = building.associations?.name ?? tAssociations("title");

  return (
    <main className="mx-auto max-w-4xl p-4 sm:p-8">
      <Breadcrumbs
        items={[
          { label: tAssociations("title"), href: "/associations" },
          { label: associationName, href: `/associations/${building.association_id}` },
          { label: building.name, href: `/buildings/${building.id}` },
          { label: t("reviewTitle") },
        ]}
      />

      <div className="mb-6">
        <h1 className="text-2xl font-semibold">{t("reviewTitle")}</h1>
        <p className="text-sm text-muted-foreground">{t("reviewSubtitle")}</p>
      </div>

      {(pending ?? []).length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("reviewEmpty")}</p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("unitColumnLabel")}</TableHead>
                <TableHead>{t("meterLabel")}</TableHead>
                <TableHead>{t("readingValueLabel")}</TableHead>
                <TableHead>{t("readingDateLabel")}</TableHead>
                {canRecord && <TableHead className="text-right" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {(pending ?? []).map((reading) => (
                <TableRow key={reading.id}>
                  <TableCell>{unitNumberById.get(reading.unit_id) ?? "—"}</TableCell>
                  <TableCell>
                    {reading.meter_type}
                    {reading.meter_id ? ` (${reading.meter_id})` : ""}
                  </TableCell>
                  <TableCell>{reading.reading_value}</TableCell>
                  <TableCell>{formatDate(reading.reading_date)}</TableCell>
                  {canRecord && (
                    <TableCell className="text-right">
                      <ReviewRowActions id={reading.id} />
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </main>
  );
}
