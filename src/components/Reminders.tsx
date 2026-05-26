import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Bell, BellRing, Trash2, Plus, Volume2 } from "lucide-react";
import { toast } from "sonner";

type Reminder = {
  id: string;
  label: string;
  time: string; // "HH:MM"
  enabled: boolean;
  alarm: boolean; // true = long ringing alarm; false = single beep
  lastFired?: string; // YYYY-MM-DD|HH:MM
};

const STORAGE_KEY = "habit_reminders_v1";

function loadReminders(): Reminder[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Reminder[]) : [];
  } catch {
    return [];
  }
}

function saveReminders(rs: Reminder[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(rs));
}

// Web Audio: digital watch style beep
let audioCtx: AudioContext | null = null;
function getCtx() {
  if (!audioCtx) {
    const AC = (window.AudioContext || (window as any).webkitAudioContext);
    audioCtx = new AC();
  }
  if (audioCtx.state === "suspended") audioCtx.resume();
  return audioCtx;
}

export function playBeep(times = 1) {
  const ctx = getCtx();
  const now = ctx.currentTime;
  for (let i = 0; i < times; i++) {
    const t = now + i * 0.18;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "square";
    osc.frequency.setValueAtTime(2000, t);
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.25, t + 0.005);
    gain.gain.linearRampToValueAtTime(0, t + 0.12);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.13);
  }
}

let alarmStop: (() => void) | null = null;
export function playAlarm(seconds = 20) {
  stopAlarm();
  const ctx = getCtx();
  const start = ctx.currentTime;
  const end = start + seconds;
  // pattern: 3 quick beeps every 1s
  let t = start;
  const oscs: OscillatorNode[] = [];
  while (t < end) {
    for (let i = 0; i < 3; i++) {
      const tt = t + i * 0.15;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "square";
      osc.frequency.setValueAtTime(2200, tt);
      gain.gain.setValueAtTime(0, tt);
      gain.gain.linearRampToValueAtTime(0.3, tt + 0.005);
      gain.gain.linearRampToValueAtTime(0, tt + 0.12);
      osc.connect(gain).connect(ctx.destination);
      osc.start(tt);
      osc.stop(tt + 0.13);
      oscs.push(osc);
    }
    t += 1;
  }
  alarmStop = () => {
    oscs.forEach((o) => {
      try { o.stop(); } catch {}
    });
    alarmStop = null;
  };
}

export function stopAlarm() {
  if (alarmStop) alarmStop();
}

