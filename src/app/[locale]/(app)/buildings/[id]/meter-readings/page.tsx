import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentCapabilities } from "@/lib/capabilities";
import { getMeterTypeOptions, normalizeMeterType } from "@/lib/meter-types";
import { embedOne } from "@/lib/embed";
import { Link } from "@/i18n/navigation";
import { Breadcrumbs } from "@/components/breadcrumbs";

import { BulkMeterReadingForm } from "./bulk-meter-reading-form";

export default async function BulkMeterReadingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ type?: string }>;
}) {
  const { id } = await params;
  const { type: requestedType } = await searchParams;
  const t = await getTranslations("meterReadings");
  const tAssociations = await getTranslations("associations");
  const supabase = await createClient();

  const { data: building } = await supabase
    .from("buildings")
    .select("id, tenant_id, name, association_id, associations(name)")
    .eq("id", id)
    .maybeSingle();

  if (!building) {
    notFound();
  }

  const context = await getCurrentCapabilities(supabase, building.association_id);
  const capabilities = context?.capabilities ?? [];
  const canRecord = capabilities.includes("finance.meter_reading.record");

  const associationName = embedOne(building.associations)?.name ?? tAssociations("title");
  const meterTypeOptions = await getMeterTypeOptions(supabase, building.association_id);
  const selectedType =
    requestedType && meterTypeOptions.includes(normalizeMeterType(requestedType))
      ? normalizeMeterType(requestedType)
      : meterTypeOptions[0];

  const { data: units } = await supabase
    .from("units")
    .select("id, unit_number, meters")
    .eq("building_id", id)
    .order("unit_number", { ascending: true });

  const rows = selectedType
    ? (units ?? [])
        .map((unit) => {
          const meters = Array.isArray(unit.meters)
            ? (unit.meters as { type?: string; meter_id?: string }[])
            : [];
          const meter = meters.find((m) => normalizeMeterType(m.type ?? "") === selectedType);
          if (!meter) return null;
          return { unitId: unit.id, unitNumber: unit.unit_number, meterId: meter.meter_id ?? "" };
        })
        .filter((row): row is { unitId: string; unitNumber: string; meterId: string } => row !== null)
    : [];

  const unitIds = rows.map((r) => r.unitId);
  const { data: readings } = selectedType && unitIds.length
    ? await supabase
        .from("meter_readings")
        .select("unit_id, reading_value, reading_date")
        .in("unit_id", unitIds)
        .eq("meter_type", selectedType)
        .order("reading_date", { ascending: false })
    : { data: [] };

  const lastReadingByUnit = new Map<string, { value: number; date: string }>();
  for (const reading of readings ?? []) {
    if (!lastReadingByUnit.has(reading.unit_id)) {
      lastReadingByUnit.set(reading.unit_id, { value: reading.reading_value, date: reading.reading_date });
    }
  }

  return (
    <main className="mx-auto max-w-4xl p-4 sm:p-8">
      <Breadcrumbs
        items={[
          { label: tAssociations("title"), href: "/associations" },
          { label: associationName, href: `/associations/${building.association_id}` },
          { label: building.name, href: `/buildings/${building.id}` },
          { label: t("bulkTitle") },
        ]}
      />

      <div className="mb-6">
        <h1 className="text-2xl font-semibold">{t("bulkTitle")}</h1>
        <p className="text-sm text-muted-foreground">
          {t("bulkSubtitle", { building: building.name })}
        </p>
      </div>

      {meterTypeOptions.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("bulkNoMeterTypesConfigured")}</p>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap gap-2">
            {meterTypeOptions.map((type) => (
              <Link
                key={type}
                href={`/buildings/${building.id}/meter-readings?type=${encodeURIComponent(type)}`}
                className={`rounded-md border px-3 py-1.5 text-sm ${
                  type === selectedType
                    ? "border-primary bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted"
                }`}
              >
                {type}
              </Link>
            ))}
          </div>

          {!canRecord ? (
            <p className="text-sm text-muted-foreground">{t("bulkNoPermission")}</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("bulkNoUnitsForType")}</p>
          ) : (
            <BulkMeterReadingForm
              tenantId={building.tenant_id}
              meterType={selectedType ?? ""}
              rows={rows.map((row) => ({
                ...row,
                lastReading: lastReadingByUnit.get(row.unitId) ?? null,
              }))}
            />
          )}
        </>
      )}
    </main>
  );
}
