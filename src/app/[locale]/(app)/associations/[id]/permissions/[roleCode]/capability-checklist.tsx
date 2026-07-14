"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Checkbox } from "@/components/ui/checkbox";
import { capabilityLabelKey } from "@/lib/permission-groups";

import { toggleAssociationCapability } from "../actions";

type CapabilityRow = { code: string; checked: boolean };
type CapabilityGroup = { group: string; items: CapabilityRow[] };

export function CapabilityChecklist({
  roleId,
  tenantId,
  associationId,
  groups,
}: {
  roleId: string;
  tenantId: string;
  associationId: string;
  groups: CapabilityGroup[];
}) {
  const t = useTranslations("permissions");
  const [state, setState] = useState(groups);
  const [pendingCode, setPendingCode] = useState<string | null>(null);

  function setChecked(code: string, checked: boolean) {
    setState((prev) =>
      prev.map((group) => ({
        ...group,
        items: group.items.map((item) => (item.code === code ? { ...item, checked } : item)),
      }))
    );
  }

  async function handleToggle(code: string, nextChecked: boolean) {
    setPendingCode(code);
    setChecked(code, nextChecked);

    const result = await toggleAssociationCapability({
      roleId,
      tenantId,
      associationId,
      capabilityCode: code,
      grant: nextChecked,
    });

    setPendingCode(null);

    if (result.error) {
      toast.error(result.error);
      setChecked(code, !nextChecked);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {state.map((group) => (
        <div key={group.group}>
          <h3 className="mb-2 text-sm font-semibold text-muted-foreground">
            {t(`group_${group.group}`)}
          </h3>
          <div className="flex flex-col gap-3 rounded-md border p-4">
            {group.items.map((item) => (
              <label key={item.code} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={item.checked}
                  disabled={pendingCode === item.code}
                  onCheckedChange={(checked) => handleToggle(item.code, checked === true)}
                />
                {t(capabilityLabelKey(item.code))}
              </label>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
