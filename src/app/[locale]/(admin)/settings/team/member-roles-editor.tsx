"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronDownIcon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuCheckboxItem,
} from "@/components/ui/dropdown-menu";

import { setMemberRole } from "./actions";

type RoleOption = { id: string; label: string };

// Per-member role picker: a checklist of every role, so one member can
// hold several at once (accountant + owner) and any role can be
// withdrawn again. Stays open across toggles; optimistic with revert.
export function MemberRolesEditor({
  tenantId,
  userId,
  roles,
  assignedRoleIds,
}: {
  tenantId: string;
  userId: string;
  roles: RoleOption[];
  assignedRoleIds: string[];
}) {
  const t = useTranslations("roles");
  const [assigned, setAssigned] = useState<Set<string>>(() => new Set(assignedRoleIds));
  const [pendingId, setPendingId] = useState<string | null>(null);

  function setRole(roleId: string, checked: boolean) {
    setAssigned((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.add(roleId);
      } else {
        next.delete(roleId);
      }
      return next;
    });
  }

  async function handleToggle(roleId: string, nextChecked: boolean) {
    setPendingId(roleId);
    setRole(roleId, nextChecked);

    const result = await setMemberRole({ tenantId, userId, roleId, grant: nextChecked });

    setPendingId(null);

    if (result.error) {
      setRole(roleId, !nextChecked);
      toast.error(
        result.error === "self_manager_role" ? t("cannotRemoveOwnManagerRole") : result.error
      );
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm">
          {t("editRoles")}
          <ChevronDownIcon className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>{t("editRoles")}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {roles.map((role) => (
          <DropdownMenuCheckboxItem
            key={role.id}
            checked={assigned.has(role.id)}
            disabled={pendingId === role.id}
            onCheckedChange={(checked) => handleToggle(role.id, checked === true)}
            onSelect={(event) => event.preventDefault()}
          >
            {role.label}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
