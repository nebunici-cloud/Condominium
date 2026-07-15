"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import { SendIcon, XIcon } from "lucide-react";
import { toast } from "sonner";

import { formatPeriodLabel, formatDate } from "@/lib/period";

import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EndEffectiveDatedButton } from "@/components/end-effective-dated-button";

import { statusBadgeClasses, statusLabelKeys } from "./invoice-status";
import { cancelInvoice, cancelInvoices, publishInvoice, publishDraftInvoices } from "./actions";

type InvoiceRow = {
  id: string;
  invoiceNumber: number | null;
  unitNumber: string;
  periodStart: string;
  periodEnd: string;
  issuedAt: string | null;
  totalAmount: number;
  status: string;
};

// "active" (default) hides cancelled invoices, which otherwise pile
// up forever in the list -- they stay in the database for the audit
// trail (consumed invoice numbers, payment history), just not in the
// day-to-day view. Every other option is a single exact status.
type StatusFilter = "active" | "all" | "draft" | "issued" | "partially_paid" | "paid" | "cancelled";

function matchesFilter(status: string, filter: StatusFilter): boolean {
  if (filter === "active") return status !== "cancelled";
  if (filter === "all") return true;
  return status === filter;
}

// Shared shape for the two mass-action buttons -- confirm dialog,
// loading state, and toast are identical, only the action/labels
// differ.
function BulkActionButton({
  count,
  triggerLabel,
  confirmTitle,
  confirmDescription,
  confirmLabel,
  cancelLabel,
  confirmVariant,
  onConfirm,
}: {
  count: number;
  triggerLabel: string;
  confirmTitle: string;
  confirmDescription: string;
  confirmLabel: string;
  cancelLabel: string;
  confirmVariant: "default" | "destructive";
  onConfirm: () => Promise<{ error: string | null }>;
}) {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleConfirm() {
    setSubmitting(true);
    const result = await onConfirm();
    setSubmitting(false);

    if (result.error) {
      toast.error(result.error);
      return;
    }

    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant={confirmVariant === "destructive" ? "outline" : "default"}>
          {triggerLabel} ({count})
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{confirmTitle}</DialogTitle>
          <DialogDescription>{confirmDescription}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            {cancelLabel}
          </Button>
          <Button variant={confirmVariant} disabled={submitting} onClick={handleConfirm}>
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function InvoicesTable({
  buildingId,
  invoices,
  canPublish,
  canDiscard,
}: {
  buildingId: string;
  invoices: InvoiceRow[];
  canPublish: boolean;
  canDiscard: boolean;
}) {
  const t = useTranslations("invoices");
  const tUnits = useTranslations("units");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("active");

  const visibleInvoices = invoices.filter((i) => matchesFilter(i.status, statusFilter));

  function handleFilterChange(next: StatusFilter) {
    setStatusFilter(next);
    // The selection bar's counts and "select all" checkbox only ever
    // reason about currently visible rows -- clearing on filter change
    // avoids a stale "3 selected" that's no longer showing.
    setSelected(new Set());
  }

  const allSelected = visibleInvoices.length > 0 && selected.size === visibleInvoices.length;
  const someSelected = selected.size > 0 && !allSelected;

  function toggleAll(checked: boolean) {
    setSelected(checked ? new Set(visibleInvoices.map((i) => i.id)) : new Set());
  }

  function toggleOne(id: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  const selectedIds = Array.from(selected);
  const selectedDraftCount = visibleInvoices.filter(
    (i) => selected.has(i.id) && i.status === "draft"
  ).length;
  const selectedCancellableCount = visibleInvoices.filter(
    (i) => selected.has(i.id) && (i.status === "draft" || i.status === "issued" || i.status === "partially_paid")
  ).length;

  async function handleBulkPublish() {
    const result = await publishDraftInvoices(selectedIds);
    if (result.error) return { error: result.error };
    toast.success(t("publishAllSuccess", { count: result.published }));
    setSelected(new Set());
    return { error: null };
  }

  async function handleBulkCancel() {
    const result = await cancelInvoices(selectedIds);
    if (result.error) return { error: result.error };
    toast.success(t("bulkCancelSuccess", { count: result.cancelled }));
    setSelected(new Set());
    return { error: null };
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">{t("filterLabel")}</span>
        <Select value={statusFilter} onValueChange={(v) => handleFilterChange(v as StatusFilter)}>
          <SelectTrigger className="w-[200px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="active">{t("filterActive")}</SelectItem>
            <SelectItem value="all">{t("filterAll")}</SelectItem>
            <SelectItem value="draft">{t(statusLabelKeys.draft)}</SelectItem>
            <SelectItem value="issued">{t(statusLabelKeys.issued)}</SelectItem>
            <SelectItem value="partially_paid">{t(statusLabelKeys.partially_paid)}</SelectItem>
            <SelectItem value="paid">{t(statusLabelKeys.paid)}</SelectItem>
            <SelectItem value="cancelled">{t(statusLabelKeys.cancelled)}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/40 px-3 py-2">
          <span className="text-sm text-muted-foreground">
            {t("selectedCount", { count: selected.size })}
          </span>
          {canPublish && selectedDraftCount > 0 && (
            <BulkActionButton
              count={selectedDraftCount}
              triggerLabel={t("publish")}
              confirmTitle={t("publish")}
              confirmDescription={t("bulkPublishConfirm", { count: selectedDraftCount })}
              confirmLabel={tCommon("confirm")}
              cancelLabel={tCommon("cancel")}
              confirmVariant="default"
              onConfirm={handleBulkPublish}
            />
          )}
          {canDiscard && selectedCancellableCount > 0 && (
            <BulkActionButton
              count={selectedCancellableCount}
              triggerLabel={t("cancelInvoice")}
              confirmTitle={t("cancelInvoice")}
              confirmDescription={t("bulkCancelConfirm", { count: selectedCancellableCount })}
              confirmLabel={tCommon("confirm")}
              cancelLabel={tCommon("cancel")}
              confirmVariant="destructive"
              onConfirm={handleBulkCancel}
            />
          )}
        </div>
      )}

      {visibleInvoices.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("filterNoMatches")}</p>
      ) : (
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8">
                <Checkbox
                  checked={allSelected ? true : someSelected ? "indeterminate" : false}
                  onCheckedChange={(checked) => toggleAll(checked === true)}
                  aria-label={t("selectAll")}
                />
              </TableHead>
              <TableHead>{t("invoiceNumberLabel")}</TableHead>
              <TableHead>{tUnits("unitNumberLabel")}</TableHead>
              <TableHead>{t("period")}</TableHead>
              <TableHead>{t("issuedAtLabel")}</TableHead>
              <TableHead>{t("totalAmount")}</TableHead>
              <TableHead>{tCommon("status")}</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibleInvoices.map((invoice) => (
              <TableRow
                key={invoice.id}
                className="cursor-pointer"
                onClick={() => router.push(`/buildings/${buildingId}/invoices/${invoice.id}`)}
              >
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <Checkbox
                    checked={selected.has(invoice.id)}
                    onCheckedChange={(checked) => toggleOne(invoice.id, checked === true)}
                    aria-label={t("selectRow")}
                  />
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {invoice.invoiceNumber ?? "—"}
                </TableCell>
                <TableCell className="font-medium">{invoice.unitNumber}</TableCell>
                <TableCell>{formatPeriodLabel(invoice.periodStart, invoice.periodEnd, locale)}</TableCell>
                <TableCell className="text-muted-foreground">
                  {invoice.issuedAt ? formatDate(invoice.issuedAt) : "—"}
                </TableCell>
                <TableCell>{invoice.totalAmount}</TableCell>
                <TableCell>
                  <Badge className={statusBadgeClasses[invoice.status]}>
                    {t(statusLabelKeys[invoice.status])}
                  </Badge>
                </TableCell>
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center justify-end gap-1">
                    {canPublish && invoice.status === "draft" && (
                      <EndEffectiveDatedButton
                        id={invoice.id}
                        action={publishInvoice}
                        triggerLabel={t("publish")}
                        confirmTitle={t("publish")}
                        confirmDescription={t("publishConfirm")}
                        successMessage={t("publishSuccess")}
                        cancelLabel={tCommon("cancel")}
                        confirmLabel={tCommon("confirm")}
                        confirmVariant="default"
                        icon={<SendIcon />}
                      />
                    )}
                    {canDiscard &&
                      (invoice.status === "draft" ||
                        invoice.status === "issued" ||
                        invoice.status === "partially_paid") && (
                        <EndEffectiveDatedButton
                          id={invoice.id}
                          action={cancelInvoice}
                          triggerLabel={
                            invoice.status === "draft" ? t("discardDraft") : t("cancelInvoice")
                          }
                          confirmTitle={
                            invoice.status === "draft" ? t("discardDraft") : t("cancelInvoice")
                          }
                          confirmDescription={
                            invoice.status === "draft"
                              ? t("discardDraftConfirm")
                              : t("cancelInvoiceConfirm")
                          }
                          successMessage={
                            invoice.status === "draft" ? t("discardDraftSuccess") : t("cancelSuccess")
                          }
                          cancelLabel={tCommon("cancel")}
                          confirmLabel={tCommon("confirm")}
                          icon={<XIcon />}
                        />
                      )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      )}
    </div>
  );
}
