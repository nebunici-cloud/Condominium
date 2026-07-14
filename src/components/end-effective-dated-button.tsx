"use client";

import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function EndEffectiveDatedButton({
  id,
  action,
  triggerLabel,
  confirmTitle,
  confirmDescription,
  successMessage,
  cancelLabel,
  confirmLabel,
  confirmVariant = "destructive",
}: {
  id: string;
  action: (id: string) => Promise<{ error: string | null }>;
  triggerLabel: string;
  confirmTitle: string;
  confirmDescription: string;
  successMessage: string;
  cancelLabel: string;
  confirmLabel: string;
  // Most uses of this button end something (ownership, an invoice);
  // publish is the one forward/positive action that reuses the same
  // id+action+confirm-dialog shape, so it needs non-destructive styling.
  confirmVariant?: "destructive" | "default";
}) {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleConfirm() {
    setSubmitting(true);
    const result = await action(id);
    setSubmitting(false);

    if (result.error) {
      toast.error(result.error);
      return;
    }

    toast.success(successMessage);
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost">
          {triggerLabel}
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
