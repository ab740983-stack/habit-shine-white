import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Plus, LogOut, Trash2, ChevronLeft, ChevronRight, Target, TrendingUp, Flame, CheckCircle2, Check, Archive, RotateCcw, Cloud } from "lucide-react";
import { RemindersButton } from "@/components/Reminders";

export const Route = createFileRoute("/")({ component: Index });

type Habit = { id: string; name: string; category: string | null; color: string; month_goal: number };
type Completion = { habit_id: string; date: string };

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const CATEGORIES = ["Health","Career","Learning","Mindfulness","Fitness","Finance","Social","Other"];
const COLORS = ["#3b82f6","#10b981","#f59e0b","#ef4444","#8b5cf6","#ec4899","#06b6d4","#84cc16"];

function Index() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  useEffect(() => { if (!loading && !user) navigate({ to: "/auth" }); }, [user, loading, navigate]);

  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());

  const [habits, setHabits] = useState<Habit[]>([]);
  const [completions, setCompletions] = useState<Completion[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const days = useMemo(() => Array.from({ length: daysInMonth }, (_, i) => i + 1), [daysInMonth]);
  const monthStart = `${year}-${String(month + 1).padStart(2, "0")}-01`;
  const monthEnd = `${year}-${String(month + 1).padStart(2, "0")}-${String(daysInMonth).padStart(2, "0")}`;
  const dateStr = (d: number) => `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoadingData(true);
      const [{ data: h }, { data: c }] = await Promise.all([
        supabase.from("habits").select("*").eq("archived", false).order("created_at"),
        supabase.from("habit_completions").select("habit_id,date").gte("date", monthStart).lte("date", monthEnd),
      ]);
      setHabits((h ?? []) as Habit[]);
      setCompletions((c ?? []) as Completion[]);
      setLoadingData(false);
    })();
  }, [user, monthStart, monthEnd]);

  const completedSet = useMemo(() => new Set(completions.map((c) => `${c.habit_id}|${c.date}`)), [completions]);
  const isDone = (hid: string, d: number) => completedSet.has(`${hid}|${dateStr(d)}`);

  const toggle = async (hid: string, d: number) => {
    const date = dateStr(d);
    const key = `${hid}|${date}`;
    if (completedSet.has(key)) {
      setCompletions((p) => p.filter((c) => !(c.habit_id === hid && c.date === date)));
      await supabase.from("habit_completions").delete().eq("habit_id", hid).eq("date", date);
    } else {
      setCompletions((p) => [...p, { habit_id: hid, date }]);
      const { error } = await supabase.from("habit_completions").insert({ habit_id: hid, date, user_id: user!.id, completed: true });
      if (error) { toast.error(error.message); setCompletions((p) => p.filter((c) => !(c.habit_id === hid && c.date === date))); }
    }
  };

  const addHabit = async (name: string, category: string, color: string, monthGoal: number) => {
    const { data, error } = await supabase.from("habits").insert({ name, category, color, month_goal: monthGoal, user_id: user!.id }).select().single();
    if (error) return toast.error(error.message);
    setHabits((p) => [...p, data as Habit]);
    toast.success("Habit added");
  };

  const deleteHabit = async (id: string) => {
    if (!confirm("Delete this habit and its history?")) return;
    setHabits((p) => p.filter((h) => h.id !== id));
    await supabase.from("habits").delete().eq("id", id);
    toast.success("Deleted");
  };

  const changeMonth = (delta: number) => {
    let m = month + delta, y = year;
    if (m < 0) { m = 11; y--; } else if (m > 11) { m = 0; y++; }
    setMonth(m); setYear(y);
  };

  const totalCompleted = completions.length;
  const totalGoal = habits.reduce((s, h) => s + h.month_goal, 0);
  const progressPct = totalGoal > 0 ? Math.round((totalCompleted / totalGoal) * 100) : 0;

  const weeks: number[][] = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));

  if (loading || !user) return <div className="min-h-screen flex items-center justify-center bg-slate-50">Loading…</div>;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-xl bg-blue-600 flex items-center justify-center">
              <CheckCircle2 className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="font-semibold text-slate-900 text-sm sm:text-base">Habit Tracker</h1>
              <p className="text-xs text-slate-500 hidden sm:block">{user.email ?? user.phone}</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <RemindersButton />
            <Button variant="ghost" size="sm" onClick={() => supabase.auth.signOut()}>
              <LogOut className="h-4 w-4 mr-1" /> <span className="hidden sm:inline">Sign out</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-3 sm:px-4 py-4 sm:py-6 space-y-4">
        {/* Month nav */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={() => changeMonth(-1)}><ChevronLeft className="h-4 w-4" /></Button>
            <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
              <SelectTrigger className="w-[140px] bg-white"><SelectValue /></SelectTrigger>
              <SelectContent>{MONTHS.map((m, i) => <SelectItem key={i} value={String(i)}>{m}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
              <SelectTrigger className="w-[100px] bg-white"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Array.from({ length: 11 }, (_, i) => today.getFullYear() - 5 + i).map((y) => (
                  <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" size="icon" onClick={() => changeMonth(1)}><ChevronRight className="h-4 w-4" /></Button>
          </div>
          <AddHabitDialog onAdd={addHabit} />
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard icon={<Target className="h-5 w-5" />} label="Total Goal" value={totalGoal} color="bg-blue-50 text-blue-600" />
          <StatCard icon={<CheckCircle2 className="h-5 w-5" />} label="Completed" value={totalCompleted} color="bg-emerald-50 text-emerald-600" />
          <StatCard icon={<TrendingUp className="h-5 w-5" />} label="Progress" value={`${progressPct}%`} color="bg-violet-50 text-violet-600" />
          <StatCard icon={<Flame className="h-5 w-5" />} label="Active Habits" value={habits.length} color="bg-orange-50 text-orange-600" />
        </div>

        {/* Summary + Weekly ring charts (spreadsheet style) */}
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 sm:gap-3">
          <RingCard label="Summary" completed={totalCompleted} goal={totalGoal} color="#3b82f6" highlight />
          {weeks.map((w, i) => {
            const dones = completions.filter((c) => w.includes(Number(c.date.slice(-2)))).length;
            const possible = w.length * habits.length;
            const weekColors = ["#1e3a8a", "#0e7490", "#9f1239", "#1e40af", "#365314"];
            return (
              <RingCard key={i} label={`Week ${i + 1}`} completed={dones} goal={possible} color={weekColors[i % 5]} />
            );
          })}
        </div>

        {/* Habit grid */}
        <Card className="bg-white border-slate-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 bg-slate-50">
            <h2 className="font-semibold text-slate-900">Daily Habits — {MONTHS[month]} {year}</h2>
          </div>
          {loadingData ? (
            <div className="p-8 text-center text-slate-500 text-sm">Loading…</div>
          ) : habits.length === 0 ? (
            <div className="p-10 text-center">
              <div className="text-slate-400 mb-2">No habits yet</div>
              <p className="text-sm text-slate-500 mb-4">Add your first habit to start tracking.</p>
              <AddHabitDialog onAdd={addHabit} />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead className="bg-slate-50 sticky top-0">
                  <tr>
                    <th className="text-left font-medium text-slate-600 px-3 py-2 sticky left-0 bg-slate-50 min-w-[180px]">Habit</th>
                    <th className="text-left font-medium text-slate-600 px-2 py-2 hidden sm:table-cell">Category</th>
                    {days.map((d) => (
                      <th key={d} className="font-medium text-slate-500 text-xs px-1 py-2 w-7 text-center">{d}</th>
                    ))}
                    <th className="text-right font-medium text-slate-600 px-3 py-2 min-w-[80px]">Progress</th>
                    <th className="px-2 py-2 w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {habits.map((h) => {
                    const doneCount = days.filter((d) => isDone(h.id, d)).length;
                    const pct = Math.round((doneCount / h.month_goal) * 100);
                    return (
                      <tr key={h.id} className="border-t border-slate-100 hover:bg-slate-50/50">
                        <td className="px-3 py-2 sticky left-0 bg-white font-medium text-slate-900">
                          <div className="flex items-center gap-2">
                            <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: h.color }} />
                            <span className="truncate max-w-[140px]">{h.name}</span>
                          </div>
                        </td>
                        <td className="px-2 py-2 text-slate-500 hidden sm:table-cell">{h.category ?? "—"}</td>
                        {days.map((d) => {
                          const done = isDone(h.id, d);
                          return (
                            <td key={d} className="p-0.5 text-center">
                              <button
                                onClick={() => toggle(h.id, d)}
                                className="h-6 w-6 rounded border transition-all hover:scale-110"
                                style={{
                                  background: done ? h.color : "transparent",
                                  borderColor: done ? h.color : "#e2e8f0",
                                }}
                                aria-label={`Toggle ${h.name} day ${d}`}
                              />
                            </td>
                          );
                        })}
                        <td className="px-3 py-2 text-right">
                          <div className="text-xs font-semibold text-slate-900">{doneCount}/{h.month_goal}</div>
                          <div className="text-xs text-slate-500">{Math.min(pct, 999)}%</div>
                        </td>
                        <td className="px-2 py-2">
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-red-600" onClick={() => deleteHabit(h.id)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <p className="text-center text-xs text-slate-400 pt-2">Your data is private and synced across devices.</p>
      </main>
    </div>
  );
}

function StatCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: number | string; color: string }) {
  return (
    <Card className="p-4 bg-white border-slate-200">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs font-medium text-slate-500 uppercase tracking-wide">{label}</div>
          <div className="text-2xl font-semibold text-slate-900 mt-1">{value}</div>
        </div>
        <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${color}`}>{icon}</div>
      </div>
    </Card>
  );
}

