"use client";

import { useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { DownloadIcon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import {
  parseOpeningBalancesImport,
  commitOpeningBalancesImport,
  type ParsedOpeningBalanceRow,
} from "./import-opening-balances-actions";

const errorLabelKeys: Record<ParsedOpeningBalanceRow["errors"][number], string> = {
  missing_unit_number: "errorMissingUnitNumber",
  unit_not_found: "errorUnitNotFound",
  missing_amount: "errorMissingAmount",
  invalid_number: "errorInvalidNumber",
  invalid_date: "errorInvalidDate",
};

export function ImportOpeningBalancesDialog({
  buildingId,
  tenantId,
  open,
  onOpenChange,
}: {
  buildingId: string;
  tenantId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("openingBalances");
  const tUnits = useTranslations("units");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const [rows, setRows] = useState<ParsedOpeningBalanceRow[] | null>(null);
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);

  function reset() {
    setRows(null);
    setParsing(false);
    setImporting(false);
  }

  async function handleParse(formData: FormData) {
    setParsing(true);
    const result = await parseOpeningBalancesImport(buildingId, formData);
    setParsing(false);

    if (result.error) {
      toast.error(t("importError"));
      return;
    }

    setRows(result.rows);
  }

  async function handleConfirm() {
    if (!rows) return;
    setImporting(true);
    const result = await commitOpeningBalancesImport(buildingId, tenantId, rows);
    setImporting(false);

    if (result.error) {
      toast.error(t("importError"));
      return;
    }

    toast.success(t("importSuccess", { count: result.imported }));
    reset();
    onOpenChange(false);
  }

  const validCount = rows?.filter((r) => r.errors.length === 0).length ?? 0;
  const invalidCount = (rows?.length ?? 0) - validCount;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) reset();
      }}
    >
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("importTitle")}</DialogTitle>
        </DialogHeader>

        {!rows ? (
          <form action={handleParse} className="flex flex-col gap-4">
            <Button variant="link" className="w-fit px-0" asChild>
              <a
                href={`/${locale}/buildings/${buildingId}/opening-balances-template`}
                download
              >
                <DownloadIcon />
                {t("downloadTemplate")}
              </a>
            </Button>
            <div className="grid gap-2">
              <Label htmlFor="balances-file">{t("importFileLabel")}</Label>
              <Input id="balances-file" name="file" type="file" accept=".xlsx" required />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={parsing}>
                {parsing ? t("importParsing") : t("importParse")}
              </Button>
            </DialogFooter>
          </form>
        ) : (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-muted-foreground">
              {t("importSummary", {
                valid: validCount,
                total: rows.length,
                invalid: invalidCount,
              })}
            </p>

            <div className="max-h-80 overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("importColumnRow")}</TableHead>
                    <TableHead>{tUnits("unitNumberLabel")}</TableHead>
                    <TableHead>{t("amountLabel")}</TableHead>
                    <TableHead>{t("importColumnStatus")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.rowNumber}>
                      <TableCell>{row.rowNumber}</TableCell>
                      <TableCell>{row.unitNumber || "—"}</TableCell>
                      <TableCell>{row.amount ?? "—"}</TableCell>
                      <TableCell>
                        {row.errors.length === 0 ? (
                          <Badge>{t("importRowOk")}</Badge>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {row.errors.map((err) => (
                              <Badge key={err} variant="destructive">
                                {t(errorLabelKeys[err])}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={reset}>
                {tCommon("back")}
              </Button>
              <Button onClick={handleConfirm} disabled={importing || validCount === 0}>
                {importing
                  ? t("importConfirming")
                  : validCount === 0
                    ? t("importNoValidRows")
                    : t("importConfirm", { count: validCount })}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
