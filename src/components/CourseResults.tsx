import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Award, ChevronDown, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fetchCourseResults, type ResultRow } from "@/lib/results.functions";

function parseTime(t: string) {
  const v = Date.parse(t);
  return Number.isNaN(v) ? 0 : v;
}

export function CourseResults({ modules }: { modules: string[] }) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<ResultRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string | null>(null);
  const load = useServerFn(fetchCourseResults);

  const fetchRows = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await load({ data: { modules } });
      setRows(r.sort((a, b) => parseTime(b.time) - parseTime(a.time)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Помилка завантаження");
    } finally {
      setBusy(false);
    }
  };

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && rows === null && !busy) void fetchRows();
  };

  const tags = useMemo(() => {
    const present = new Set((rows ?? []).map((r) => r.module));
    return modules.filter((m) => [...present].some((p) => p.trim().toLowerCase() === m.trim().toLowerCase()));
  }, [rows, modules]);

  const shown = (rows ?? []).filter(
    (r) => !filter || r.module.trim().toLowerCase() === filter.trim().toLowerCase(),
  );

  return (
    <div className="mb-6 rounded-2xl border border-border bg-card">
      <button
        type="button"
        onClick={toggle}
        className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
        aria-expanded={open}
      >
        <span className="flex items-center gap-2 font-semibold">
          <Award className="size-5 text-primary" /> Результати тестів курсу
          {rows && <span className="text-sm font-normal text-muted-foreground">({rows.length})</span>}
        </span>
        <ChevronDown className={`size-5 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="border-t border-border px-5 py-4">
          {busy && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Завантаження результатів…
            </p>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
          {rows && !busy && (
            <>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <Button size="sm" variant={filter ? "outline" : "default"} onClick={() => setFilter(null)}>
                  Усі модулі
                </Button>
                {tags.map((t) => (
                  <Button
                    key={t}
                    size="sm"
                    variant={filter === t ? "default" : "outline"}
                    onClick={() => setFilter(filter === t ? null : t)}
                  >
                    {t}
                  </Button>
                ))}
                <Button size="sm" variant="ghost" onClick={() => void fetchRows()} title="Оновити">
                  <RefreshCw className="size-4" />
                </Button>
              </div>
              {shown.length === 0 ? (
                <p className="text-sm text-muted-foreground">Результатів поки немає.</p>
              ) : (
                <div className="max-h-96 overflow-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-card text-left text-muted-foreground">
                      <tr>
                        <th className="py-2 pr-3">Модуль</th>
                        <th className="py-2 pr-3">Здобувач освіти</th>
                        <th className="py-2 pr-3">Результат</th>
                        <th className="py-2">Дата</th>
                      </tr>
                    </thead>
                    <tbody>
                      {shown.map((r, i) => (
                        <tr key={i} className="border-t border-border">
                          <td className="py-2 pr-3">{r.module}</td>
                          <td className="py-2 pr-3">{r.name}</td>
                          <td className="py-2 pr-3 font-semibold">{r.score}</td>
                          <td className="py-2 whitespace-nowrap text-muted-foreground">
                            {parseTime(r.time) ? new Date(parseTime(r.time)).toLocaleString("uk-UA") : r.time}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
