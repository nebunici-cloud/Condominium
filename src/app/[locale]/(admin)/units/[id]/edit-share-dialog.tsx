"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { PencilIcon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

import { updateOwnershipShare } from "./actions";

// Pencil next to a current ownership's share: fix the percentage in
// place (the buy-out case -- the remaining owner goes to 100%).
export function EditShareDialog({
  ownershipId,
  ownerName,
  sharePercent,
}: {
  ownershipId: string;
  ownerName: string;
  sharePercent: number;
}) {
  const t = useTranslations("ownerships");
  const tCommon = useTranslations("common");
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(sharePercent.toString());
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    const parsed = Number(value.replace(",", "."));
    if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 100) {
      toast.error(t("shareInvalid"));
      return;
    }

    setSaving(true);
    const result = await updateOwnershipShare({ ownershipId, sharePercent: parsed });
    setSaving(false);

    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success(t("shareUpdateSuccess"));
    setOpen(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setValue(sharePercent.toString());
      }}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <DialogTrigger asChild>
            <Button size="icon" variant="ghost" aria-label={t("editShare")}>
              <PencilIcon className="size-4" />
            </Button>
          </DialogTrigger>
        </TooltipTrigger>
        <TooltipContent>{t("editShare")}</TooltipContent>
      </Tooltip>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("editShare")}</DialogTitle>
          <DialogDescription>{ownerName}</DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2">
          <Input
            type="number"
            min={0.001}
            max={100}
            step="0.001"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            className="max-w-32"
          />
          <span className="text-sm text-muted-foreground">%</span>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            {tCommon("cancel")}
          </Button>
          <Button disabled={saving} onClick={handleSave}>
            {tCommon("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
