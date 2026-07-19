"use client";

import { Fragment, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Checkbox } from "@/components/ui/checkbox";
import { capabilityLabelKey } from "@/lib/permission-groups";

import { toggleAssociationCapability } from "./actions";

type MatrixRow = { code: string; grantedRoleIds: string[] };
type MatrixGroup = { group: string; rows: MatrixRow[] };
type RoleColumn = { id: string; label: string };

// All roles' permissions for one association in a single grid:
// capabilities as rows (grouped by domain), roles as columns, one
// checkbox per intersection. Toggles write through immediately
// (optimistic, reverted on error) -- no save button.
export function PermissionsMatrix({
  tenantId,
  associationId,
  roles,
  groups,
}: {
  tenantId: string;
  // null = the organization-wide grants (association_id null).
  associationId: string | null;
  roles: RoleColumn[];
  groups: MatrixGroup[];
}) {
  const t = useTranslations("permissions");
  const [granted, setGranted] = useState<Set<string>>(
    () =>
      new Set(
        groups.flatMap((group) =>
          group.rows.flatMap((row) => row.grantedRoleIds.map((roleId) => `${roleId}|${row.code}`))
        )
      )
  );
  const [pendingKey, setPendingKey] = useState<string | null>(null);

  function setCell(key: string, checked: boolean) {
    setGranted((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.add(key);
      } else {
        next.delete(key);
      }
      return next;
    });
  }

  async function handleToggle(roleId: string, code: string, nextChecked: boolean) {
    const key = `${roleId}|${code}`;
    setPendingKey(key);
    setCell(key, nextChecked);

    const result = await toggleAssociationCapability({
      roleId,
      tenantId,
      associationId,
      capabilityCode: code,
      grant: nextChecked,
    });

    setPendingKey(null);

    if (result.error) {
      toast.error(result.error);
      setCell(key, !nextChecked);
    }
  }

  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full min-w-[640px] border-collapse text-sm">
        <thead>
          <tr className="border-b bg-muted/40">
            <th className="sticky left-0 bg-muted/40 p-3 text-left font-medium backdrop-blur">
              {t("actionColumn")}
            </th>
            {roles.map((role) => (
              <th key={role.id} className="p-3 text-center font-medium whitespace-nowrap">
                {role.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {groups.map((group) => (
            <Fragment key={group.group}>
              <tr className="border-b bg-muted/20">
                <td
                  colSpan={roles.length + 1}
                  className="sticky left-0 p-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide"
                >
                  {t(`group_${group.group}`)}
                </td>
              </tr>
              {group.rows.map((row) => (
                <tr key={row.code} className="border-b last:border-b-0 hover:bg-accent/40">
                  <td className="sticky left-0 bg-background p-3">
                    {t(capabilityLabelKey(row.code))}
                  </td>
                  {roles.map((role) => {
                    const key = `${role.id}|${row.code}`;
                    return (
                      <td key={role.id} className="p-3 text-center">
                        <Checkbox
                          aria-label={`${role.label}: ${t(capabilityLabelKey(row.code))}`}
                          checked={granted.has(key)}
                          disabled={pendingKey === key}
                          onCheckedChange={(checked) =>
                            handleToggle(role.id, row.code, checked === true)
                          }
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
