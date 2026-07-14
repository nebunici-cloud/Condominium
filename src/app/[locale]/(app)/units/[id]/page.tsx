import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentCapabilities } from "@/lib/capabilities";
import { embedOne } from "@/lib/embed";
import { getMeterTypeOptions } from "@/lib/meter-types";
import { computeOutstandingBalance } from "@/lib/balance";
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
import { AddOwnerAsOccupantButton } from "./add-owner-as-occupant-button";
import { endOwnership, endOccupancy } from "./actions";
import { RecordPaymentDialog } from "./record-payment-dialog";
import { MatchPaymentButton } from "./match-payment-button";
import { EditUnitDialog } from "./edit-unit-dialog";
import { RecordMeterReadingDialog } from "./record-meter-reading-dialog";

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
  const tMeterReadings = await getTranslations("meterReadings");
  const tBalance = await getTranslations("balance");
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

  const building = embedOne(unit.buildings);
  const buildingName = building?.name ?? t("title");
  const associationId = building?.association_id;
  const associationName = embedOne(building?.associations)?.name ?? tAssociations("title");
  const meterTypeOptions = associationId ? await getMeterTypeOptions(supabase, associationId) : [];

  const context = await getCurrentCapabilities(supabase, associationId);
  const capabilities = context?.capabilities ?? [];

  const [
    { data: ownerships },
    { data: occupancies },
    { data: owners },
    { data: payments },
    { data: outstandingInvoices },
    { data: meterReadings },
    { data: allInvoices },
    { data: openingBalance },
  ] = await Promise.all([
      supabase
        .from("ownerships")
        .select("id, share_percent, effective_from, effective_to, owners(id, full_name)")
        .eq("unit_id", id)
        .order("effective_from", { ascending: false }),
      supabase
        .from("occupancies")
        .select("id, effective_from, effective_to, occupants(full_name, owner_id)")
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
      supabase
        .from("meter_readings")
        .select("id, meter_type, meter_id, reading_value, reading_date")
        .eq("unit_id", id)
        .order("reading_date", { ascending: false })
        .limit(20),
      supabase.from("invoices").select("total_amount, status").eq("unit_id", id),
      supabase.from("opening_balances").select("amount, as_of_date").eq("unit_id", id).maybeSingle(),
    ]);

  const outstandingBalance = computeOutstandingBalance({
    openingBalance: openingBalance?.amount ?? 0,
    invoiceTotal: (allInvoices ?? [])
      .filter((i) => i.status !== "cancelled")
      .reduce((sum, i) => sum + i.total_amount, 0),
    paymentTotal: (payments ?? []).reduce((sum, p) => sum + p.amount, 0),
  });

  const unitMeters = Array.isArray(unit.meters)
    ? unit.meters.map((m: { type?: string; meter_id?: string }) => ({
        type: m.type ?? "",
        meterId: m.meter_id ?? "",
      }))
    : [];

  const lastReadingByMeterKey: Record<string, { value: number; date: string }> = {};
  for (const reading of meterReadings ?? []) {
    const key = `${reading.meter_type}::${reading.meter_id ?? ""}`;
    if (!lastReadingByMeterKey[key]) {
      lastReadingByMeterKey[key] = { value: reading.reading_value, date: reading.reading_date };
    }
  }

  const currentShareSum = (ownerships ?? [])
    .filter((o) => !o.effective_to)
    .reduce((sum, o) => sum + o.share_percent, 0);
  const currentShareSumRounded = Math.round(currentShareSum * 1000) / 1000;

  const currentOccupantOwnerIds = new Set(
    (occupancies ?? [])
      .filter((o) => !o.effective_to)
      .map((o) => embedOne(o.occupants)?.owner_id)
      .filter((ownerId): ownerId is string => Boolean(ownerId))
  );

  return (
    <main className="mx-auto max-w-4xl p-4 sm:p-8">
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

      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">
          {t("title")} — {unit.unit_number}
        </h1>
        {capabilities.includes("core.unit.update") && (
          <EditUnitDialog
            unitId={unit.id}
            defaultValues={{
              unitNumber: unit.unit_number,
              floor: unit.floor?.toString() ?? "",
              areaSqm: unit.area_sqm?.toString() ?? "",
              ownershipSharePercent: unit.ownership_share_percent?.toString() ?? "",
              residentCount: unit.resident_count?.toString() ?? "",
              meters: unitMeters,
            }}
            meterTypeOptions={meterTypeOptions}
          />
        )}
      </div>

      <section className="mb-10">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
          <h2 className="text-lg font-medium">{tOwnerships("title")}</h2>
          {capabilities.includes("core.ownership.create") && (
            <NewOwnershipDialog
              unitId={unit.id}
              tenantId={unit.tenant_id}
              owners={owners ?? []}
              canCreateOwner={capabilities.includes("core.owner.create")}
            />
          )}
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
          <div className="overflow-x-auto">
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
                  const owner = embedOne(ownership.owners);
                  const ownerAlreadyLivesHere = owner && currentOccupantOwnerIds.has(owner.id);
                  return (
                    <TableRow key={ownership.id}>
                      <TableCell className="font-medium">{owner?.full_name ?? "—"}</TableCell>
                      <TableCell>{ownership.share_percent}%</TableCell>
                      <TableCell>
                        <Badge variant={isCurrent ? "default" : "secondary"}>
                          {isCurrent ? tOwnerships("current") : tOwnerships("historical")}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-1">
                          {isCurrent &&
                            owner &&
                            !ownerAlreadyLivesHere &&
                            capabilities.includes("core.occupant.create") &&
                            capabilities.includes("core.occupancy.create") && (
                              <AddOwnerAsOccupantButton
                                unitId={unit.id}
                                tenantId={unit.tenant_id}
                                ownerId={owner.id}
                              />
                            )}
                          {isCurrent && capabilities.includes("core.ownership.update") && (
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
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      <section>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
          <h2 className="text-lg font-medium">{tOccupancies("title")}</h2>
          {capabilities.includes("core.occupant.create") &&
            capabilities.includes("core.occupancy.create") && (
              <NewOccupancyDialog unitId={unit.id} tenantId={unit.tenant_id} />
            )}
        </div>

        {!occupancies || occupancies.length === 0 ? (
          <p className="text-sm text-muted-foreground">{tOccupancies("noOccupancies")}</p>
        ) : (
          <div className="overflow-x-auto">
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
                  const occupant = embedOne(occupancy.occupants);
                  return (
                    <TableRow key={occupancy.id}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          {occupant?.full_name ?? "—"}
                          {occupant?.owner_id && (
                            <Badge variant="outline">{tOccupancies("isOwnerBadge")}</Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={isCurrent ? "default" : "secondary"}>
                          {isCurrent
                            ? tOwnerships("current")
                            : tOwnerships("historical")}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {isCurrent && capabilities.includes("core.occupancy.update") && (
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
          </div>
        )}
      </section>

      <section className="mt-10">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
          <h2 className="text-lg font-medium">{tPayments("title")}</h2>
          {capabilities.includes("finance.payment.record") && (
            <RecordPaymentDialog
              unitId={unit.id}
              tenantId={unit.tenant_id}
              outstandingInvoices={outstandingInvoices ?? []}
            />
          )}
        </div>

        {capabilities.includes("finance.invoice.view") && (
          <Alert variant={outstandingBalance > 0 ? "destructive" : "default"} className="mb-4">
            <AlertTitle>
              {outstandingBalance > 0
                ? tBalance("owed", { amount: outstandingBalance.toFixed(2) })
                : outstandingBalance < 0
                  ? tBalance("credit", { amount: Math.abs(outstandingBalance).toFixed(2) })
                  : tBalance("settled")}
            </AlertTitle>
          </Alert>
        )}

        {!payments || payments.length === 0 ? (
          <p className="text-sm text-muted-foreground">{tPayments("noPayments")}</p>
        ) : (
          <div className="overflow-x-auto">
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
                        capabilities.includes("finance.payment.record") && (
                          <MatchPaymentButton
                            paymentId={payment.id}
                            outstandingInvoices={outstandingInvoices ?? []}
                          />
                        )
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      <section className="mt-10">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
          <h2 className="text-lg font-medium">{tMeterReadings("title")}</h2>
          {capabilities.includes("finance.meter_reading.record") && (
            <RecordMeterReadingDialog
              unitId={unit.id}
              tenantId={unit.tenant_id}
              meters={unitMeters}
              lastReadingByKey={lastReadingByMeterKey}
            />
          )}
        </div>

        {unitMeters.length === 0 ? (
          <p className="text-sm text-muted-foreground">{tMeterReadings("noMetersConfigured")}</p>
        ) : !meterReadings || meterReadings.length === 0 ? (
          <p className="text-sm text-muted-foreground">{tMeterReadings("noReadings")}</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{tMeterReadings("meterLabel")}</TableHead>
                  <TableHead>{tMeterReadings("readingValueLabel")}</TableHead>
                  <TableHead>{tMeterReadings("readingDateLabel")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {meterReadings.map((reading) => (
                  <TableRow key={reading.id}>
                    <TableCell className="font-medium">
                      {reading.meter_type}
                      {reading.meter_id ? ` (${reading.meter_id})` : ""}
                    </TableCell>
                    <TableCell>{reading.reading_value}</TableCell>
                    <TableCell>{reading.reading_date}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
    </main>
  );
}
