import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ChevronRightIcon } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { getCurrentCapabilities } from "@/lib/capabilities";
import { embedOne } from "@/lib/embed";
import { getMeterTypeOptions } from "@/lib/meter-types";
import { Link } from "@/i18n/navigation";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Breadcrumbs } from "@/components/breadcrumbs";

import { NewUnitDialog } from "./new-unit-dialog";
import { EditBuildingDialog } from "./edit-building-dialog";
import { ImportDataMenu } from "./import-data-menu";

export default async function BuildingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const t = await getTranslations("units");
  const tInvoices = await getTranslations("invoices");
  const tBuildings = await getTranslations("buildings");
  const tAssociations = await getTranslations("associations");
  const supabase = await createClient();

  const { data: building } = await supabase
    .from("buildings")
    .select("id, tenant_id, name, address, association_id, associations(name)")
    .eq("id", id)
    .maybeSingle();

  if (!building) {
    notFound();
  }

  const context = await getCurrentCapabilities(supabase, building.association_id);
  const capabilities = context?.capabilities ?? [];

  const { data: units } = await supabase
    .from("units")
    .select("id, unit_number, floor, area_sqm, ownership_share_percent, meters")
    .eq("building_id", id)
    .order("unit_number", { ascending: true });

  const unitIds = (units ?? []).map((unit) => unit.id);

  const [{ data: currentOwnershipRows }, meterTypeOptions] = await Promise.all([
    unitIds.length
      ? supabase
          .from("ownerships")
          .select("unit_id, share_percent")
          .in("unit_id", unitIds)
          .is("effective_to", null)
      : Promise.resolve({ data: [] }),
    getMeterTypeOptions(supabase, building.association_id),
  ]);

  const shareSumByUnit = new Map<string, number>();
  for (const row of currentOwnershipRows ?? []) {
    shareSumByUnit.set(row.unit_id, (shareSumByUnit.get(row.unit_id) ?? 0) + row.share_percent);
  }
  const completedUnitsCount = (units ?? []).filter(
    (unit) => Math.round((shareSumByUnit.get(unit.id) ?? 0) * 1000) / 1000 === 100
  ).length;

  const shareSum = (units ?? []).reduce(
    (sum, unit) => sum + (unit.ownership_share_percent ?? 0),
    0
  );
  const shareSumRounded = Math.round(shareSum * 1000) / 1000;

  const associationName = embedOne(building.associations)?.name ?? tBuildings("title");

  return (
    <main className="mx-auto max-w-4xl p-4 sm:p-8">
      <Breadcrumbs
        items={[
          { label: tAssociations("title"), href: "/associations" },
          { label: associationName, href: `/associations/${building.association_id}` },
          { label: building.name },
        ]}
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">
            {t("subtitle", { building: building.name })}
          </p>
          {units && units.length > 0 && (
            <p className="mt-1 text-sm text-muted-foreground">
              {tBuildings("unitsCompletedStat", {
                completed: completedUnitsCount,
                total: units.length,
              })}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {capabilities.includes("core.building.update") && (
            <EditBuildingDialog
              buildingId={building.id}
              defaultValues={{ name: building.name, address: building.address ?? "" }}
            />
          )}
          {capabilities.includes("finance.invoice.view") && (
            <Button variant="outline" asChild>
              <Link href={`/buildings/${building.id}/invoices`}>{tInvoices("title")}</Link>
            </Button>
          )}
          <ImportDataMenu
            buildingId={building.id}
            tenantId={building.tenant_id}
            capabilities={capabilities}
          />
          {capabilities.includes("core.unit.create") && (
            <NewUnitDialog
              buildingId={building.id}
              tenantId={building.tenant_id}
              meterTypeOptions={meterTypeOptions}
            />
          )}
        </div>
      </div>

      {units && units.length > 0 && (
        <Alert
          variant={shareSumRounded === 100 ? "default" : "destructive"}
          className="mb-6"
        >
          <AlertTitle>
            {shareSumRounded === 100 ? t("shareSumOk") : t("shareSumWarningTitle")}
          </AlertTitle>
          {shareSumRounded !== 100 && (
            <AlertDescription>
              {t("shareSumWarning", { sum: shareSumRounded })}
            </AlertDescription>
          )}
        </Alert>
      )}

      {!units || units.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("noUnits")}</p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("unitNumberLabel")}</TableHead>
                <TableHead>{t("floorLabel")}</TableHead>
                <TableHead>{t("areaLabel")}</TableHead>
                <TableHead>{t("shareLabel")}</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {units.map((unit) => (
                <TableRow key={unit.id} className="relative cursor-pointer">
                  <TableCell className="font-medium">{unit.unit_number}</TableCell>
                  <TableCell>{unit.floor ?? "—"}</TableCell>
                  <TableCell>{unit.area_sqm ?? "—"}</TableCell>
                  <TableCell>{unit.ownership_share_percent ?? "—"}</TableCell>
                  <TableCell>
                    <Link href={`/units/${unit.id}`} className="absolute inset-0">
                      <span className="sr-only">{t("viewDetails")}</span>
                    </Link>
                    <ChevronRightIcon className="ml-auto size-4 text-muted-foreground" />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </main>
  );
}