export function RemindersButton() {
  const [open, setOpen] = useState(false);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [label, setLabel] = useState("");
  const [time, setTime] = useState("09:00");
  const [alarm, setAlarm] = useState(false);
  const [ringing, setRinging] = useState<string | null>(null);
  const remindersRef = useRef<Reminder[]>([]);

  useEffect(() => {
    const r = loadReminders();
    setReminders(r);
    remindersRef.current = r;
    // request notification permission once
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }
  }, []);

  useEffect(() => {
    remindersRef.current = reminders;
    saveReminders(reminders);
  }, [reminders]);

  // Tick every 15s; fire when current HH:MM matches and not already fired this minute
  useEffect(() => {
    const tick = () => {
      const now = new Date();
      const hhmm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
      const today = now.toISOString().slice(0, 10);
      const key = `${today}|${hhmm}`;
      let changed = false;
      const updated = remindersRef.current.map((r) => {
        if (r.enabled && r.time === hhmm && r.lastFired !== key) {
          changed = true;
          fireReminder(r);
          return { ...r, lastFired: key };
        }
        return r;
      });
      if (changed) setReminders(updated);
    };
    const id = setInterval(tick, 15000);
    tick();
    return () => clearInterval(id);
  }, []);

  const fireReminder = (r: Reminder) => {
    try {
      if (r.alarm) {
        playAlarm(25);
        setRinging(r.id);
      } else {
        playBeep(2);
      }
      if ("Notification" in window && Notification.permission === "granted") {
        new Notification("Habit Reminder", { body: r.label || r.time, icon: "/app-icon.png" });
      }
      toast(`⏰ ${r.label || "Reminder"} — ${r.time}`);
    } catch (e) {
      console.error(e);
    }
  };

  const add = () => {
    if (!label.trim()) return toast.error("Label zaroori hai");
    const r: Reminder = {
      id: crypto.randomUUID(),
      label: label.trim(),
      time,
      enabled: true,
      alarm,
    };
    setReminders((p) => [...p, r]);
    setLabel("");
    toast.success("Reminder add ho gaya");
  };

  const toggle = (id: string) =>
    setReminders((p) => p.map((r) => (r.id === id ? { ...r, enabled: !r.enabled } : r)));

  const remove = (id: string) => setReminders((p) => p.filter((r) => r.id !== id));

  const testSound = () => {
    getCtx(); // unlock on user gesture
    playBeep(3);
    toast.success("Beep test");
  };

  const stopRing = () => {
    stopAlarm();
    setRinging(null);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) getCtx(); }}>
        <DialogTrigger asChild>
          <Button variant="ghost" size="sm" className="relative">
            <Bell className="h-4 w-4 mr-1" />
            <span className="hidden sm:inline">Reminders</span>
            {reminders.filter((r) => r.enabled).length > 0 && (
              <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-blue-600" />
            )}
          </Button>
        </DialogTrigger>
        <DialogContent className="bg-white max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BellRing className="h-4 w-4 text-blue-600" /> Reminders & Alarms
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <div className="rounded-lg border border-slate-200 p-3 space-y-2">
              <Label className="text-xs text-slate-500">Naya reminder</Label>
              <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Morning workout" />
              <div className="flex items-center gap-2">
                <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="flex-1" />
                <label className="flex items-center gap-1 text-xs text-slate-600">
                  <Switch checked={alarm} onCheckedChange={setAlarm} /> Alarm
                </label>
              </div>
              <div className="flex gap-2">
                <Button onClick={add} className="flex-1 bg-blue-600 hover:bg-blue-700">
                  <Plus className="h-4 w-4 mr-1" /> Add
                </Button>
                <Button variant="outline" onClick={testSound} title="Test beep">
                  <Volume2 className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-[11px] text-slate-400">
                Note: App khula rehna chahiye (ya home-screen pe installed) taaki alarm time pe baje.
              </p>
            </div>

            <div className="space-y-2 max-h-72 overflow-y-auto">
              {reminders.length === 0 ? (
                <div className="text-center text-sm text-slate-500 py-6">Abhi koi reminder nahi.</div>
              ) : (
                reminders.map((r) => (
                  <div key={r.id} className="flex items-center gap-2 p-2 rounded-md border border-slate-200 bg-white">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-slate-900 truncate text-sm">{r.label}</div>
                      <div className="text-xs text-slate-500 flex items-center gap-2">
                        <span className="font-mono">{r.time}</span>
                        {r.alarm && <span className="px-1.5 py-0.5 rounded bg-orange-50 text-orange-600 text-[10px] font-semibold">ALARM</span>}
                      </div>
                    </div>
                    <Switch checked={r.enabled} onCheckedChange={() => toggle(r.id)} />
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-red-600" onClick={() => remove(r.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {ringing && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full text-center shadow-2xl animate-pulse">
            <BellRing className="h-12 w-12 mx-auto text-orange-500 mb-3" />
            <h3 className="text-xl font-bold text-slate-900 mb-1">⏰ Alarm</h3>
            <p className="text-slate-600 mb-4">
              {reminders.find((r) => r.id === ringing)?.label}
            </p>
            <Button onClick={stopRing} className="w-full bg-red-600 hover:bg-red-700">Stop Alarm</Button>
          </div>
        </div>
      )}
    </>
  );
}
