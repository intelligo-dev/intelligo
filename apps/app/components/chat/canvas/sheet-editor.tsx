"use client";

/**
 * The canvas's spreadsheet: a CSV document on react-data-grid. The
 * grid is padded to a working size so an empty sheet still looks like
 * one; every edit is serialised back to CSV for `onChange`.
 *
 * Loaded lazily by `lib/chat-canvas-config.tsx`.
 */

import { useEffect, useMemo, useState } from "react";
import { parse, unparse } from "papaparse";
import { DataGrid, renderTextEditor, type Column } from "react-data-grid";
import { useTheme } from "next-themes";

import "react-data-grid/lib/styles.css";

import type { CanvasContentProps } from "@/lib/chat-canvas-config";

const MIN_ROWS = 40;
const MIN_COLS = 16;

type Row = { id: number; [column: string]: string | number };

function toRows(content: string): string[][] {
  const parsed = content
    ? parse<string[]>(content, { skipEmptyLines: true }).data
    : [];
  const width = Math.max(MIN_COLS, ...parsed.map((row) => row.length));
  const rows = parsed.map((row) => {
    const padded = [...row];
    while (padded.length < width) padded.push("");
    return padded;
  });
  while (rows.length < MIN_ROWS) rows.push(new Array<string>(width).fill(""));
  return rows;
}

function columnName(index: number): string {
  let name = "";
  let n = index;
  do {
    name = String.fromCharCode(65 + (n % 26)) + name;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return name;
}

export default function SheetEditor({
  content,
  isReadonly,
  onChange,
}: CanvasContentProps) {
  const { resolvedTheme } = useTheme();
  const cells = useMemo(() => toRows(content), [content]);
  const width = cells[0]?.length ?? MIN_COLS;

  const columns = useMemo<Column<Row>[]>(() => {
    const rowNumber: Column<Row> = {
      key: "rowNumber",
      name: "",
      frozen: true,
      width: 48,
      renderCell: ({ rowIdx }) => rowIdx + 1,
      cellClass: "bg-muted text-muted-foreground",
      headerCellClass: "bg-muted",
    };
    const data = Array.from({ length: width }, (_, index): Column<Row> => ({
      key: String(index),
      name: columnName(index),
      width: 120,
      resizable: true,
      renderEditCell: isReadonly ? undefined : renderTextEditor,
      headerCellClass: "bg-muted",
    }));
    return [rowNumber, ...data];
  }, [width, isReadonly]);

  const initialRows = useMemo<Row[]>(
    () =>
      cells.map((row, rowIndex) => {
        const record: Row = { id: rowIndex };
        row.forEach((cell: string, columnIndex: number) => {
          record[String(columnIndex)] = cell;
        });
        return record;
      }),
    [cells]
  );

  const [rows, setRows] = useState<Row[]>(initialRows);
  useEffect(() => setRows(initialRows), [initialRows]);

  function handleRowsChange(next: Row[]) {
    setRows(next);
    const table = next.map((row) =>
      Array.from({ length: width }, (_, index) => String(row[String(index)] ?? ""))
    );
    // Trailing empty rows and columns are padding, not content.
    while (table.length && table[table.length - 1]!.every((cell) => !cell)) {
      table.pop();
    }
    onChange?.(unparse(table));
  }

  return (
    <DataGrid
      className={resolvedTheme === "dark" ? "rdg-dark h-full" : "rdg-light h-full"}
      columns={columns}
      rows={rows}
      rowKeyGetter={(row) => row.id}
      onRowsChange={isReadonly ? undefined : handleRowsChange}
      defaultColumnOptions={{ resizable: true }}
    />
  );
}