function RingCard({ label, completed, goal, color, highlight }: { label: string; completed: number; goal: number; color: string; highlight?: boolean }) {
  const pct = goal > 0 ? Math.min(100, (completed / goal) * 100) : 0;
  const size = 88;
  const stroke = 9;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (pct / 100) * circ;
  return (
    <Card className={`p-2 sm:p-3 border-slate-200 flex flex-col items-center ${highlight ? "bg-slate-900 text-white" : "bg-slate-900 text-white"}`}>
      <div className={`text-[10px] sm:text-xs font-semibold uppercase tracking-wider mb-2 ${highlight ? "text-blue-300" : "text-slate-300"}`}>{label}</div>
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(255,255,255,0.08)" strokeWidth={stroke} fill="none" />
          <circle
            cx={size / 2} cy={size / 2} r={r}
            stroke={color} strokeWidth={stroke} fill="none"
            strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
            className="transition-all duration-500"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div className="text-lg sm:text-xl font-bold leading-none">{completed}</div>
          <div className="text-[8px] sm:text-[9px] uppercase tracking-wide text-slate-400 mt-0.5">Done</div>
        </div>
      </div>
      <div className="text-[10px] sm:text-xs text-slate-300 mt-2">{goal} <span className="text-slate-500">goal</span></div>
    </Card>
  );
}

function AddHabitDialog({ onAdd }: { onAdd: (name: string, category: string, color: string, goal: number) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [color, setColor] = useState(COLORS[0]);
  const [goal, setGoal] = useState(25);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="bg-blue-600 hover:bg-blue-700"><Plus className="h-4 w-4 mr-1" /> Add Habit</Button>
      </DialogTrigger>
      <DialogContent className="bg-white">
        <DialogHeader><DialogTitle>New Habit</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Wake up at 5 AM" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Monthly Goal</Label><Input type="number" min={1} max={31} value={goal} onChange={(e) => setGoal(Number(e.target.value))} /></div>
          </div>
          <div>
            <Label>Color</Label>
            <div className="flex gap-2 mt-1">
              {COLORS.map((c) => (
                <button key={c} onClick={() => setColor(c)} className="h-7 w-7 rounded-full ring-offset-2 transition-all" style={{ background: c, boxShadow: color === c ? `0 0 0 2px ${c}` : undefined }} />
              ))}
            </div>
          </div>
          <Button className="w-full bg-blue-600 hover:bg-blue-700" onClick={() => {
            if (!name.trim()) return toast.error("Name required");
            onAdd(name.trim(), category, color, goal);
            setName(""); setOpen(false);
          }}>Add Habit</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
