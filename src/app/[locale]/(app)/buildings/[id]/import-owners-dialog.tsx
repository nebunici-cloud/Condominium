"use client";

import { useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { UploadIcon, DownloadIcon } from "lucide-react";
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
  DialogTrigger,
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
  parseOwnersImport,
  commitOwnersImport,
  type ParsedOwnerRow,
} from "./import-owners-actions";

const errorLabelKeys: Record<ParsedOwnerRow["errors"][number], string> = {
  missing_full_name: "errorMissingFullName",
  missing_unit_number: "errorMissingUnitNumber",
  unit_not_found: "errorUnitNotFound",
  missing_share_percent: "errorMissingSharePercent",
  invalid_number: "errorInvalidNumber",
  invalid_date: "errorInvalidDate",
};

export function ImportOwnersDialog({
  buildingId,
  tenantId,
}: {
  buildingId: string;
  tenantId: string;
}) {
  const t = useTranslations("owners");
  const tUnits = useTranslations("units");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<ParsedOwnerRow[] | null>(null);
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);

  function reset() {
    setRows(null);
    setParsing(false);
    setImporting(false);
  }

  async function handleParse(formData: FormData) {
    setParsing(true);
    const result = await parseOwnersImport(buildingId, formData);
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
    const result = await commitOwnersImport(buildingId, tenantId, rows);
    setImporting(false);

    if (result.error) {
      toast.error(t("importError"));
      return;
    }

    toast.success(t("importSuccess", { count: result.imported }));
    reset();
    setOpen(false);
  }

  const validCount = rows?.filter((r) => r.errors.length === 0).length ?? 0;
  const invalidCount = (rows?.length ?? 0) - validCount;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline">
          <UploadIcon />
          {t("importTitle")}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("importTitle")}</DialogTitle>
        </DialogHeader>

        {!rows ? (
          <form action={handleParse} className="flex flex-col gap-4">
            <Button variant="link" className="w-fit px-0" asChild>
              <a href={`/${locale}/buildings/${buildingId}/owners-template`} download>
                <DownloadIcon />
                {t("downloadTemplate")}
              </a>
            </Button>
            <div className="grid gap-2">
              <Label htmlFor="owners-file">{t("importFileLabel")}</Label>
              <Input id="owners-file" name="file" type="file" accept=".xlsx" required />
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
                    <TableHead>{t("fullNameLabel")}</TableHead>
                    <TableHead>{tUnits("unitNumberLabel")}</TableHead>
                    <TableHead>{t("importColumnStatus")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.rowNumber}>
                      <TableCell>{row.rowNumber}</TableCell>
                      <TableCell>{row.fullName || "—"}</TableCell>
                      <TableCell>{row.unitNumber || "—"}</TableCell>
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
