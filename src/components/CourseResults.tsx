import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Award, ChevronDown, ChevronRight, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fetchCourseResults, type ResultRow } from "@/lib/results.functions";

function parseTime(t: string) {
  const v = Date.parse(t);
  return Number.isNaN(v) ? 0 : v;
}

function parseScore(s: string): number | null {
  const m = s.replace(",", ".").match(/-?\d+(\.\d+)?/);
  return m ? Number(m[0]) : null;
}

const cap = (w: string) => (w ? w[0]!.toLocaleUpperCase("uk-UA") + w.slice(1).toLocaleLowerCase("uk-UA") : w);
const tokens = (n: string) => n.trim().split(/\s+/).filter(Boolean).map(cap);
const studentKey = (n: string) =>
  tokens(n)
    .map((t) => t.toLocaleLowerCase("uk-UA").replace(/[’'`ʼ]/g, "'"))
    .sort()
    .join(" ");

const SURNAME = /(енко|ко|чук|ук|юк|ич|ович|евич|ів|їв|ов|ев|єв|ин|ін|ський|цький|зький|ська|цька|зька|ова|ева|єва|іна|ина|ак|ик|як|ар|яр|ай|ей|ій)$/i;

function displayName(variants: string[]) {
  const count = new Map<string, number>();
  for (const v of variants) {
    const s = tokens(v).join(" ");
    count.set(s, (count.get(s) ?? 0) + 1);
  }
  const best = [...count.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
  const t = best.split(" ");
  // Two-word name: put the surname first when it is clearly the second word.
  if (t.length === 2 && SURNAME.test(t[1]!) && !SURNAME.test(t[0]!)) return `${t[1]} ${t[0]}`;
  return best;
}

type Group = { key: string; name: string; rows: ResultRow[]; avg: number | null };

export function CourseResults({ modules, admin = false }: { modules: string[]; admin?: boolean }) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<ResultRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
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

  const groups = useMemo<Group[]>(() => {
    const shown = (rows ?? []).filter(
      (r) => !filter || r.module.trim().toLowerCase() === filter.trim().toLowerCase(),
    );
    const map = new Map<string, ResultRow[]>();
    for (const r of shown) {
      const k = studentKey(r.name) || "—";
      map.set(k, [...(map.get(k) ?? []), r]);
    }
    return [...map.entries()]
      .map(([key, rs]) => {
        const nums = rs.map((r) => parseScore(r.score)).filter((n): n is number => n !== null);
        return {
          key,
          name: displayName(rs.map((r) => r.name)) || "Без імені",
          rows: rs,
          avg: nums.length ? Math.round(nums.reduce((a, b) => a + b, 0) / nums.length) : null,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name, "uk-UA"));
  }, [rows, filter]);

  const flip = (k: string) =>
    setExpanded((s) => {
      const n = new Set(s);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });

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
              {groups.length === 0 ? (
                <p className="text-sm text-muted-foreground">Результатів поки немає.</p>
              ) : (
                <div className="max-h-[32rem] overflow-auto">
                  <div className="flex items-center justify-between px-3 pb-2 text-xs text-muted-foreground">
                    <span>Здобувач освіти</span>
                    <span>Тестів · Середній бал</span>
                  </div>
                  <ul className="space-y-1">
                    {groups.map((g) => {
                      const isOpen = expanded.has(g.key);
                      return (
                        <li key={g.key} className="rounded-lg border border-border">
                          <button
                            type="button"
                            onClick={() => flip(g.key)}
                            aria-expanded={isOpen}
                            className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-muted/50"
                          >
                            <span className="flex items-center gap-2 font-medium">
                              <ChevronRight className={`size-4 transition-transform ${isOpen ? "rotate-90" : ""}`} />
                              {g.name}
                            </span>
                            <span className="flex items-center gap-3">
                              <span className="text-muted-foreground">{g.rows.length}</span>
                              <span className="min-w-8 rounded-md bg-primary px-2 py-0.5 text-center font-semibold text-primary-foreground">
                                {g.avg ?? "—"}
                              </span>
                            </span>
                          </button>
                          {isOpen && (
                            <table className="w-full border-t border-border text-sm">
                              <tbody>
                                {g.rows.map((r, i) => (
                                  <tr key={i} className="border-t border-border first:border-t-0">
                                    <td className="py-1.5 pl-9 pr-3">
                                      {admin && r.link ? (
                                        <a href={r.link} target="_blank" rel="noopener noreferrer" className="text-primary underline-offset-2 hover:underline" title="Відкрити відповідь у Google Формі">
                                          {r.module}
                                        </a>
                                      ) : (
                                        r.module
                                      )}
                                    </td>
                                    <td className="py-1.5 pr-3 font-semibold">{r.score}</td>
                                    <td className="py-1.5 pr-3 whitespace-nowrap text-right text-muted-foreground">
                                      {parseTime(r.time) ? new Date(parseTime(r.time)).toLocaleString("uk-UA") : r.time}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
