"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { SearchIcon } from "lucide-react";

import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { EditOwnerDialog } from "./edit-owner-dialog";

type Owner = {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
};

export function OwnersTable({ owners }: { owners: Owner[] }) {
  const t = useTranslations("owners");
  const [search, setSearch] = useState("");

  const filteredOwners = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return owners;
    return owners.filter((owner) =>
      [owner.full_name, owner.email, owner.phone]
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
                <TableHead>{t("emailLabel")}</TableHead>
                <TableHead>{t("phoneLabel")}</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredOwners.map((owner) => (
                <TableRow key={owner.id}>
                  <TableCell className="font-medium">{owner.full_name}</TableCell>
                  <TableCell>{owner.email ?? "—"}</TableCell>
                  <TableCell>{owner.phone ?? "—"}</TableCell>
                  <TableCell>
                    <EditOwnerDialog
                      ownerId={owner.id}
                      defaultValues={{
                        fullName: owner.full_name,
                        email: owner.email ?? "",
                        phone: owner.phone ?? "",
                      }}
                    />
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
