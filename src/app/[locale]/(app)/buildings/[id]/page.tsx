import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { createClient } from "@/lib/supabase/server";
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

import { NewUnitDialog } from "./new-unit-dialog";
import { ImportUnitsDialog } from "./import-units-dialog";

export default async function BuildingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const t = await getTranslations("units");
  const supabase = await createClient();

  const { data: building } = await supabase
    .from("buildings")
    .select("id, tenant_id, name, association_id")
    .eq("id", id)
    .maybeSingle();

  if (!building) {
    notFound();
  }

  const { data: units } = await supabase
    .from("units")
    .select("id, unit_number, floor, area_sqm, ownership_share_percent, meters")
    .eq("building_id", id)
    .order("unit_number", { ascending: true });

  const shareSum = (units ?? []).reduce(
    (sum, unit) => sum + (unit.ownership_share_percent ?? 0),
    0
  );
  const shareSumRounded = Math.round(shareSum * 1000) / 1000;

  return (
    <main className="mx-auto max-w-4xl p-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">
            {t("subtitle", { building: building.name })}
          </p>
        </div>
        <div className="flex gap-2">
          <ImportUnitsDialog buildingId={building.id} tenantId={building.tenant_id} />
          <NewUnitDialog buildingId={building.id} tenantId={building.tenant_id} />
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
              <TableRow key={unit.id}>
                <TableCell className="font-medium">{unit.unit_number}</TableCell>
                <TableCell>{unit.floor ?? "—"}</TableCell>
                <TableCell>{unit.area_sqm ?? "—"}</TableCell>
                <TableCell>{unit.ownership_share_percent ?? "—"}</TableCell>
                <TableCell>
                  <Button variant="ghost" size="sm" asChild>
                    <Link href={`/units/${unit.id}`}>{t("viewDetails")}</Link>
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </main>
  );
}
