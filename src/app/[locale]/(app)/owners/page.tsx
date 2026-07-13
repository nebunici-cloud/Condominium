import { getTranslations } from "next-intl/server";

import { createClient } from "@/lib/supabase/server";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { NewOwnerDialog } from "./new-owner-dialog";
import { EditOwnerDialog } from "./edit-owner-dialog";

export default async function OwnersPage() {
  const t = await getTranslations("owners");
  const supabase = await createClient();

  const { data: owners } = await supabase
    .from("owners")
    .select("id, full_name, email, phone, created_at")
    .order("created_at", { ascending: false });

  return (
    <main className="mx-auto max-w-4xl p-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        <NewOwnerDialog />
      </div>

      {!owners || owners.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("noOwners")}</p>
      ) : (
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
            {owners.map((owner) => (
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
      )}
    </main>
  );
}
