import { useState } from "react";
import { ArrowDown, ArrowUp, Check, ChevronDown, ExternalLink, Image, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import type { DynamicTableSection } from "@shared/schema";

interface DynamicTableProps {
  data: DynamicTableSection;
}

type TableVariant = "default" | "striped" | "cards" | "comparison";

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split(".");
  let current: unknown = obj;
  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function formatValue(val: unknown): string {
  if (val === null || val === undefined) return "";
  const str = String(val);
  if (/^\d{4}-\d{2}-\d{2}(T|\s)/.test(str)) {
    try {
      return new Date(str).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    } catch {
      /* fall through */
    }
  }
  return str;
}

function resolveTemplate(template: string, row: Record<string, unknown>): string {
  return template.replace(/\{([^}]+)\}/g, (_, key) => {
    const val = getNestedValue(row, key.trim());
    return formatValue(val);
  });
}

function getCellValue(row: Record<string, unknown>, col: { key: string }): unknown {
  return getNestedValue(row, col.key);
}

function CellValue({ value, type }: { value: unknown; type: string }) {
  if (value === null || value === undefined) {
    return <span className="text-muted-foreground">-</span>;
  }

  switch (type) {
    case "image":
      return (
        <div className="flex items-center justify-center">
          {typeof value === "string" && value ? (
            <img src={value} alt="" className="w-8 h-8 rounded object-cover" loading="lazy" />
          ) : (
            <Image className="w-5 h-5 text-muted-foreground" />
          )}
        </div>
      );
    case "link":
      return typeof value === "string" && value ? (
        <a
          href={value}
          target="_blank"
          rel="noopener noreferrer"
          className="text-foreground underline inline-flex items-center gap-1 text-sm"
        >
          Link
          <ExternalLink className="w-3 h-3" />
        </a>
      ) : (
        <span className="text-muted-foreground">-</span>
      );
    case "boolean":
      return value ? (
        <Check className="w-4 h-4 text-green-600" />
      ) : (
        <X className="w-4 h-4 text-muted-foreground" />
      );
    case "number":
      return <span className="tabular-nums">{String(value)}</span>;
    case "date": {
      const raw = String(value).trim();
      if (!raw) return <span className="text-muted-foreground">-</span>;
      const d = new Date(raw);
      if (isNaN(d.getTime())) return <span className="text-muted-foreground">-</span>;
      return <span>{d.toLocaleDateString()}</span>;
    }
    default: {
      const str = String(value).trim();
      if (!str) return <span className="text-muted-foreground">-</span>;
      return <span className="whitespace-pre-line line-clamp-3">{str}</span>;
    }
  }
}

function SortIcon({
  sortKey,
  sortDir,
  colKey,
}: {
  sortKey: string | null;
  sortDir: "asc" | "desc";
  colKey: string;
}) {
  if (sortKey !== colKey) return null;
  return sortDir === "asc" ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />;
}

function EmptyCell({
  columns,
  action,
  emptyText,
  className,
}: {
  columns: DynamicTableSection["columns"];
  action?: DynamicTableSection["action"];
  emptyText: string;
  className?: string;
}) {
  return (
    <td
      colSpan={columns.length + (action ? 1 : 0)}
      className={className ?? "px-4 py-8 text-center text-muted-foreground"}
      data-testid="text-dynamic-table-empty"
    >
      {emptyText}
    </td>
  );
}

function TableHeader({
  columns,
  action,
  sortKey,
  sortDir,
  onSort,
  variant,
}: {
  columns: DynamicTableSection["columns"];
  action?: DynamicTableSection["action"];
  sortKey: string | null;
  sortDir: "asc" | "desc";
  onSort: (key: string) => void;
  variant: TableVariant;
}) {
  const headerClass = variant === "striped" ? "bg-primary text-primary-foreground" : "bg-muted/50";

  return (
    <thead>
      <tr className={`${headerClass} border-b`}>
        {columns.map((col) => (
          <th
            key={col.key}
            className={`px-4 py-3 text-left font-semibold cursor-pointer select-none ${
              variant === "striped" ? "text-primary-foreground" : "text-foreground"
            }`}
            onClick={() => onSort(col.key)}
            data-testid={`th-${col.key}`}
          >
            <div className="flex items-center gap-1">
              {col.label}
              <SortIcon sortKey={sortKey} sortDir={sortDir} colKey={col.key} />
            </div>
          </th>
        ))}
        {action && (
          <th
            className={`px-4 py-3 text-left font-semibold ${
              variant === "striped" ? "text-primary-foreground" : "text-foreground"
            }`}
            data-testid="th-action"
          >
            {action.label}
          </th>
        )}
      </tr>
    </thead>
  );
}

