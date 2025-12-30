import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import * as XLSX from "xlsx";

const OUTPUT_RELATIVE_PATH = "data/example.xlsx";
const SHEET_NAME = "Sheet1";

type Row = [
  id: number,
  name: string,
  email: string,
  region: string,
  salesAmount: number,
  commission: number,
];

function buildDataset(): { header: string[]; rows: Row[] } {
  const header = ["ID", "Name", "Email", "Region", "SalesAmount", "Commission"];
  const rows: Row[] = [
    [1, "Ava Chen", "ava.chen@example.com", "North", 12_000, 0],
    [2, "Mateo Rivera", "mateo.rivera@example.com", "South", 8_500, 0],
    [3, "Priya Singh", "priya.singh@example.com", "West", 16_200, 0],
    [4, "Noah Johnson", "noah.johnson@example.com", "East", 5_750, 0],
    [5, "Sophia Müller", "sophia.mueller@example.com", "EMEA", 22_400, 0],
    [6, "Liam O'Connor", "liam.oconnor@example.com", "APAC", 14_900, 0],
    [7, "Isabella Rossi", "isabella.rossi@example.com", "EMEA", 9_300, 0],
    [8, "Ethan Brown", "ethan.brown@example.com", "North", 11_100, 0],
    [9, "Mia Davis", "mia.davis@example.com", "South", 6_800, 0],
    [10, "Lucas Martin", "lucas.martin@example.com", "West", 19_050, 0],
    [11, "Zoe Patel", "zoe.patel@example.com", "East", 7_250, 0],
    [12, "Hana Nakamura", "hana.nakamura@example.com", "APAC", 13_600, 0],
  ];

  return { header, rows };
}

function resolveOutputPath(): string {
  const resolved = path.resolve(process.cwd(), OUTPUT_RELATIVE_PATH);
  mkdirSync(path.dirname(resolved), { recursive: true });
  return resolved;
}

function setCommissionFormulaCells(sheet: XLSX.WorkSheet, rows: Row[]): void {
  for (let index = 0; index < rows.length; index++) {
    const excelRow = index + 2;
    const salesAmount = rows[index][4];
    const commissionValue = Number((salesAmount * 0.1).toFixed(2));
    const formula = `E${excelRow}*0.1`;
    const address = `F${excelRow}`;

    sheet[address] = {
      t: "n",
      f: formula,
      v: commissionValue,
    };

    rows[index][5] = commissionValue;
  }
}

function main(): void {
  const { header, rows } = buildDataset();
  const aoa = [header, ...rows];

  const sheet = XLSX.utils.aoa_to_sheet(aoa);
  setCommissionFormulaCells(sheet, rows);

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, SHEET_NAME);

  const buffer = XLSX.write(workbook, {
    type: "buffer",
    bookType: "xlsx",
  }) as unknown;

  if (!(buffer instanceof Uint8Array)) {
    throw new Error("XLSX.write did not return a binary buffer.");
  }

  const outputPath = resolveOutputPath();
  writeFileSync(outputPath, buffer);

  process.stdout.write(
    `Generated ${OUTPUT_RELATIVE_PATH} (${buffer.byteLength} bytes).\n`
  );
}

main();
