import { getFormatter, getTranslations } from "next-intl/server";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatMoney } from "@/lib/format-money";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import type { UsageRecord } from "@/actions/usage";

import { UsageEmptyState } from "./usage-empty-state";

/** Status is a muted dot and a word; only a failure carries colour. */
const STATUS_VARIANT: Record<
  UsageRecord["status"],
  "success" | "warning" | "destructive" | "neutral"
> = {
  succeeded: "success",
  running: "warning",
  settling: "warning",
  failed: "destructive",
  refused: "neutral",
};

export async function UsageRecordsTable({
  records,
}: {
  records: UsageRecord[];
}) {
  const t = await getTranslations("usage");
  const format = await getFormatter();
  const empty = t("recordsTable.empty");

  if (records.length === 0) {
    return (
      <UsageEmptyState
        title={t("recordsTable.emptyTitle")}
        description={t("recordsTable.emptyDescription")}
      />
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("recordsTable.title")}</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("recordsTable.columns.started")}</TableHead>
              <TableHead>{t("recordsTable.columns.capability")}</TableHead>
              <TableHead className="hidden md:table-cell">
                {t("recordsTable.columns.model")}
              </TableHead>
              <TableHead>{t("recordsTable.columns.status")}</TableHead>
              <TableHead className="hidden text-right sm:table-cell">
                {t("recordsTable.columns.tokens")}
              </TableHead>
              <TableHead className="text-right">
                {t("recordsTable.columns.chargedAmount")}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {records.map((record) => (
              <TableRow key={record.id}>
                <TableCell className="whitespace-nowrap text-muted-foreground">
                  {format.dateTime(new Date(record.startedAt), {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </TableCell>
                <TableCell>
                  {record.capability}
                  {/* The model column is hidden on small screens, so
                      the primary cell carries it there. */}
                  <span className="block truncate text-xs text-muted-foreground md:hidden">
                    {record.model ?? empty}
                  </span>
                </TableCell>
                <TableCell className="hidden md:table-cell">
                  {record.model ?? empty}
                </TableCell>
                <TableCell>
                  <StatusBadge status={STATUS_VARIANT[record.status]} dot>
                    {t(`recordsTable.status.${record.status}`)}
                  </StatusBadge>
                </TableCell>
                <TableCell className="hidden text-right sm:table-cell">
                  {record.totalTokens !== null
                    ? format.number(record.totalTokens)
                    : empty}
                </TableCell>
                <TableCell className="text-right">
                  {record.charged ? formatMoney(format, record.charged) : empty}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
