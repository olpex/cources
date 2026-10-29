import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ChevronDown, Loader2, Plus, ShieldMinus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { changeTestExclusion, listTestExclusions } from "@/lib/test-exclusions.functions";

export function TestExclusions() {
  const list = useServerFn(listTestExclusions);
  const change = useServerFn(changeTestExclusion);
  const [emails, setEmails] = useState<string[]>([]);
  const [email, setEmail] = useState("");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const signature = useRef<string | null>(null);
  const request = useRef(0);
  const refresh = useCallback(async () => {
    const id = ++request.current;
    try {
      const next = await list();
      if (id !== request.current) return;
      const key = JSON.stringify(next);
      if (signature.current !== null && signature.current !== key) {
        window.dispatchEvent(new Event("test-exclusions-changed"));
      }
      signature.current = key;
      setEmails(next);
      setError(null);
    } catch (e) {
      if (id === request.current) setError(e instanceof Error ? e.message : "Не вдалося завантажити список");
    }
  }, [list]);
  useEffect(() => {
    void refresh();
    const check = () => { if (document.visibilityState === "visible") void refresh(); };
    const timer = window.setInterval(check, 10000);
    window.addEventListener("focus", check);
    return () => { ++request.current; clearInterval(timer); window.removeEventListener("focus", check); };
  }, [refresh]);
  const save = async (value: string, remove: boolean) => {
    setBusy(true);
    try {
      await change({ data: { email: value, remove } });
      window.dispatchEvent(new Event("test-exclusions-changed"));
      if (!remove) setEmail("");
      await refresh();
      toast.success(remove ? "Адресу видалено зі списку виключень" : "Адресу додано до списку виключень");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Не вдалося зберегти адресу");
    } finally { setBusy(false); }
  };
  return (
    <section className="mx-auto max-w-6xl px-6 py-7" aria-label="Чорний список">
      <Button variant="outline" className="h-auto gap-3 whitespace-normal px-5 py-3 text-left text-base" onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-controls="test-blacklist-content">
        <ShieldMinus className="size-5 shrink-0" />Чорний список ({emails.length})
        <ChevronDown className={`size-5 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </Button>
      {open && <div id="test-blacklist-content" className="mt-4 max-w-[52.5rem] space-y-3">
        <form className="space-y-2" onSubmit={(event) => { event.preventDefault(); void save(email, false); }}>
          <Label htmlFor="test-blacklist-email" className="text-base">Email студента</Label>
          <div className="flex flex-wrap gap-3">
            <Input id="test-blacklist-email" type="email" required maxLength={320} value={email} onChange={(event) => setEmail(event.target.value)} placeholder="student@gmail.com" aria-label="Email студента для виключення" className="h-11 min-w-0 flex-1 text-base" disabled={busy} />
            <Button type="submit" className="h-11 px-5 text-base" disabled={busy || !email.trim()}>{busy ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}Додати</Button>
          </div>
        </form>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        {!emails.length && !error && <p className="text-sm text-muted-foreground">Список порожній.</p>}
        <ul className="divide-y divide-border">
          {emails.map((value) => <li key={value} className="flex items-center justify-between gap-3 py-4">
            <span className="min-w-0 break-all text-base">{value}</span>
            <Button size="icon" variant="ghost" disabled={busy} aria-label={`Видалити ${value}`} title="Видалити адресу" onClick={() => void save(value, true)}><Trash2 className="size-4 text-destructive" /></Button>
          </li>)}
        </ul>
      </div>}
    </section>
  );
}