function DefaultTableBody({
  rows,
  columns,
  action,
  variant,
  emptyText,
}: {
  rows: Record<string, unknown>[];
  columns: DynamicTableSection["columns"];
  action?: DynamicTableSection["action"];
  variant: TableVariant;
  emptyText: string;
}) {
  if (rows.length === 0) {
    return (
      <tbody>
        <tr>
          <EmptyCell columns={columns} action={action} emptyText={emptyText} />
        </tr>
      </tbody>
    );
  }

  return (
    <tbody>
      {rows.map((row, idx) => (
        <tr
          key={idx}
          className={`border-b last:border-0 hover-elevate ${
            variant === "striped" && idx % 2 === 1 ? "bg-muted/30" : ""
          }`}
          data-testid={`row-${idx}`}
        >
          {columns.map((col) => (
            <td key={col.key} className="px-4 py-3 text-foreground" data-testid={`cell-${col.key}-${idx}`}>
              <CellValue value={getCellValue(row, col)} type={col.type} />
            </td>
          ))}
          {action && (
            <td className="px-4 py-3">
              <Button variant="outline" size="sm" asChild data-testid={`button-action-${idx}`}>
                <a href={resolveTemplate(action.href, row)}>
                  {action.label}
                  <ExternalLink className="w-3 h-3 ml-1" />
                </a>
              </Button>
            </td>
          )}
        </tr>
      ))}
    </tbody>
  );
}

