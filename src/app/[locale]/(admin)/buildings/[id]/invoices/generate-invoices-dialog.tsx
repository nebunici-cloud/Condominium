"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { PlusIcon, PencilIcon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertTitle } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";

import { monthToRange, periodToMonth } from "@/lib/period";

import { previewInvoiceGeneration, commitInvoiceGeneration } from "./actions";

type FeeType = { id: string; label: string; method: string | null };

type Selection = Record<string, { selected: boolean; amount: string }>;

type PreviewResult = Awaited<ReturnType<typeof previewInvoiceGeneration>>;

const methodLabelKeys: Record<string, string> = {
  cota_parte: "methodCotaParte",
  by_area: "methodByArea",
  per_unit: "methodPerUnit",
  per_resident: "methodPerResident",
  by_meter: "methodByMeter",
  tariff_rate: "methodTariffRate",
};

// A fee type deviating this much from what it actually cost last
// period is worth flagging -- utility bills fluctuate normally, this
// is only meant to catch "typed the wrong number" territory.
const DEVIATION_WARNING_THRESHOLD = 0.2;

export function GenerateInvoicesDialog({
  buildingId,
  feeTypes,
  defaultPeriodStart,
  suggestedAmounts,
  mode = "create",
}: {
  buildingId: string;
  feeTypes: FeeType[];
  // A full calendar month is always derived from this alone (see
  // monthToRange) -- there's no independent "default end" to pick.
  defaultPeriodStart: string;
  suggestedAmounts: Record<string, number>;
  // "edit" re-opens an existing draft batch: the period is locked (it
  // already occupies that period, nothing to pick), suggestedAmounts
  // are that batch's own current amounts rather than "last period",
  // and confirming replaces the draft in place instead of creating a
  // new one alongside it.
  mode?: "create" | "edit";
}) {
  const t = useTranslations("invoices");
  const tFinance = useTranslations("financeSetup");
  const tCommon = useTranslations("common");
  const isEdit = mode === "edit";

  function defaultSelection(): Selection {
    return Object.fromEntries(
      feeTypes.map((f) => {
        const suggested = suggestedAmounts[f.id];
        return [
          f.id,
          suggested === undefined
            ? { selected: false, amount: "" }
            : { selected: true, amount: String(suggested) },
        ];
      })
    );
  }

  const [open, setOpen] = useState(false);
  const [periodMonth, setPeriodMonth] = useState(periodToMonth(defaultPeriodStart));
  const [selection, setSelection] = useState<Selection>(defaultSelection);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const { start: periodStart, end: periodEnd } = monthToRange(periodMonth);

  function reset() {
    setPeriodMonth(periodToMonth(defaultPeriodStart));
    setSelection(defaultSelection());
    setPreview(null);
  }

  function isTariff(feeTypeId: string) {
    return feeTypes.find((f) => f.id === feeTypeId)?.method === "tariff_rate";
  }

  function buildInput() {
    const feeTypeInputs = Object.entries(selection)
      .filter(([id, v]) => v.selected && (isTariff(id) || v.amount))
      .map(([feeTypeId, v]) =>
        isTariff(feeTypeId)
          ? { feeTypeId }
          : { feeTypeId, totalAmount: Number(v.amount) }
      );
    return { buildingId, periodStart, periodEnd, feeTypeInputs, isEdit };
  }

  async function handlePreview() {
    setPreviewing(true);
    const result = await previewInvoiceGeneration(buildInput());
    setPreviewing(false);
    setPreview(result);
  }

  async function handleConfirm() {
    setConfirming(true);
    const result = await commitInvoiceGeneration(buildInput());
    setConfirming(false);

    if (result.error) {
      toast.error(t("generateError"));
      return;
    }

    toast.success(isEdit ? t("editDraftSuccess") : t("generateSuccess", { count: result.invoiced }));
    reset();
    setOpen(false);
  }

  const hasSelection = Object.entries(selection).some(
    ([id, v]) => v.selected && (isTariff(id) || v.amount)
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        {isEdit ? (
          <Button size="sm" variant="outline">
            <PencilIcon />
            {t("editDraft")}
          </Button>
        ) : (
          <Button>
            <PlusIcon />
            {t("generate")}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? t("editDraft") : t("generate")}</DialogTitle>
          <DialogDescription>{isEdit ? t("editDraftHint") : t("generateDraftHint")}</DialogDescription>
        </DialogHeader>

        {feeTypes.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("noFeeTypesConfigured")}</p>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="grid max-w-48 gap-2">
              <Label>{t("periodLabel")}</Label>
              <Input
                type="month"
                value={periodMonth}
                disabled={isEdit}
                onChange={(e) => {
                  setPeriodMonth(e.target.value);
                  setPreview(null);
                }}
              />
            </div>

            <div className="grid gap-2">
              <Label>{t("selectFeeTypes")}</Label>
              {feeTypes.map((feeType) => {
                const amount = selection[feeType.id]?.amount ?? "";
                const suggested = suggestedAmounts[feeType.id];
                const tariff = feeType.method === "tariff_rate";
                const deviates =
                  !tariff &&
                  suggested !== undefined &&
                  amount !== "" &&
                  Math.abs(Number(amount) - suggested) > suggested * DEVIATION_WARNING_THRESHOLD;
                return (
                  <div key={feeType.id} className="flex flex-col gap-1">
                    <div className="flex items-center gap-3">
                      <Checkbox
                        checked={selection[feeType.id]?.selected ?? false}
                        onCheckedChange={(checked) => {
                          setSelection((s) => ({
                            ...s,
                            [feeType.id]: { ...s[feeType.id], selected: checked === true },
                          }));
                          setPreview(null);
                        }}
                      />
                      <span className="w-40 text-sm">{feeType.label}</span>
                      {tariff ? (
                        <span className="text-xs text-muted-foreground">
                          {t("tariffRateAutoLabel")}
                        </span>
                      ) : (
                        <Input
                          type="number"
                          step="0.01"
                          placeholder={t("amountForPeriod")}
                          disabled={!selection[feeType.id]?.selected}
                          value={amount}
                          onChange={(e) => {
                            setSelection((s) => ({
                              ...s,
                              [feeType.id]: { ...s[feeType.id], amount: e.target.value },
                            }));
                            setPreview(null);
                          }}
                        />
                      )}
                    </div>
                    {!tariff && suggested !== undefined && (
                      <p
                        className={`ml-8 text-xs ${deviates ? "text-destructive" : "text-muted-foreground"}`}
                      >
                        {t("lastAmountHint", { amount: suggested })}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>

            {preview && (
              <div className="flex flex-col gap-2">
                {preview.perFeeType.map((f) => (
                  <div key={f.feeTypeId} className="text-sm">
                    <span className="font-medium">{f.feeTypeLabel}</span>
                    {" — "}
                    {tFinance(methodLabelKeys[f.method])}
                    {f.method === "tariff_rate" && !f.error && (
                      <span className="ml-2 text-muted-foreground">
                        {t("computedTotalLabel", { amount: f.totalAmount.toFixed(2) })}
                      </span>
                    )}
                    {f.error === "no_active_rule" && (
                      <Alert variant="destructive" className="mt-1">
                        <AlertTitle>{t("noActiveRuleError")}</AlertTitle>
                      </Alert>
                    )}
                    {f.error === "no_weight_data" && (
                      <Alert variant="destructive" className="mt-1">
                        <AlertTitle>{t("noWeightDataError")}</AlertTitle>
                      </Alert>
                    )}
                    {f.excludedUnitIds.length > 0 && (
                      <Alert className="mt-1">
                        <AlertTitle>
                          {t("excludedUnitsWarning", { count: f.excludedUnitIds.length })}
                        </AlertTitle>
                      </Alert>
                    )}
                  </div>
                ))}
                {preview.willSkipCount > 0 && (
                  <Alert>
                    <AlertTitle>
                      {t("alreadyInvoicedWarning", {
                        skip: preview.willSkipCount,
                        total: preview.unitCount,
                      })}
                    </AlertTitle>
                  </Alert>
                )}
                <Alert>
                  <AlertTitle>
                    {t("willInvoice", {
                      count: preview.willInvoiceCount,
                      total: preview.totalAcrossUnits.toFixed(2),
                    })}
                  </AlertTitle>
                </Alert>
              </div>
            )}

            <DialogFooter>
              {!preview ? (
                <Button
                  onClick={handlePreview}
                  disabled={previewing || !hasSelection || !periodMonth}
                >
                  {previewing ? t("previewing") : t("preview")}
                </Button>
              ) : (
                <>
                  <Button variant="outline" onClick={() => setPreview(null)}>
                    {tCommon("back")}
                  </Button>
                  <Button
                    onClick={handleConfirm}
                    disabled={confirming || (preview.willInvoiceCount === 0 && !isEdit)}
                  >
                    {confirming
                      ? t("confirming")
                      : isEdit
                        ? t("confirmEdit")
                        : t("confirm", { count: preview.willInvoiceCount })}
                  </Button>
                </>
              )}
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
