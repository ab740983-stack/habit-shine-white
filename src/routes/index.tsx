import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Plus, LogOut, Trash2, ChevronLeft, ChevronRight, Target, TrendingUp, Flame, CheckCircle2, Check, Archive, RotateCcw, Cloud, BarChart3, Pencil, ZoomIn, ZoomOut, ListTodo, CalendarClock, X, Maximize2 } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Area, AreaChart, ComposedChart, Bar, Cell, ReferenceLine } from "recharts";

import { RemindersButton } from "@/components/Reminders";

export const Route = createFileRoute("/")({ component: Index });

type Habit = { id: string; name: string; category: string | null; color: string; month_goal: number; archived?: boolean };
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
  const [archivedHabits, setArchivedHabits] = useState<Habit[]>([]);
  const [completions, setCompletions] = useState<Completion[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [progressOpen, setProgressOpen] = useState(false);
  const [todoOpen, setTodoOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [cellSize, setCellSize] = useState<number>(34); // px
  const [fitMode, setFitMode] = useState<boolean>(true); // auto-fit all dates in viewport
  const [addOpen, setAddOpen] = useState(false);
  const [allCompletions, setAllCompletions] = useState<Completion[]>([]); // for trading chart

  // Swipe gestures:
  //  - swipe LEFT from right edge  → open Progress
  //  - swipe RIGHT from left edge  → open To-Do
  //  - swipe UP   from bottom edge → open Schedule
  //  - reverse swipe on an open panel closes it
  const touchStart = useRef<{ x: number; y: number; t: number } | null>(null);
  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    touchStart.current = { x: t.clientX, y: t.clientY, t: Date.now() };
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (!touchStart.current) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touchStart.current.x;
    const dy = t.clientY - touchStart.current.y;
    const sx = touchStart.current.x;
    const sy = touchStart.current.y;
    const w = window.innerWidth;
    const h = window.innerHeight;
    const anyOpen = progressOpen || todoOpen || scheduleOpen;
    // Open gestures (only when nothing is open)
    if (!anyOpen) {
      if (sx > w - 40 && dx < -60 && Math.abs(dy) < 80) setProgressOpen(true);
      else if (sx < 40 && dx > 60 && Math.abs(dy) < 80) setTodoOpen(true);
      else if (sy > h - 60 && dy < -60 && Math.abs(dx) < 80) setScheduleOpen(true);
    }
    touchStart.current = null;
  };

  const markSaved = () => setSavedAt(new Date());

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const days = useMemo(() => Array.from({ length: daysInMonth }, (_, i) => i + 1), [daysInMonth]);
  const monthStart = `${year}-${String(month + 1).padStart(2, "0")}-01`;
  const monthEnd = `${year}-${String(month + 1).padStart(2, "0")}-${String(daysInMonth).padStart(2, "0")}`;
  const dateStr = (d: number) => `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoadingData(true);
      const [{ data: h }, { data: ah }, { data: c }] = await Promise.all([
        supabase.from("habits").select("*").eq("archived", false).order("created_at"),
        supabase.from("habits").select("*").eq("archived", true).order("created_at"),
        supabase.from("habit_completions").select("habit_id,date").gte("date", monthStart).lte("date", monthEnd),
      ]);
      setHabits((h ?? []) as Habit[]);
      setArchivedHabits((ah ?? []) as Habit[]);
      setCompletions((c ?? []) as Completion[]);
      setLoadingData(false);
      markSaved();
    })();
  }, [user, monthStart, monthEnd]);

  // Load full history once for the trading chart
  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase.from("habit_completions").select("habit_id,date").order("date");
      setAllCompletions((data ?? []) as Completion[]);
    })();
  }, [user, completions.length]);

  // Auto-fit cell size to viewport when fitMode is on
  useEffect(() => {
    if (!fitMode) return;
    const compute = () => {
      const avail = Math.min(window.innerWidth, 1280) - 160; // habit col + total col + padding
      const size = Math.max(10, Math.floor(avail / daysInMonth));
      setCellSize(size);
    };
    compute();
    window.addEventListener("resize", compute);
    return () => window.removeEventListener("resize", compute);
  }, [fitMode, daysInMonth]);

  // Only count completions of ACTIVE habits — archived habit progress shows as 0
  const activeIds = useMemo(() => new Set(habits.map((h) => h.id)), [habits]);
  const activeCompletions = useMemo(() => completions.filter((c) => activeIds.has(c.habit_id)), [completions, activeIds]);

  const completedSet = useMemo(() => new Set(activeCompletions.map((c) => `${c.habit_id}|${c.date}`)), [activeCompletions]);
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
      if (error) { toast.error(error.message); setCompletions((p) => p.filter((c) => !(c.habit_id === hid && c.date === date))); return; }
    }
    markSaved();
  };

  const addHabit = async (name: string, category: string, color: string, monthGoal: number) => {
    const { data, error } = await supabase.from("habits").insert({ name, category, color, month_goal: monthGoal, user_id: user!.id }).select().single();
    if (error) return toast.error(error.message);
    setHabits((p) => [...p, data as Habit]);
    markSaved();
    toast.success("Habit added & saved");
  };

  const updateHabit = async (id: string, patch: Partial<Habit>) => {
    setHabits((p) => p.map((h) => (h.id === id ? { ...h, ...patch } : h)));
    const { error } = await supabase.from("habits").update(patch).eq("id", id);
    if (error) return toast.error(error.message);
    markSaved();
    toast.success("Habit updated");
  };

  const archiveHabit = async (id: string) => {
    const h = habits.find((x) => x.id === id);
    if (!h) return;
    setHabits((p) => p.filter((x) => x.id !== id));
    setArchivedHabits((p) => [...p, { ...h, archived: true }]);
    const { error } = await supabase.from("habits").update({ archived: true }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    markSaved();
    toast.success("Moved to Trash — progress reset to 0");
  };

  const restoreHabit = async (id: string) => {
    const h = archivedHabits.find((x) => x.id === id);
    if (!h) return;
    setArchivedHabits((p) => p.filter((x) => x.id !== id));
    setHabits((p) => [...p, { ...h, archived: false }]);
    await supabase.from("habits").update({ archived: false }).eq("id", id);
    markSaved();
    toast.success("Restored — progress recovered");
  };

  const permanentDelete = async (id: string) => {
    if (!confirm("Permanently delete this habit and ALL its history? This cannot be undone.")) return;
    setArchivedHabits((p) => p.filter((x) => x.id !== id));
    await supabase.from("habits").delete().eq("id", id);
    markSaved();
    toast.success("Permanently deleted");
  };

  const changeMonth = (delta: number) => {
    let m = month + delta, y = year;
    if (m < 0) { m = 11; y--; } else if (m > 11) { m = 0; y++; }
    setMonth(m); setYear(y);
  };

  const totalCompleted = activeCompletions.length;
  const totalGoal = habits.reduce((s, h) => s + h.month_goal, 0);
  const progressPct = totalGoal > 0 ? Math.round((totalCompleted / totalGoal) * 100) : 0;

  const weeks: number[][] = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));

  if (loading || !user) return <div className="min-h-screen flex items-center justify-center bg-slate-50">Loading…</div>;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
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
            <SavedBadge savedAt={savedAt} />
            <Button variant="outline" size="sm" onClick={() => setTodoOpen(true)} className="gap-1" title="To-Do (swipe right from left edge)">
              <ListTodo className="h-4 w-4" /> <span className="hidden sm:inline">To-Do</span>
            </Button>
            <Button variant="outline" size="sm" onClick={() => setScheduleOpen(true)} className="gap-1" title="Daily Schedule (swipe up from bottom)">
              <CalendarClock className="h-4 w-4" /> <span className="hidden sm:inline">Schedule</span>
            </Button>
            <Button variant="outline" size="sm" onClick={() => setProgressOpen(true)} className="gap-1" title="Progress (swipe left from right edge)">
              <BarChart3 className="h-4 w-4" /> <span className="hidden sm:inline">Progress</span>
            </Button>
            <RemindersButton />
            <Button variant="ghost" size="sm" onClick={() => supabase.auth.signOut()}>
              <LogOut className="h-4 w-4 sm:mr-1" /> <span className="hidden sm:inline">Sign out</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-3 sm:px-4 py-4 sm:py-6 space-y-4">
        {/* Month nav */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={() => changeMonth(-1)}><ChevronLeft className="h-4 w-4" /></Button>
            <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
              <SelectTrigger className="w-[130px] bg-white"><SelectValue /></SelectTrigger>
              <SelectContent>{MONTHS.map((m, i) => <SelectItem key={i} value={String(i)}>{m}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
              <SelectTrigger className="w-[90px] bg-white"><SelectValue /></SelectTrigger>
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

        {/* Habit grid */}
        <Card className="bg-white border-slate-200 overflow-hidden">
          <div className="px-3 py-2 border-b border-slate-200 bg-slate-50 flex items-center justify-between gap-2 flex-wrap">
            <h2 className="font-semibold text-slate-900 text-sm sm:text-base">Daily Habits — {MONTHS[month]} {year}</h2>
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-slate-500 hidden sm:inline mr-1">{habits.length} active{archivedHabits.length > 0 && ` · ${archivedHabits.length} trash`}</span>
              <Button variant={fitMode ? "default" : "outline"} size="icon" className="h-7 w-7" title="Fit all dates to screen" onClick={() => setFitMode((f) => !f)}>
                <Maximize2 className="h-3.5 w-3.5" />
              </Button>
              <Button variant="outline" size="icon" className="h-7 w-7" title="Zoom out" onClick={() => { setFitMode(false); setCellSize((s) => Math.max(10, s - 4)); }}>
                <ZoomOut className="h-3.5 w-3.5" />
              </Button>
              <span className="text-[10px] text-slate-500 w-7 text-center">{cellSize}</span>
              <Button variant="outline" size="icon" className="h-7 w-7" title="Zoom in" onClick={() => { setFitMode(false); setCellSize((s) => Math.min(56, s + 4)); }}>
                <ZoomIn className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
          {loadingData ? (
            <div className="p-8 text-center text-slate-500 text-sm">Loading…</div>
          ) : (
            <div className={fitMode ? "overflow-x-hidden overflow-y-auto max-h-[78vh]" : "overflow-auto max-h-[78vh]"}>
              <table className={`text-sm border-collapse ${fitMode ? "w-full table-fixed" : ""}`}>
                <thead className="bg-slate-50 sticky top-0 z-10">
                  <tr>
                    <th className="text-left font-medium text-slate-600 px-1.5 py-2 sticky left-0 bg-slate-50 z-20 border-r border-slate-200" style={{ width: fitMode ? 80 : undefined, minWidth: fitMode ? 80 : 150 }}>Habit</th>
                    {days.map((d) => {
                      const isToday = d === today.getDate() && month === today.getMonth() && year === today.getFullYear();
                      return (
                        <th key={d} style={{ width: cellSize, minWidth: cellSize }} className={`px-0 py-2 text-center font-medium text-[9px] ${isToday ? "bg-blue-100 text-blue-700" : "text-slate-600"}`}>
                          {d}
                        </th>
                      );
                    })}
                    <th className="px-1 py-2 text-center font-semibold text-slate-700 bg-slate-100 border-l border-slate-200 sticky right-0" style={{ width: fitMode ? 44 : undefined, minWidth: fitMode ? 44 : 70 }}>Σ</th>
                  </tr>
                </thead>
                <tbody>
                  {habits.map((h) => {
                    const doneCount = days.filter((d) => isDone(h.id, d)).length;
                    const pct = h.month_goal > 0 ? Math.round((doneCount / h.month_goal) * 100) : 0;
                    return (
                      <tr key={h.id} className="border-t border-slate-100 hover:bg-slate-50/50">
                        <td className="px-1.5 py-1 sticky left-0 bg-white border-r border-slate-200 z-10" style={{ width: fitMode ? 80 : undefined }}>
                          <div className="flex items-center gap-1">
                            <span className="h-2 w-2 rounded-full shrink-0" style={{ background: h.color }} />
                            <span className="truncate font-medium text-slate-800 text-[11px] flex-1" title={h.name}>{h.name}</span>
                            <EditHabitDialog habit={h} onSave={(patch) => updateHabit(h.id, patch)} />
                            <Button variant="ghost" size="icon" className="h-5 w-5 text-slate-300 hover:text-red-600" onClick={() => archiveHabit(h.id)} title="Trash">
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </td>
                        {days.map((d) => {
                          const done = isDone(h.id, d);
                          const isToday = d === today.getDate() && month === today.getMonth() && year === today.getFullYear();
                          const btn = Math.max(8, cellSize - 4);
                          return (
                            <td key={d} style={{ width: cellSize, minWidth: cellSize }} className={`px-0 py-0.5 text-center ${isToday ? "bg-blue-50/50" : ""}`}>
                              <button
                                onClick={() => toggle(h.id, d)}
                                className="rounded-sm border grid place-content-center transition-all hover:scale-110 mx-auto"
                                style={{ height: btn, width: btn, background: done ? h.color : "transparent", borderColor: done ? h.color : "#cbd5e1", borderWidth: btn > 14 ? 2 : 1 }}
                                aria-label={`Toggle ${h.name} day ${d}`}
                              >
                                {done && btn > 12 && <Check style={{ height: btn * 0.7, width: btn * 0.7 }} className="text-white" strokeWidth={3} />}
                              </button>
                            </td>
                          );
                        })}
                        <td className="px-1 py-1 text-center bg-slate-50 border-l border-slate-200 sticky right-0">
                          <div className="font-semibold text-slate-900 text-[10px] leading-tight">{doneCount}/{h.month_goal}</div>
                          <div className="text-[9px] text-slate-500 leading-tight">{Math.min(pct, 999)}%</div>
                        </td>
                      </tr>
                    );
                  })}
                  {Array.from({ length: Math.max(0, 12 - habits.length) }).map((_, i) => (
                    <tr key={`empty-${i}`} className="border-t border-slate-100">
                      <td className="px-1.5 py-1 sticky left-0 bg-white border-r border-slate-200 z-10">
                        <button
                          onClick={() => setAddOpen(true)}
                          className="flex items-center gap-1 w-full text-left text-slate-400 hover:text-blue-600 text-[11px]"
                          title="Add habit"
                        >
                          <Plus className="h-3 w-3" />
                          <span className="truncate">Add</span>
                        </button>
                      </td>
                      {days.map((d) => {
                        const btn = Math.max(8, cellSize - 4);
                        return (
                          <td key={d} style={{ width: cellSize, minWidth: cellSize }} className="px-0 py-0.5 text-center">
                            <div className="rounded-sm border border-dashed border-slate-200 mx-auto" style={{ height: btn, width: btn }} />
                          </td>
                        );
                      })}
                      <td className="px-1 py-1 text-center bg-slate-50/50 border-l border-slate-200 sticky right-0">
                        <div className="text-[10px] text-slate-300">—</div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>


        <p className="text-center text-xs text-slate-400 pt-2 flex items-center justify-center gap-1">
          <Cloud className="h-3 w-3" /> Your data is saved to the cloud and synced across devices.
        </p>
      </main>

      {/* Progress side sheet */}
      {/* Hidden controllable Add dialog (opened by empty placeholder rows) */}
      <AddHabitDialog onAdd={addHabit} open={addOpen} onOpenChange={setAddOpen} hideTrigger />

      <Sheet open={progressOpen} onOpenChange={setProgressOpen}>

        <SheetContent side="right" className="w-full sm:max-w-md bg-slate-50 overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2"><BarChart3 className="h-5 w-5" /> Progress</SheetTitle>
          </SheetHeader>

          {/* Trash on top */}
          <div className="mt-4">
            <TrashPanel archived={archivedHabits} onRestore={restoreHabit} onPurge={permanentDelete} />
          </div>

          {/* Summary cards */}
          <div className="grid grid-cols-2 gap-3 mt-4">
            <StatCard icon={<Target className="h-5 w-5" />} label="Goal" value={totalGoal} color="bg-blue-50 text-blue-600" />
            <StatCard icon={<CheckCircle2 className="h-5 w-5" />} label="Done" value={totalCompleted} color="bg-emerald-50 text-emerald-600" />
            <StatCard icon={<TrendingUp className="h-5 w-5" />} label="Progress" value={`${progressPct}%`} color="bg-violet-50 text-violet-600" />
            <StatCard icon={<Flame className="h-5 w-5" />} label="Active" value={habits.length} color="bg-orange-50 text-orange-600" />
          </div>

          {/* Ring charts */}
          <div className="grid grid-cols-3 gap-2 mt-4">
            <RingCard label="Summary" completed={totalCompleted} goal={totalGoal} color="#3b82f6" />
            {weeks.map((w, i) => {
              const dones = activeCompletions.filter((c) => w.includes(Number(c.date.slice(-2)))).length;
              const possible = w.length * habits.length;
              const weekColors = ["#1e3a8a", "#0e7490", "#9f1239", "#1e40af", "#365314"];
              return (
                <RingCard key={i} label={`Week ${i + 1}`} completed={dones} goal={possible} color={weekColors[i % 5]} />
              );
            })}
          </div>

          {/* Trading-style progress chart */}
          <div className="mt-4">
            <TradingChart completions={allCompletions} habitCount={habits.length} />
          </div>

          {/* Per-habit & per-day candle/line breakdowns for current month */}
          <div className="mt-4 space-y-3">
            <PerHabitChart habits={habits} completions={activeCompletions} days={days} />
            <PerDayChart habits={habits} completions={activeCompletions} days={days} month={month} year={year} />
          </div>
        </SheetContent>
      </Sheet>

      {/* To-Do panel — swipe right from left edge */}
      <Sheet open={todoOpen} onOpenChange={setTodoOpen}>
        <SheetContent side="left" className="w-full sm:max-w-md bg-slate-50 overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2"><ListTodo className="h-5 w-5" /> To-Do List</SheetTitle>
          </SheetHeader>
          <TodoPanel userId={user.id} onChange={markSaved} />
        </SheetContent>
      </Sheet>

      {/* Daily Schedule panel — swipe up from bottom edge */}
      <Sheet open={scheduleOpen} onOpenChange={setScheduleOpen}>
        <SheetContent side="bottom" className="h-[85vh] bg-slate-50 overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2"><CalendarClock className="h-5 w-5" /> Daily Schedule</SheetTitle>
          </SheetHeader>
          <SchedulePanel userId={user.id} onChange={markSaved} />
        </SheetContent>
      </Sheet>
    </div>
  );
}

function SavedBadge({ savedAt }: { savedAt: Date | null }) {
  if (!savedAt) return null;
  return (
    <span className="hidden sm:inline-flex items-center gap-1 text-xs text-emerald-600 bg-emerald-50 px-2 py-1 rounded-md">
      <Cloud className="h-3 w-3" /> Saved
    </span>
  );
}

function TrashPanel({ archived, onRestore, onPurge }: { archived: Habit[]; onRestore: (id: string) => void; onPurge: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <Card className="bg-white border-slate-200 p-3">
      <button onClick={() => setOpen((o) => !o)} className="w-full flex items-center justify-between">
        <span className="flex items-center gap-2 font-semibold text-slate-800 text-sm">
          <Archive className="h-4 w-4" /> Trash
          {archived.length > 0 && (
            <span className="text-[10px] bg-slate-200 text-slate-700 rounded-full px-1.5 py-0.5">{archived.length}</span>
          )}
        </span>
        <ChevronRight className={`h-4 w-4 text-slate-400 transition-transform ${open ? "rotate-90" : ""}`} />
      </button>
      {open && (
        <div className="mt-3">
          <p className="text-xs text-slate-500 mb-2">Deleted habits stay here with their full history. Restore anytime.</p>
          {archived.length === 0 ? (
            <div className="text-center text-xs text-slate-400 py-4">Trash is empty</div>
          ) : (
            <div className="space-y-2 max-h-[40vh] overflow-y-auto">
              {archived.map((h) => (
                <div key={h.id} className="flex items-center gap-2 p-2 border border-slate-200 rounded-md">
                  <span className="h-3 w-3 rounded-full shrink-0" style={{ background: h.color }} />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-xs truncate">{h.name}</div>
                    <div className="text-[10px] text-slate-500">Goal {h.month_goal}</div>
                  </div>
                  <Button variant="outline" size="sm" className="h-7 px-2" onClick={() => onRestore(h.id)}>
                    <RotateCcw className="h-3 w-3 mr-1" /> Restore
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-red-600 hover:bg-red-50" onClick={() => onPurge(h.id)} title="Permanently delete">
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

function StatCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: number | string; color: string }) {
  return (
    <Card className="p-3 bg-white border-slate-200">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[10px] font-medium text-slate-500 uppercase tracking-wide">{label}</div>
          <div className="text-xl font-semibold text-slate-900 mt-1">{value}</div>
        </div>
        <div className={`h-9 w-9 rounded-lg flex items-center justify-center ${color}`}>{icon}</div>
      </div>
    </Card>
  );
}

function RingCard({ label, completed, goal, color }: { label: string; completed: number; goal: number; color: string }) {
  const pct = goal > 0 ? Math.min(100, (completed / goal) * 100) : 0;
  const size = 80;
  const stroke = 8;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (pct / 100) * circ;
  return (
    <Card className="p-2 border-slate-200 flex flex-col items-center bg-slate-900 text-white">
      <div className="text-[9px] font-semibold uppercase tracking-wider mb-1 text-slate-300">{label}</div>
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
          <div className="text-lg font-bold leading-none">{completed}</div>
          <div className="text-[8px] uppercase tracking-wide text-slate-400 mt-0.5">Done</div>
        </div>
      </div>
      <div className="text-[10px] text-slate-300 mt-1">{goal} <span className="text-slate-500">goal</span></div>
    </Card>
  );
}

function AddHabitDialog({ onAdd, open: openProp, onOpenChange, hideTrigger }: { onAdd: (name: string, category: string, color: string, goal: number) => void; open?: boolean; onOpenChange?: (o: boolean) => void; hideTrigger?: boolean }) {
  const [openState, setOpenState] = useState(false);
  const open = openProp ?? openState;
  const setOpen = (o: boolean) => { onOpenChange ? onOpenChange(o) : setOpenState(o); };
  const [name, setName] = useState("");
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [color, setColor] = useState(COLORS[0]);
  const [goal, setGoal] = useState(25);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {!hideTrigger && (
        <DialogTrigger asChild>
          <Button className="bg-blue-600 hover:bg-blue-700"><Plus className="h-4 w-4 mr-1" /> Add Habit</Button>
        </DialogTrigger>
      )}
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
            <div className="flex gap-2 mt-1 flex-wrap">
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

function EditHabitDialog({ habit, onSave }: { habit: Habit; onSave: (patch: Partial<Habit>) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(habit.name);
  const [category, setCategory] = useState(habit.category ?? CATEGORIES[0]);
  const [color, setColor] = useState(habit.color);
  const [goal, setGoal] = useState(habit.month_goal);

  useEffect(() => {
    if (open) {
      setName(habit.name);
      setCategory(habit.category ?? CATEGORIES[0]);
      setColor(habit.color);
      setGoal(habit.month_goal);
    }
  }, [open, habit]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="h-6 w-6 text-slate-300 hover:text-blue-600" title="Edit habit">
          <Pencil className="h-3 w-3" />
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-white">
        <DialogHeader><DialogTitle>Edit Habit</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
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
            <div className="flex gap-2 mt-1 flex-wrap">
              {COLORS.map((c) => (
                <button key={c} onClick={() => setColor(c)} className="h-7 w-7 rounded-full ring-offset-2 transition-all" style={{ background: c, boxShadow: color === c ? `0 0 0 2px ${c}` : undefined }} />
              ))}
            </div>
          </div>
          <Button className="w-full bg-blue-600 hover:bg-blue-700" onClick={() => {
            if (!name.trim()) return toast.error("Name required");
            onSave({ name: name.trim(), category, color, month_goal: goal });
            setOpen(false);
          }}>Save Changes</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ============ To-Do Panel (cloud synced + trash) ============
type Todo = { id: string; text: string; done: boolean; created_at: string; completed_at: string | null; trashed_at: string | null };

const fmtDate = (iso: string | number) => new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

function TodoPanel({ userId, onChange }: { userId: string; onChange: () => void }) {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [text, setText] = useState("");
  const [showTrash, setShowTrash] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("todos").select("*").order("created_at", { ascending: false });
      setTodos((data ?? []) as Todo[]);
    })();
  }, [userId]);

  const add = async () => {
    if (!text.trim()) return;
    const { data, error } = await supabase.from("todos").insert({ user_id: userId, text: text.trim(), done: false }).select().single();
    if (error) return toast.error(error.message);
    setTodos((p) => [data as Todo, ...p]);
    setText(""); onChange();
  };
  const toggle = async (id: string) => {
    const t = todos.find((x) => x.id === id); if (!t) return;
    const next = !t.done;
    const patch = { done: next, completed_at: next ? new Date().toISOString() : null };
    setTodos((p) => p.map((x) => x.id === id ? { ...x, ...patch } : x));
    await supabase.from("todos").update(patch).eq("id", id);
    onChange();
  };
  const trash = async (id: string) => {
    const ts = new Date().toISOString();
    setTodos((p) => p.map((x) => x.id === id ? { ...x, trashed_at: ts } : x));
    await supabase.from("todos").update({ trashed_at: ts }).eq("id", id);
    onChange();
  };
  const restore = async (id: string) => {
    setTodos((p) => p.map((x) => x.id === id ? { ...x, trashed_at: null } : x));
    await supabase.from("todos").update({ trashed_at: null }).eq("id", id);
    onChange();
  };
  const purge = async (id: string) => {
    setTodos((p) => p.filter((x) => x.id !== id));
    await supabase.from("todos").delete().eq("id", id);
    onChange();
  };

  const active = todos.filter((t) => !t.trashed_at);
  const trashed = todos.filter((t) => t.trashed_at);
  const remaining = active.filter((t) => !t.done).length;

  return (
    <div className="mt-4 space-y-3">
      <div className="flex gap-2">
        <Input placeholder="Add a task…" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") add(); }} />
        <Button onClick={add} className="bg-blue-600 hover:bg-blue-700"><Plus className="h-4 w-4" /></Button>
      </div>
      <div className="flex items-center justify-between text-xs text-slate-500">
        <span>{remaining} remaining · {active.length} total</span>
        <button className="text-slate-600 hover:underline flex items-center gap-1" onClick={() => setShowTrash((s) => !s)}>
          <Archive className="h-3 w-3" /> Trash ({trashed.length})
        </button>
      </div>
      <div className="space-y-2">
        {active.length === 0 && <div className="text-center text-sm text-slate-400 py-8">No tasks yet.</div>}
        {active.map((t) => (
          <div key={t.id} className="flex items-start gap-2 bg-white border border-slate-200 rounded-md px-2 py-2">
            <button onClick={() => toggle(t.id)} className={`h-5 w-5 rounded border-2 grid place-content-center shrink-0 mt-0.5 ${t.done ? "bg-emerald-500 border-emerald-500" : "border-slate-300"}`}>
              {t.done && <Check className="h-3 w-3 text-white" strokeWidth={3} />}
            </button>
            <div className="flex-1 min-w-0">
              <div className={`text-sm ${t.done ? "line-through text-slate-400" : "text-slate-800"}`}>{t.text}</div>
              <div className="text-[10px] text-slate-400 mt-0.5">
                Added {fmtDate(t.created_at)}{t.completed_at ? ` · Done ${fmtDate(t.completed_at)}` : ""}
              </div>
            </div>
            <button onClick={() => trash(t.id)} className="text-slate-300 hover:text-red-500 mt-0.5" title="Move to Trash">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
      {showTrash && (
        <div className="border-t border-slate-200 pt-3 mt-3">
          <div className="text-xs font-semibold text-slate-600 mb-2">Trash</div>
          {trashed.length === 0 ? (
            <div className="text-center text-xs text-slate-400 py-4">Trash is empty</div>
          ) : (
            <div className="space-y-2">
              {trashed.map((t) => (
                <div key={t.id} className="flex items-start gap-2 bg-slate-100 border border-slate-200 rounded-md px-2 py-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-slate-600 line-through">{t.text}</div>
                    <div className="text-[10px] text-slate-400">Trashed {fmtDate(t.trashed_at!)}</div>
                  </div>
                  <Button variant="outline" size="sm" className="h-7 px-2" onClick={() => restore(t.id)}>
                    <RotateCcw className="h-3 w-3 mr-1" />Restore
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-red-600" onClick={() => purge(t.id)} title="Permanently delete">
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============ Daily Schedule Panel (cloud synced + trash) ============
type ScheduleItem = { id: string; time: string; title: string; created_at: string; trashed_at: string | null };

function SchedulePanel({ userId, onChange }: { userId: string; onChange: () => void }) {
  const [items, setItems] = useState<ScheduleItem[]>([]);
  const [time, setTime] = useState("09:00");
  const [title, setTitle] = useState("");
  const [showTrash, setShowTrash] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("schedule_items").select("*").order("time");
      setItems((data ?? []) as ScheduleItem[]);
    })();
  }, [userId]);

  const add = async () => {
    if (!title.trim()) return;
    const { data, error } = await supabase.from("schedule_items").insert({ user_id: userId, time, title: title.trim() }).select().single();
    if (error) return toast.error(error.message);
    setItems((p) => [...p, data as ScheduleItem].sort((a, b) => a.time.localeCompare(b.time)));
    setTitle(""); onChange();
  };
  const trash = async (id: string) => {
    const ts = new Date().toISOString();
    setItems((p) => p.map((x) => x.id === id ? { ...x, trashed_at: ts } : x));
    await supabase.from("schedule_items").update({ trashed_at: ts }).eq("id", id);
    onChange();
  };
  const restore = async (id: string) => {
    setItems((p) => p.map((x) => x.id === id ? { ...x, trashed_at: null } : x));
    await supabase.from("schedule_items").update({ trashed_at: null }).eq("id", id);
    onChange();
  };
  const purge = async (id: string) => {
    setItems((p) => p.filter((x) => x.id !== id));
    await supabase.from("schedule_items").delete().eq("id", id);
    onChange();
  };

  const active = items.filter((i) => !i.trashed_at);
  const trashed = items.filter((i) => i.trashed_at);

  return (
    <div className="mt-4 space-y-3 max-w-2xl mx-auto">
      <div className="flex gap-2">
        <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="w-28" />
        <Input placeholder="What's planned?" value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") add(); }} />
        <Button onClick={add} className="bg-blue-600 hover:bg-blue-700"><Plus className="h-4 w-4" /></Button>
      </div>
      <div className="flex justify-end text-xs">
        <button className="text-slate-600 hover:underline flex items-center gap-1" onClick={() => setShowTrash((s) => !s)}>
          <Archive className="h-3 w-3" /> Trash ({trashed.length})
        </button>
      </div>
      <div className="space-y-2">
        {active.length === 0 && <div className="text-center text-sm text-slate-400 py-8">No schedule items yet.</div>}
        {active.map((i) => (
          <div key={i.id} className="flex items-center gap-3 bg-white border border-slate-200 rounded-md px-3 py-2">
            <div className="font-mono text-sm font-semibold text-blue-600 w-16 shrink-0">{i.time}</div>
            <div className="flex-1 min-w-0">
              <div className="text-sm text-slate-800">{i.title}</div>
              <div className="text-[10px] text-slate-400">Added {fmtDate(i.created_at)}</div>
            </div>
            <button onClick={() => trash(i.id)} className="text-slate-300 hover:text-red-500" title="Trash">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
      {showTrash && (
        <div className="border-t border-slate-200 pt-3">
          <div className="text-xs font-semibold text-slate-600 mb-2">Trash</div>
          {trashed.length === 0 ? (
            <div className="text-center text-xs text-slate-400 py-4">Trash is empty</div>
          ) : (
            <div className="space-y-2">
              {trashed.map((i) => (
                <div key={i.id} className="flex items-center gap-2 bg-slate-100 border border-slate-200 rounded-md px-3 py-2">
                  <div className="font-mono text-xs text-slate-500 w-16 shrink-0">{i.time}</div>
                  <div className="flex-1 text-sm text-slate-600 line-through truncate">{i.title}</div>
                  <Button variant="outline" size="sm" className="h-7 px-2" onClick={() => restore(i.id)}>
                    <RotateCcw className="h-3 w-3 mr-1" />Restore
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-red-600" onClick={() => purge(i.id)}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============ Per-Habit Chart: "Ek habit kitne din ki" ============
function PerHabitChart({ habits, completions, days }: { habits: Habit[]; completions: Completion[]; days: number[] }) {
  const [mode, setMode] = useState<"line" | "candle">("line");
  const data = useMemo(() => {
    return habits.map((h) => {
      const doneDays = completions.filter((c) => c.habit_id === h.id).length;
      // candle: open = prev habit close, close = doneDays, high/low based on goal
      return { label: h.name.length > 8 ? h.name.slice(0, 8) + "…" : h.name, value: doneDays, goal: h.month_goal, color: h.color };
    });
  }, [habits, completions]);

  const candleData = data.map((d, i, arr) => {
    const open = i > 0 ? arr[i - 1].value : d.value;
    const close = d.value;
    return { ...d, open, close, high: Math.max(open, close, d.goal), low: Math.min(open, close), up: close >= open };
  });

  return (
    <Card className="bg-slate-900 text-white border-slate-800 p-3">
      <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
        <span className="font-semibold text-sm">Ek habit kitne din ki</span>
        <div className="flex items-center gap-1">
          <button onClick={() => setMode("line")} className={`text-[10px] px-2 py-1 rounded ${mode === "line" ? "bg-blue-500 text-white" : "bg-slate-800 text-slate-300"}`}>Line</button>
          <button onClick={() => setMode("candle")} className={`text-[10px] px-2 py-1 rounded ${mode === "candle" ? "bg-blue-500 text-white" : "bg-slate-800 text-slate-300"}`}>Candle</button>
        </div>
      </div>
      <div style={{ width: "100%", height: 180 }}>
        <ResponsiveContainer>
          {mode === "line" ? (
            <AreaChart data={data} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="phGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.6} />
                  <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="label" tick={{ fill: "#94a3b8", fontSize: 9 }} axisLine={{ stroke: "#334155" }} />
              <YAxis tick={{ fill: "#94a3b8", fontSize: 10 }} axisLine={{ stroke: "#334155" }} allowDecimals={false} />
              <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 6, fontSize: 11 }} formatter={(v: number) => [`${v} din`, "Done"]} />
              <Area type="monotone" dataKey="value" stroke="#3b82f6" strokeWidth={2} fill="url(#phGrad)" />
            </AreaChart>
          ) : (
            <ComposedChart data={candleData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
              <XAxis dataKey="label" tick={{ fill: "#94a3b8", fontSize: 9 }} axisLine={{ stroke: "#334155" }} />
              <YAxis tick={{ fill: "#94a3b8", fontSize: 10 }} axisLine={{ stroke: "#334155" }} allowDecimals={false} />
              <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 6, fontSize: 11 }} />
              <Bar dataKey={(d: any) => [d.low, d.high]} barSize={2} fill="#64748b" />
              <Bar dataKey={(d: any) => [Math.min(d.open, d.close), Math.max(d.open, d.close)]} barSize={12}>
                {candleData.map((d, i) => <Cell key={i} fill={d.up ? "#10b981" : "#ef4444"} />)}
              </Bar>
            </ComposedChart>
          )}
        </ResponsiveContainer>
      </div>
      <div className="text-[10px] text-slate-400 mt-1">{days.length} din ke month me — har habit kitne din complete ki</div>
    </Card>
  );
}

// ============ Per-Day Chart: "Ek din me kitni habits ki" ============
function PerDayChart({ habits, completions, days, month, year }: { habits: Habit[]; completions: Completion[]; days: number[]; month: number; year: number }) {
  const [mode, setMode] = useState<"line" | "candle">("line");
  const data = useMemo(() => {
    return days.map((d) => {
      const ds = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      const cnt = completions.filter((c) => c.date === ds).length;
      return { label: String(d), value: cnt, total: habits.length };
    });
  }, [days, completions, habits.length, month, year]);

  const candleData = data.map((d, i, arr) => {
    const open = i > 0 ? arr[i - 1].value : d.value;
    const close = d.value;
    return { ...d, open, close, high: Math.max(open, close, d.total), low: Math.min(open, close), up: close >= open };
  });

  return (
    <Card className="bg-slate-900 text-white border-slate-800 p-3">
      <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
        <span className="font-semibold text-sm">Ek din me kitni habits ki</span>
        <div className="flex items-center gap-1">
          <button onClick={() => setMode("line")} className={`text-[10px] px-2 py-1 rounded ${mode === "line" ? "bg-blue-500 text-white" : "bg-slate-800 text-slate-300"}`}>Line</button>
          <button onClick={() => setMode("candle")} className={`text-[10px] px-2 py-1 rounded ${mode === "candle" ? "bg-blue-500 text-white" : "bg-slate-800 text-slate-300"}`}>Candle</button>
        </div>
      </div>
      <div style={{ width: "100%", height: 180 }}>
        <ResponsiveContainer>
          {mode === "line" ? (
            <AreaChart data={data} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="pdGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.6} />
                  <stop offset="100%" stopColor="#f59e0b" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="label" tick={{ fill: "#94a3b8", fontSize: 9 }} axisLine={{ stroke: "#334155" }} interval={2} />
              <YAxis tick={{ fill: "#94a3b8", fontSize: 10 }} axisLine={{ stroke: "#334155" }} allowDecimals={false} />
              <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 6, fontSize: 11 }} formatter={(v: number) => [`${v} habits`, "Done"]} />
              <Area type="monotone" dataKey="value" stroke="#f59e0b" strokeWidth={2} fill="url(#pdGrad)" />
            </AreaChart>
          ) : (
            <ComposedChart data={candleData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
              <XAxis dataKey="label" tick={{ fill: "#94a3b8", fontSize: 9 }} axisLine={{ stroke: "#334155" }} interval={2} />
              <YAxis tick={{ fill: "#94a3b8", fontSize: 10 }} axisLine={{ stroke: "#334155" }} allowDecimals={false} />
              <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 6, fontSize: 11 }} />
              <Bar dataKey={(d: any) => [d.low, d.high]} barSize={2} fill="#64748b" />
              <Bar dataKey={(d: any) => [Math.min(d.open, d.close), Math.max(d.open, d.close)]} barSize={6}>
                {candleData.map((d, i) => <Cell key={i} fill={d.up ? "#10b981" : "#ef4444"} />)}
              </Bar>
            </ComposedChart>
          )}
        </ResponsiveContainer>
      </div>
      <div className="text-[10px] text-slate-400 mt-1">Har date — kitni habits complete (max {habits.length})</div>
    </Card>
  );
}


// ============ Trading-style Progress Chart ============
type Range = "D" | "W" | "M" | "Y";

function TradingChart({ completions, habitCount }: { completions: Completion[]; habitCount: number }) {
  const [range, setRange] = useState<Range>("M");
  const [mode, setMode] = useState<"line" | "candle">("line");

  const data = useMemo(() => {
    const byDay = new Map<string, number>();
    for (const c of completions) byDay.set(c.date, (byDay.get(c.date) ?? 0) + 1);
    const today = new Date();
    const buckets: { label: string; values: number[] }[] = [];

    if (range === "D") {
      for (let i = 29; i >= 0; i--) {
        const d = new Date(today); d.setDate(today.getDate() - i);
        buckets.push({ label: `${d.getDate()}/${d.getMonth() + 1}`, values: [byDay.get(d.toISOString().slice(0, 10)) ?? 0] });
      }
    } else if (range === "W") {
      for (let i = 11; i >= 0; i--) {
        const end = new Date(today); end.setDate(today.getDate() - i * 7);
        const vals: number[] = [];
        for (let j = 6; j >= 0; j--) {
          const d = new Date(end); d.setDate(end.getDate() - j);
          vals.push(byDay.get(d.toISOString().slice(0, 10)) ?? 0);
        }
        buckets.push({ label: `W${12 - i}`, values: vals });
      }
    } else if (range === "M") {
      for (let i = 11; i >= 0; i--) {
        const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
        const end = new Date(today.getFullYear(), today.getMonth() - i + 1, 0);
        const vals: number[] = [];
        for (let dd = new Date(d); dd <= end; dd.setDate(dd.getDate() + 1)) {
          vals.push(byDay.get(dd.toISOString().slice(0, 10)) ?? 0);
        }
        buckets.push({ label: MONTHS[d.getMonth()].slice(0, 3), values: vals });
      }
    } else {
      for (let i = 4; i >= 0; i--) {
        const y = today.getFullYear() - i;
        const start = new Date(y, 0, 1);
        const end = new Date(y, 11, 31);
        const vals: number[] = [];
        for (let dd = new Date(start); dd <= end; dd.setDate(dd.getDate() + 1)) {
          vals.push(byDay.get(dd.toISOString().slice(0, 10)) ?? 0);
        }
        buckets.push({ label: String(y), values: vals });
      }
    }

    return buckets.map((b, idx, arr) => {
      const sum = b.values.reduce((a, v) => a + v, 0);
      const avg = b.values.length ? sum / b.values.length : 0;
      const high = Math.max(0, ...b.values);
      const low = Math.min(...(b.values.length ? b.values : [0]));
      const open = idx > 0 ? arr[idx - 1].values.reduce((a, v) => a + v, 0) / Math.max(1, arr[idx - 1].values.length) : avg;
      const close = avg;
      return { label: b.label, sum, avg: +avg.toFixed(2), open: +open.toFixed(2), close: +close.toFixed(2), high, low, up: close >= open };
    });
  }, [completions, range]);

  const ranges: { v: Range; l: string }[] = [
    { v: "D", l: "Day" }, { v: "W", l: "Week" }, { v: "M", l: "Month" }, { v: "Y", l: "Year" },
  ];
  const last = data[data.length - 1];
  const prev = data[data.length - 2];
  const delta = last && prev ? last.close - prev.close : 0;
  const deltaPct = prev && prev.close > 0 ? (delta / prev.close) * 100 : 0;
  const up = delta >= 0;

  return (
    <Card className="bg-slate-900 text-white border-slate-800 p-3">
      <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-emerald-400" />
          <span className="font-semibold text-sm">Habit Performance</span>
        </div>
        <div className="flex items-center gap-1">
          {ranges.map((r) => (
            <button key={r.v} onClick={() => setRange(r.v)} className={`text-[10px] px-2 py-1 rounded ${range === r.v ? "bg-emerald-500 text-white" : "bg-slate-800 text-slate-300 hover:bg-slate-700"}`}>{r.l}</button>
          ))}
          <span className="w-1" />
          <button onClick={() => setMode("line")} className={`text-[10px] px-2 py-1 rounded ${mode === "line" ? "bg-blue-500 text-white" : "bg-slate-800 text-slate-300"}`}>Line</button>
          <button onClick={() => setMode("candle")} className={`text-[10px] px-2 py-1 rounded ${mode === "candle" ? "bg-blue-500 text-white" : "bg-slate-800 text-slate-300"}`}>Candle</button>
        </div>
      </div>
      {last && (
        <div className="flex items-baseline gap-2 mb-2">
          <span className="text-2xl font-bold tabular-nums">{last.close.toFixed(1)}</span>
          <span className={`text-xs font-semibold ${up ? "text-emerald-400" : "text-red-400"}`}>
            {up ? "▲" : "▼"} {Math.abs(delta).toFixed(2)} ({deltaPct.toFixed(1)}%)
          </span>
          <span className="text-[10px] text-slate-400 ml-auto">avg done / day · {habitCount} habits</span>
        </div>
      )}
      <div style={{ width: "100%", height: 200 }}>
        <ResponsiveContainer>
          {mode === "line" ? (
            <AreaChart data={data} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="trGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10b981" stopOpacity={0.6} />
                  <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="label" tick={{ fill: "#94a3b8", fontSize: 10 }} axisLine={{ stroke: "#334155" }} />
              <YAxis tick={{ fill: "#94a3b8", fontSize: 10 }} axisLine={{ stroke: "#334155" }} />
              <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 6, fontSize: 11 }} />
              <Area type="monotone" dataKey="close" stroke="#10b981" strokeWidth={2} fill="url(#trGrad)" />
            </AreaChart>
          ) : (
            <ComposedChart data={data} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
              <XAxis dataKey="label" tick={{ fill: "#94a3b8", fontSize: 10 }} axisLine={{ stroke: "#334155" }} />
              <YAxis tick={{ fill: "#94a3b8", fontSize: 10 }} axisLine={{ stroke: "#334155" }} />
              <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 6, fontSize: 11 }} />
              <Bar dataKey={(d: any) => [d.low, d.high]} barSize={2} fill="#64748b" />
              <Bar dataKey={(d: any) => [Math.min(d.open, d.close), Math.max(d.open, d.close)]} barSize={10}>
                {data.map((d, i) => <Cell key={i} fill={d.up ? "#10b981" : "#ef4444"} />)}
              </Bar>
              <ReferenceLine y={0} stroke="#334155" />
            </ComposedChart>
          )}
        </ResponsiveContainer>
      </div>
      <div className="text-[10px] text-slate-400 mt-2">
        {range === "D" ? "Last 30 days" : range === "W" ? "Last 12 weeks" : range === "M" ? "Last 12 months" : "Last 5 years"} ·
        {mode === "candle" ? " open/high/low/close per period" : " close = avg completions/day"}
      </div>
    </Card>
  );
}