function CardsLayout({
  rows,
  columns,
  action,
  sortKey,
  sortDir,
  onSort,
  emptyText,
}: {
  rows: Record<string, unknown>[];
  columns: DynamicTableSection["columns"];
  action?: DynamicTableSection["action"];
  sortKey: string | null;
  sortDir: "asc" | "desc";
  onSort: (key: string) => void;
  emptyText: string;
}) {
  return (
    <>
      <div className="hidden md:block overflow-x-auto rounded-[0.8rem] border">
        <table className="w-full text-sm" data-testid="dynamic-table">
          <TableHeader
            columns={columns}
            action={action}
            sortKey={sortKey}
            sortDir={sortDir}
            onSort={onSort}
            variant="cards"
          />
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <EmptyCell columns={columns} action={action} emptyText={emptyText} />
              </tr>
            ) : (
              rows.map((row, idx) => (
                <tr key={idx} className="border-b last:border-0 hover-elevate" data-testid={`row-${idx}`}>
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className="px-4 py-3 text-foreground"
                      data-testid={`cell-${col.key}-${idx}`}
                    >
                      <CellValue value={getCellValue(row, col)} type={col.type} />
                    </td>
                  ))}
                  {action && (
                    <td className="px-4 py-3">
                      <Button variant="outline" size="sm" asChild data-testid={`button-action-${idx}`}>
                        <a href={resolveTemplate(action.href, row)}>
                          {action.label}
                          <ExternalLink className="w-3 h-3 ml-1" />
                        </a>
                      </Button>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="md:hidden flex flex-col gap-3" data-testid="dynamic-table-cards">
        {rows.length === 0 ? (
          <div
            className="text-center text-muted-foreground py-8 text-sm"
            data-testid="text-dynamic-table-empty"
          >
            {emptyText}
          </div>
        ) : (
          rows.map((row, idx) => (
            <div
              key={idx}
              className="rounded-[0.8rem] border bg-card p-4 space-y-2"
              data-testid={`card-${idx}`}
            >
              {columns.map((col, colIdx) => {
                const val = getCellValue(row, col);
                return (
                  <div
                    key={col.key}
                    className={`flex items-start justify-between gap-2 ${colIdx === 0 ? "" : "pt-1"}`}
                  >
                    <span className="text-xs font-medium text-muted-foreground shrink-0 uppercase tracking-wide">
                      {col.label}
                    </span>
                    <span className="text-sm text-foreground text-right">
                      <CellValue value={val} type={col.type} />
                    </span>
                  </div>
                );
              })}
              {action && (
                <div className="pt-2 border-t">
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    asChild
                    data-testid={`button-action-${idx}`}
                  >
                    <a href={resolveTemplate(action.href, row)}>
                      {action.label}
                      <ExternalLink className="w-3 h-3 ml-1" />
                    </a>
                  </Button>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      <div className="md:hidden flex flex-wrap gap-2 mt-3">
        {columns.map((col) => (
          <Button
            key={col.key}
            variant={sortKey === col.key ? "secondary" : "ghost"}
            size="sm"
            onClick={() => onSort(col.key)}
            data-testid={`sort-btn-${col.key}`}
          >
            {col.label}
            <SortIcon sortKey={sortKey} sortDir={sortDir} colKey={col.key} />
          </Button>
        ))}
      </div>
    </>
  );
}

function ComparisonLayout({
  rows,
  columns,
  action,
  sortKey,
  sortDir,
  onSort,
  emptyText,
}: {
  rows: Record<string, unknown>[];
  columns: DynamicTableSection["columns"];
  action?: DynamicTableSection["action"];
  sortKey: string | null;
  sortDir: "asc" | "desc";
  onSort: (key: string) => void;
  emptyText: string;
}) {
  const colCount = columns.length + (action ? 1 : 0);

  return (
    <>
      <div className="hidden md:block overflow-x-auto">
        <div
          className="rounded-xl overflow-hidden shadow-lg ring-1 ring-black/5"
          style={{ minWidth: `${colCount * 160}px` }}
          data-testid="dynamic-table"
        >
          <div
            className="grid"
            style={{ gridTemplateColumns: `repeat(${colCount}, minmax(0, 1fr))` }}
          >
            {columns.map((col, colIdx) => (
              <div
                key={col.key}
                className={`py-5 px-6 font-semibold text-sm cursor-pointer select-none bg-primary text-primary-foreground text-center ${
                  colIdx < colCount - 1 ? "border-r border-primary-foreground/20" : ""
                }`}
                onClick={() => onSort(col.key)}
                data-testid={`th-${col.key}`}
              >
                <div className="flex items-center gap-1 justify-center">
                  {col.label}
                  <SortIcon sortKey={sortKey} sortDir={sortDir} colKey={col.key} />
                </div>
              </div>
            ))}
            {action && (
              <div
                className="py-5 px-6 font-semibold text-sm bg-primary text-primary-foreground text-center"
                data-testid="th-action"
              >
                {action.label}
              </div>
            )}
          </div>

          {rows.length === 0 ? (
            <div
              className="py-8 text-center text-muted-foreground text-sm"
              data-testid="text-dynamic-table-empty"
            >
              {emptyText}
            </div>
          ) : (
            rows.map((row, idx) => (
              <div
                key={idx}
                className="grid transition-colors"
                style={{ gridTemplateColumns: `repeat(${colCount}, minmax(0, 1fr))` }}
                data-testid={`row-${idx}`}
              >
                {columns.map((col, colIdx) => {
                  const rowBg = idx % 2 === 0 ? "bg-card" : "bg-primary/5";
                  return (
                    <div
                      key={col.key}
                      className={`py-4 px-6 text-sm flex items-center text-center justify-center ${rowBg} text-foreground ${
                        colIdx < colCount - 1 ? "border-r border-border/50" : ""
                      }`}
                      data-testid={`cell-${col.key}-${idx}`}
                    >
                      <CellValue value={getCellValue(row, col)} type={col.type} />
                    </div>
                  );
                })}
                {action && (
                  <div
                    className={`py-4 px-6 flex items-center justify-center ${
                      idx % 2 === 0 ? "bg-card" : "bg-primary/5"
                    }`}
                  >
                    <Button variant="outline" size="sm" asChild data-testid={`button-action-${idx}`}>
                      <a href={resolveTemplate(action.href, row)}>
                        {action.label}
                        <ExternalLink className="w-3 h-3 ml-1" />
                      </a>
                    </Button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      <div className="md:hidden">
        <Accordion type="single" collapsible className="flex flex-col gap-2">
          {rows.length === 0 ? (
            <div
              className="text-center text-muted-foreground py-8 text-sm"
              data-testid="text-dynamic-table-empty"
            >
              {emptyText}
            </div>
          ) : (
            rows.map((row, idx) => {
              const firstVal = getCellValue(row, columns[0]);
              const firstLabel = firstVal != null ? String(firstVal) : `Row ${idx + 1}`;

              return (
                <AccordionItem
                  key={idx}
                  value={`row-${idx}`}
                  className="rounded-[0.8rem] shadow-sm px-5 [&]:border-0 bg-card transition-colors duration-200 data-[state=open]:bg-primary/5 data-[state=open]:shadow-md"
                  data-testid={`accordion-row-${idx}`}
                >
                  <AccordionTrigger className="hover:no-underline py-4 min-h-[48px] [&>svg]:w-5 [&>svg]:h-5">
                    <span className="font-semibold text-foreground text-sm whitespace-pre-line">
                      {firstLabel}
                    </span>
                  </AccordionTrigger>
                  <AccordionContent className="pt-3 pb-5">
                    <div className="flex flex-col gap-2">
                      {columns.slice(1).map((col) => {
                        const val = getCellValue(row, col);
                        return (
                          <div key={col.key} className="rounded-[0.8rem] p-3 bg-muted/30">
                            <p className="text-xs font-semibold mb-0.5 text-muted-foreground uppercase tracking-wide">
                              {col.label}
                            </p>
                            <p className="text-sm text-foreground">
                              <CellValue value={val} type={col.type} />
                            </p>
                          </div>
                        );
                      })}
                      {action && (
                        <div className="pt-2">
                          <Button
                            variant="outline"
                            size="sm"
                            className="w-full"
                            asChild
                            data-testid={`button-action-${idx}`}
                          >
                            <a href={resolveTemplate(action.href, row)}>
                              {action.label}
                              <ExternalLink className="w-3 h-3 ml-1" />
                            </a>
                          </Button>
                        </div>
                      )}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              );
            })
          )}
        </Accordion>
      </div>
    </>
  );
}

function TableFooter({
  maxRows,
  expanded,
  setExpanded,
  rowCount,
  totalCount,
  hasMore,
}: {
  maxRows: number | null;
  expanded: boolean;
  setExpanded: (v: boolean) => void;
  rowCount: number;
  totalCount: number;
  hasMore: boolean;
}) {
  return (
    <div className="flex items-center justify-between mt-3">
      <p className="text-xs text-muted-foreground" data-testid="text-row-count">
        {maxRows && !expanded
          ? `${rowCount} of ${totalCount} rows`
          : `${totalCount} ${totalCount === 1 ? "row" : "rows"}`}
      </p>
      {hasMore && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setExpanded(!expanded)}
          data-testid="button-toggle-rows"
        >
          {expanded ? "Show less" : `Show all ${totalCount}`}
          <ChevronDown
            className={`w-4 h-4 ml-1 transition-transform ${expanded ? "rotate-180" : ""}`}
          />
        </Button>
      )}
    </div>
  );
}

export function DynamicTable({ data }: DynamicTableProps) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [expanded, setExpanded] = useState(false);
  const variant: TableVariant = (data.variant as TableVariant) || "default";
  const emptyText = data.empty_text?.trim() || "No data available";

  const allRows: Record<string, unknown>[] = (() => {
    let rows = Array.isArray(data.items) ? [...(data.items as Record<string, unknown>[])] : [];
    if (sortKey) {
      rows = [...rows].sort((a, b) => {
        const aVal = getNestedValue(a, sortKey);
        const bVal = getNestedValue(b, sortKey);
        if (aVal == null && bVal == null) return 0;
        if (aVal == null) return 1;
        if (bVal == null) return -1;
        if (typeof aVal === "number" && typeof bVal === "number") {
          return sortDir === "asc" ? aVal - bVal : bVal - aVal;
        }
        const cmp = String(aVal).localeCompare(String(bVal));
        return sortDir === "asc" ? cmp : -cmp;
      });
    }
    return rows;
  })();

  const maxRows = data.max_rows && data.max_rows > 0 ? data.max_rows : null;
  const hasMore = maxRows !== null && allRows.length > maxRows;
  const rows = maxRows && !expanded ? allRows.slice(0, maxRows) : allRows;

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const bgStyle: React.CSSProperties = {};
  if (data.background) {
    if (
      data.background.startsWith("linear-gradient") ||
      data.background.startsWith("radial-gradient")
    ) {
      bgStyle.backgroundImage = data.background;
    } else {
      bgStyle.backgroundColor = data.background;
    }
  }

  return (
    <section className="py-12" style={bgStyle} data-testid="section-dynamic-table">
      <div className="max-w-7xl mx-auto px-4 md:px-6">
        {(data.title || data.subtitle) && (
          <div className="mb-6">
            {data.title && (
              <h2 className="text-h2 text-foreground" data-testid="text-dynamic-table-title">
                {data.title}
              </h2>
            )}
            {data.subtitle && (
              <p
                className="text-body text-muted-foreground mt-1"
                data-testid="text-dynamic-table-subtitle"
              >
                {data.subtitle}
              </p>
            )}
          </div>
        )}

        {variant === "cards" ? (
          <CardsLayout
            rows={rows}
            columns={data.columns}
            action={data.action}
            sortKey={sortKey}
            sortDir={sortDir}
            onSort={handleSort}
            emptyText={emptyText}
          />
        ) : variant === "comparison" ? (
          <ComparisonLayout
            rows={rows}
            columns={data.columns}
            action={data.action}
            sortKey={sortKey}
            sortDir={sortDir}
            onSort={handleSort}
            emptyText={emptyText}
          />
        ) : (
          <div className="overflow-x-auto rounded-[0.8rem] border">
            <table className="w-full text-sm" data-testid="dynamic-table">
              <TableHeader
                columns={data.columns}
                action={data.action}
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={handleSort}
                variant={variant}
              />
              <DefaultTableBody
                rows={rows}
                columns={data.columns}
                action={data.action}
                variant={variant}
                emptyText={emptyText}
              />
            </table>
          </div>
        )}

        <TableFooter
          maxRows={maxRows}
          expanded={expanded}
          setExpanded={setExpanded}
          rowCount={rows.length}
          totalCount={allRows.length}
          hasMore={hasMore}
        />
      </div>
    </section>
  );
}

export default DynamicTable;
