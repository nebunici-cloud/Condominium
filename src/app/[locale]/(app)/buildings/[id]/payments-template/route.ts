import ExcelJS from "exceljs";
import { getTranslations } from "next-intl/server";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ locale: string; id: string }> }
) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "payments" });
  const tUnits = await getTranslations({ locale, namespace: "units" });

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(t("title"));

  sheet.columns = [
    { header: tUnits("unitNumberLabel"), key: "unit_number", width: 16 },
    { header: t("amountLabel"), key: "amount", width: 14 },
    { header: t("paidAtLabel"), key: "paid_at", width: 16 },
    { header: t("methodLabel"), key: "method", width: 20 },
    { header: t("referenceLabel"), key: "reference", width: 20 },
  ];
  sheet.getRow(1).font = { bold: true };

  sheet.addRow({
    unit_number: "12",
    amount: 250,
    paid_at: "2026-02-05",
    method: "transfer bancar",
    reference: "OP123456",
  });

  const buffer = await workbook.xlsx.writeBuffer();

  return new Response(buffer, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="payments-template.xlsx"',
    },
  });
}
