import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { createClient } from "@/lib/supabase/server";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { EndEffectiveDatedButton } from "@/components/end-effective-dated-button";
import { Breadcrumbs } from "@/components/breadcrumbs";

import { NewOwnershipDialog } from "./new-ownership-dialog";
import { NewOccupancyDialog } from "./new-occupancy-dialog";
import { endOwnership, endOccupancy } from "./actions";
import { RecordPaymentDialog } from "./record-payment-dialog";
import { MatchPaymentButton } from "./match-payment-button";
import { EditUnitDialog } from "./edit-unit-dialog";

export default async function UnitDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const t = await getTranslations("units");
  const tOwnerships = await getTranslations("ownerships");
  const tOccupancies = await getTranslations("occupancies");
  const tPayments = await getTranslations("payments");
  const tInvoices = await getTranslations("invoices");
  const tCommon = await getTranslations("common");
  const tAssociations = await getTranslations("associations");
  const supabase = await createClient();

  const { data: unit } = await supabase
    .from("units")
    .select(
      "id, tenant_id, unit_number, floor, area_sqm, ownership_share_percent, resident_count, meters, building_id, buildings(name, association_id, associations(name))"
    )
    .eq("id", id)
    .maybeSingle();

  if (!unit) {
    notFound();
  }

  const building = unit.buildings?.[0];
  const buildingName = building?.name ?? t("title");
  const associationId = building?.association_id;
  const associationName = building?.associations?.[0]?.name ?? tAssociations("title");

  const [{ data: ownerships }, { data: occupancies }, { data: owners }, { data: payments }, { data: outstandingInvoices }] =
    await Promise.all([
      supabase
        .from("ownerships")
        .select("id, share_percent, effective_from, effective_to, owners(full_name)")
        .eq("unit_id", id)
        .order("effective_from", { ascending: false }),
      supabase
        .from("occupancies")
        .select("id, effective_from, effective_to, occupants(full_name)")
        .eq("unit_id", id)
        .order("effective_from", { ascending: false }),
      supabase
        .from("owners")
        .select("id, full_name")
        .order("full_name", { ascending: true }),
      supabase
        .from("payments")
        .select("id, amount, paid_at, method, reference, matched_invoice_id")
        .eq("unit_id", id)
        .order("paid_at", { ascending: false }),
      supabase
        .from("invoices")
        .select("id, billing_period_start, billing_period_end, total_amount, status")
        .eq("unit_id", id)
        .in("status", ["issued", "partially_paid"])
        .order("billing_period_start", { ascending: false }),
    ]);

  const currentShareSum = (ownerships ?? [])
    .filter((o) => !o.effective_to)
    .reduce((sum, o) => sum + o.share_percent, 0);
  const currentShareSumRounded = Math.round(currentShareSum * 1000) / 1000;

  return (
    <main className="mx-auto max-w-4xl p-8">
      <Breadcrumbs
        items={[
          { label: tAssociations("title"), href: "/associations" },
          ...(associationId
            ? [{ label: associationName, href: `/associations/${associationId}` }]
            : []),
          { label: buildingName, href: `/buildings/${unit.building_id}` },
          { label: unit.unit_number },
        ]}
      />

      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">
          {t("title")} — {unit.unit_number}
        </h1>
        <EditUnitDialog
          unitId={unit.id}
          defaultValues={{
            unitNumber: unit.unit_number,
            floor: unit.floor?.toString() ?? "",
            areaSqm: unit.area_sqm?.toString() ?? "",
            ownershipSharePercent: unit.ownership_share_percent?.toString() ?? "",
            residentCount: unit.resident_count?.toString() ?? "",
            meters: Array.isArray(unit.meters)
              ? unit.meters.map((m: { type?: string; meter_id?: string }) => ({
                  type: m.type ?? "",
                  meterId: m.meter_id ?? "",
                }))
              : [],
          }}
        />
      </div>

      <section className="mb-10">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-medium">{tOwnerships("title")}</h2>
          <NewOwnershipDialog
            unitId={unit.id}
            tenantId={unit.tenant_id}
            owners={owners ?? []}
          />
        </div>

        {ownerships && ownerships.some((o) => !o.effective_to) && (
          <Alert
            variant={currentShareSumRounded === 100 ? "default" : "destructive"}
            className="mb-4"
          >
            <AlertTitle>
              {currentShareSumRounded === 100
                ? tOwnerships("shareSumOk")
                : tOwnerships("shareSumWarning", { sum: currentShareSumRounded })}
            </AlertTitle>
          </Alert>
        )}

        {!ownerships || ownerships.length === 0 ? (
          <p className="text-sm text-muted-foreground">{tOwnerships("noOwnerships")}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{tOwnerships("ownerLabel")}</TableHead>
                <TableHead>{tOwnerships("sharePercentLabel")}</TableHead>
                <TableHead>{tCommon("status")}</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {ownerships.map((ownership) => {
                const isCurrent = !ownership.effective_to;
                return (
                  <TableRow key={ownership.id}>
                    <TableCell className="font-medium">
                      {ownership.owners?.[0]?.full_name ?? "—"}
                    </TableCell>
                    <TableCell>{ownership.share_percent}%</TableCell>
                    <TableCell>
                      <Badge variant={isCurrent ? "default" : "secondary"}>
                        {isCurrent ? tOwnerships("current") : tOwnerships("historical")}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {isCurrent && (
                        <EndEffectiveDatedButton
                          id={ownership.id}
                          action={endOwnership}
                          triggerLabel={tOwnerships("endOwnership")}
                          confirmTitle={tOwnerships("endOwnership")}
                          confirmDescription={tOwnerships("endOwnershipConfirm")}
                          successMessage={tOwnerships("endSuccess")}
                          cancelLabel={tCommon("cancel")}
                          confirmLabel={tCommon("confirm")}
                        />
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </section>

      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-medium">{tOccupancies("title")}</h2>
          <NewOccupancyDialog unitId={unit.id} tenantId={unit.tenant_id} />
        </div>

        {!occupancies || occupancies.length === 0 ? (
          <p className="text-sm text-muted-foreground">{tOccupancies("noOccupancies")}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{tOccupancies("fullNameLabel")}</TableHead>
                <TableHead>{tCommon("status")}</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {occupancies.map((occupancy) => {
                const isCurrent = !occupancy.effective_to;
                return (
                  <TableRow key={occupancy.id}>
                    <TableCell className="font-medium">
                      {occupancy.occupants?.[0]?.full_name ?? "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={isCurrent ? "default" : "secondary"}>
                        {isCurrent
                          ? tOwnerships("current")
                          : tOwnerships("historical")}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {isCurrent && (
                        <EndEffectiveDatedButton
                          id={occupancy.id}
                          action={endOccupancy}
                          triggerLabel={tOccupancies("endOccupancy")}
                          confirmTitle={tOccupancies("endOccupancy")}
                          confirmDescription={tOccupancies("endOccupancyConfirm")}
                          successMessage={tOccupancies("endSuccess")}
                          cancelLabel={tCommon("cancel")}
                          confirmLabel={tCommon("confirm")}
                        />
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </section>

      <section className="mt-10">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-medium">{tPayments("title")}</h2>
          <RecordPaymentDialog
            unitId={unit.id}
            tenantId={unit.tenant_id}
            outstandingInvoices={outstandingInvoices ?? []}
          />
        </div>

        {!payments || payments.length === 0 ? (
          <p className="text-sm text-muted-foreground">{tPayments("noPayments")}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{tPayments("paidAtLabel")}</TableHead>
                <TableHead>{tPayments("amountLabel")}</TableHead>
                <TableHead>{tPayments("methodLabel")}</TableHead>
                <TableHead>{tInvoices("period")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {payments.map((payment) => (
                <TableRow key={payment.id}>
                  <TableCell>{payment.paid_at}</TableCell>
                  <TableCell className="font-medium">{payment.amount}</TableCell>
                  <TableCell>{payment.method ?? "—"}</TableCell>
                  <TableCell>
                    {payment.matched_invoice_id ? (
                      <Badge variant="secondary">
                        {outstandingInvoices?.find((i) => i.id === payment.matched_invoice_id)
                          ?.billing_period_start ?? tPayments("matchButton")}
                      </Badge>
                    ) : (
                      <MatchPaymentButton
                        paymentId={payment.id}
                        outstandingInvoices={outstandingInvoices ?? []}
                      />
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>
    </main>
  );
}
