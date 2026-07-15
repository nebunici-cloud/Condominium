"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { recordMeterReadings } from "../meter-readings-actions";

type Row = {
  unitId: string;
  unitNumber: string;
  meterId: string;
  lastReading: { value: number; date: string } | null;
};

export function BulkMeterReadingForm({
  tenantId,
  meterType,
  rows,
}: {
  tenantId: string;
  meterType: string;
  rows: Row[];
}) {
  const t = useTranslations("meterReadings");
  const [readingDate, setReadingDate] = useState(new Date().toISOString().slice(0, 10));
  const [values, setValues] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const filledCount = Object.values(values).filter((v) => v.trim() !== "").length;

  async function handleSubmit() {
    const readings = rows
      .filter((row) => values[row.unitId]?.trim())
      .map((row) => ({
        unitId: row.unitId,
        meterId: row.meterId || undefined,
        readingValue: Number(values[row.unitId]),
      }));

    if (readings.length === 0) return;

    setSubmitting(true);
    const result = await recordMeterReadings({
      tenantId,
      meterType,
      readingDate,
      readings,
    });
    setSubmitting(false);

    if (result.error) {
      toast.error(t("createError"));
      return;
    }

    toast.success(t("bulkSuccess", { count: result.recorded }));
    setValues({});
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid max-w-xs gap-2">
        <Label>{t("readingDateLabel")}</Label>
        <Input type="date" value={readingDate} onChange={(e) => setReadingDate(e.target.value)} />
      </div>

      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("unitColumnLabel")}</TableHead>
              <TableHead>{t("lastReadingColumnLabel")}</TableHead>
              <TableHead>{t("newReadingColumnLabel")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.unitId}>
                <TableCell className="font-medium">{row.unitNumber}</TableCell>
                <TableCell className="text-muted-foreground">
                  {row.lastReading
                    ? t("lastReadingHint", { value: row.lastReading.value, date: row.lastReading.date })
                    : "—"}
                </TableCell>
                <TableCell>
                  <Input
                    type="number"
                    step="0.001"
                    className="w-32"
                    value={values[row.unitId] ?? ""}
                    onChange={(e) =>
                      setValues((prev) => ({ ...prev, [row.unitId]: e.target.value }))
                    }
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div>
        <Button onClick={handleSubmit} disabled={submitting || filledCount === 0}>
          {submitting ? t("bulkSubmitting") : t("bulkSubmit", { count: filledCount })}
        </Button>
      </div>
    </div>
  );
}
