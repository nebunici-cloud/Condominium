"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { SearchIcon } from "lucide-react";

import { Link } from "@/i18n/navigation";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { OwnerAccessCell, type OwnerAccessStatus } from "@/components/owner-access";

import { EditOwnerDialog } from "./edit-owner-dialog";

type OwnerRow = {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  personal_code: string | null;
  units: { id: string; label: string }[];
  status: OwnerAccessStatus;
};

export function OwnersTable({
  owners,
  canEdit,
  canInvite,
}: {
  owners: OwnerRow[];
  canEdit: boolean;
  canInvite: boolean;
}) {
  const t = useTranslations("owners");
  const [search, setSearch] = useState("");

  const filteredOwners = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return owners;
    return owners.filter((owner) =>
      [
        owner.full_name,
        owner.email,
        owner.phone,
        owner.personal_code,
        ...owner.units.map((unit) => unit.label),
      ]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(query))
    );
  }, [owners, search]);

  return (
    <div className="flex flex-col gap-4">
      <div className="relative max-w-sm">
        <SearchIcon className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("searchPlaceholder")}
          className="pl-8"
        />
      </div>

      {filteredOwners.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("noResults")}</p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("fullNameLabel")}</TableHead>
                <TableHead>{t("unitsColumn")}</TableHead>
                <TableHead>{t("emailLabel")}</TableHead>
                <TableHead>{t("phoneLabel")}</TableHead>
                <TableHead>{t("personalCodeLabel")}</TableHead>
                <TableHead>{t("accessColumn")}</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredOwners.map((owner) => (
                <TableRow key={owner.id}>
                  <TableCell className="font-medium">{owner.full_name}</TableCell>
                  <TableCell>
                    {owner.units.length === 0 ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      <div className="flex flex-col gap-0.5">
                        {owner.units.map((unit) => (
                          <Link
                            key={unit.id}
                            href={`/units/${unit.id}`}
                            className="text-sm underline-offset-2 hover:underline"
                          >
                            {unit.label}
                          </Link>
                        ))}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>{owner.email ?? "—"}</TableCell>
                  <TableCell>{owner.phone ?? "—"}</TableCell>
                  <TableCell>{owner.personal_code ?? "—"}</TableCell>
                  <TableCell>
                    <OwnerAccessCell
                      ownerId={owner.id}
                      email={owner.email}
                      status={owner.status}
                      canInvite={canInvite}
                    />
                  </TableCell>
                  <TableCell>
                    {canEdit && (
                      <EditOwnerDialog
                        ownerId={owner.id}
                        defaultValues={{
                          fullName: owner.full_name,
                          email: owner.email ?? "",
                          phone: owner.phone ?? "",
                          personalCode: owner.personal_code ?? "",
                        }}
                      />
                    )}
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
