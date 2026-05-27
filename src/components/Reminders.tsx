import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Bell, BellRing, Trash2, Plus, Volume2, Upload } from "lucide-react";
import { toast } from "sonner";

const DIGITAL_ALARM_URL = "/sounds/digital-alarm.mp3";

type SoundId = "tick" | "beep" | "alarm" | "digital" | string; // string = custom:<id>

type CustomSound = {
  id: string; // custom:xxx
  name: string;
  dataUrl: string;
};

type Reminder = {
  id: string;
  label: string;
  time: string; // "HH:MM"
  enabled: boolean;
  sound: SoundId; // tick / beep / alarm / custom:<id>
  lastFired?: string;
};

const STORAGE_KEY = "habit_reminders_v2";
const SOUNDS_KEY = "habit_custom_sounds_v1";

function loadReminders(): Reminder[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as Reminder[];
    // migrate from v1
    const old = localStorage.getItem("habit_reminders_v1");
    if (old) {
      const arr = JSON.parse(old) as any[];
      return arr.map((r) => ({
        id: r.id,
        label: r.label,
        time: r.time,
        enabled: r.enabled,
        sound: r.alarm ? "alarm" : "tick",
        lastFired: r.lastFired,
      }));
    }
    return [];
  } catch {
    return [];
  }
}
function saveReminders(rs: Reminder[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(rs));
}
function loadCustomSounds(): CustomSound[] {
  try {
    const raw = localStorage.getItem(SOUNDS_KEY);
    return raw ? (JSON.parse(raw) as CustomSound[]) : [];
  } catch {
    return [];
  }
}
function saveCustomSounds(s: CustomSound[]) {
  localStorage.setItem(SOUNDS_KEY, JSON.stringify(s));
}

// Web Audio — singleton context
let audioCtx: AudioContext | null = null;
let audioUnlocked = false;
function getCtx(): AudioContext | null {
  try {
    if (!audioCtx) {
      const AC = (window.AudioContext || (window as any).webkitAudioContext);
      if (!AC) return null;
      audioCtx = new AC();
    }
    if (audioCtx.state === "suspended") audioCtx.resume().catch(() => {});
    return audioCtx;
  } catch { return null; }
}

// Unlock audio on first user gesture — required on iOS Safari & most mobile browsers.
// Without this, NO sound plays from timers/intervals on phones.
export function unlockAudio() {
  if (audioUnlocked) return;
  const ctx = getCtx();
  if (!ctx) return;
  try {
    const buf = ctx.createBuffer(1, 1, 22050);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    src.start(0);
    const a = new Audio(
      "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA="
    );
    a.play().catch(() => {});
    audioUnlocked = true;
  } catch {}
}

function tryVibrate(pattern: number | number[]) {
  try { (navigator as any).vibrate?.(pattern); } catch {}
}

// Lower frequencies (800-1400Hz) are MUCH louder on phone speakers than 2000-3000Hz.
function tickOnce(ctx: AudioContext, at: number, freq = 1200) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "square";
  osc.frequency.setValueAtTime(freq, at);
  gain.gain.setValueAtTime(0, at);
  gain.gain.linearRampToValueAtTime(0.5, at + 0.003);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.07);
  osc.connect(gain).connect(ctx.destination);
  osc.start(at);
  osc.stop(at + 0.09);
}

let tickStop: (() => void) | null = null;
export function playTickTock(seconds = 8) {
  stopAll();
  const ctx = getCtx();
  if (!ctx) return;
  const start = ctx.currentTime;
  const end = start + seconds;
  let t = start;
  let high = true;
  while (t < end) {
    tickOnce(ctx, t, high ? 1400 : 900);
    high = !high;
    t += 0.5;
  }
  tryVibrate([80, 420, 80, 420, 80]);
  tickStop = () => {};
}

export function playBeep(times = 3) {
  const ctx = getCtx();
  if (!ctx) return;
  const now = ctx.currentTime;
  for (let i = 0; i < times; i++) {
    const t = now + i * 0.22;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "square";
    osc.frequency.setValueAtTime(1000, t);
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.55, t + 0.005);
    gain.gain.linearRampToValueAtTime(0, t + 0.15);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.16);
  }
  tryVibrate([150, 100, 150]);
}

let alarmStop: (() => void) | null = null;
export function playAlarm(seconds = 20) {
  stopAll();
  const ctx = getCtx();
  if (!ctx) return;
  const start = ctx.currentTime;
  const end = start + seconds;
  const oscs: OscillatorNode[] = [];
  let t = start;
  while (t < end) {
    for (let i = 0; i < 3; i++) {
      const tt = t + i * 0.18;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "square";
      osc.frequency.setValueAtTime(1100, tt);
      gain.gain.setValueAtTime(0, tt);
      gain.gain.linearRampToValueAtTime(0.6, tt + 0.005);
      gain.gain.linearRampToValueAtTime(0, tt + 0.15);
      osc.connect(gain).connect(ctx.destination);
      osc.start(tt);
      osc.stop(tt + 0.16);
      oscs.push(osc);
    }
    t += 1;
  }
  // Long vibration as fallback (Android — works even if speaker volume is low)
  tryVibrate([500, 200, 500, 200, 500, 200, 500, 200, 500]);
  alarmStop = () => {
    oscs.forEach((o) => { try { o.stop(); } catch {} });
    try { (navigator as any).vibrate?.(0); } catch {}
    alarmStop = null;
  };
}

let customAudio: HTMLAudioElement | null = null;
export function playCustom(dataUrl: string, loop = false) {
  stopAll();
  try {
    customAudio = new Audio(dataUrl);
    customAudio.loop = loop;
    customAudio.volume = 1;
    const p = customAudio.play();
    if (p && typeof p.catch === "function") p.catch(() => {});
    tryVibrate([400, 200, 400, 200, 400]);
  } catch {}
}

export function playDigitalAlarm(seconds = 20) {
  playCustom(DIGITAL_ALARM_URL, true);
  setTimeout(() => { if (customAudio) { try { customAudio.pause(); } catch {} customAudio = null; } }, seconds * 1000);
}

export function stopAll() {
  if (alarmStop) alarmStop();
  if (tickStop) tickStop();
  if (customAudio) { try { customAudio.pause(); customAudio.currentTime = 0; } catch {} customAudio = null; }
  try { (navigator as any).vibrate?.(0); } catch {}
}

export function RemindersButton() {
  const [open, setOpen] = useState(false);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [customSounds, setCustomSounds] = useState<CustomSound[]>([]);
  const [label, setLabel] = useState("");
  const [time, setTime] = useState("09:00");
  const [sound, setSound] = useState<SoundId>("digital");
  const [ringing, setRinging] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const remindersRef = useRef<Reminder[]>([]);
  const soundsRef = useRef<CustomSound[]>([]);

  useEffect(() => {
    const r = loadReminders();
    setReminders(r);
    remindersRef.current = r;
    const cs = loadCustomSounds();
    setCustomSounds(cs);
    soundsRef.current = cs;
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }
    // Global one-time unlock — first tap/click anywhere unlocks audio for the session.
    // This is REQUIRED on mobile Chrome / iOS Safari, otherwise no sound will ever play.
    const unlock = () => {
      unlockAudio();
      window.removeEventListener("touchstart", unlock);
      window.removeEventListener("touchend", unlock);
      window.removeEventListener("click", unlock);
      window.removeEventListener("keydown", unlock);
    };
    window.addEventListener("touchstart", unlock, { passive: true });
    window.addEventListener("touchend", unlock, { passive: true });
    window.addEventListener("click", unlock);
    window.addEventListener("keydown", unlock);
    return () => {
      window.removeEventListener("touchstart", unlock);
      window.removeEventListener("touchend", unlock);
      window.removeEventListener("click", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);


  useEffect(() => { remindersRef.current = reminders; saveReminders(reminders); }, [reminders]);
  useEffect(() => { soundsRef.current = customSounds; saveCustomSounds(customSounds); }, [customSounds]);

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
    const id = setInterval(tick, 5000);
    tick();
    const onVis = () => { if (document.visibilityState === "visible") tick(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", onVis); };

  }, []);

  const fireReminder = (r: Reminder) => {
    try {
      if (r.sound === "alarm") {
        playAlarm(25);
        setRinging(r.id);
      } else if (r.sound === "digital") {
        playDigitalAlarm(25);
        setRinging(r.id);
      } else if (r.sound === "beep") {
        playBeep(3);
      } else if (r.sound === "tick") {
        playTickTock(6);
      } else if (r.sound.startsWith("custom:")) {
        const cs = soundsRef.current.find((s) => s.id === r.sound);
        if (cs) playCustom(cs.dataUrl);
        else playTickTock(4);
      }
      if ("Notification" in window && Notification.permission === "granted") {
        new Notification("Habit Reminder", { body: r.label || r.time, icon: "/app-icon.png" });
      }
      toast(`⏰ ${r.label || "Reminder"} — ${r.time}`);
    } catch (e) { console.error(e); }
  };

  const add = () => {
    if (!label.trim()) return toast.error("Label zaroori hai");
    const r: Reminder = {
      id: crypto.randomUUID(),
      label: label.trim(),
      time,
      enabled: true,
      sound,
    };
    setReminders((p) => [...p, r]);
    setLabel("");
    toast.success("Reminder add ho gaya");
  };

  const toggle = (id: string) =>
    setReminders((p) => p.map((r) => (r.id === id ? { ...r, enabled: !r.enabled } : r)));
  const remove = (id: string) => setReminders((p) => p.filter((r) => r.id !== id));

  const onUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!f.type.startsWith("audio/")) return toast.error("Sirf audio file");
    if (f.size > 1024 * 1024 * 2) return toast.error("Max 2MB");
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const cs: CustomSound = { id: `custom:${crypto.randomUUID()}`, name: f.name.replace(/\.[^.]+$/, ""), dataUrl };
      setCustomSounds((p) => [...p, cs]);
      setSound(cs.id);
      toast.success(`Sound add hua: ${cs.name}`);
    };
    reader.readAsDataURL(f);
    if (fileRef.current) fileRef.current.value = "";
  };

  const removeSound = (id: string) => {
    setCustomSounds((p) => p.filter((s) => s.id !== id));
    if (sound === id) setSound("tick");
  };

  const testCurrent = () => {
    getCtx();
    if (sound === "tick") playTickTock(3);
    else if (sound === "beep") playBeep(2);
    else if (sound === "alarm") playAlarm(3);
    else if (sound === "digital") playDigitalAlarm(4);
    else {
      const cs = customSounds.find((s) => s.id === sound);
      if (cs) playCustom(cs.dataUrl);
    }
  };

  const stopRing = () => { stopAll(); setRinging(null); };

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
              </div>

              <div className="flex items-center gap-2">
                <Select value={sound} onValueChange={(v) => setSound(v)}>
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="Sound" />
                  </SelectTrigger>
                  <SelectContent className="bg-white">
                    <SelectItem value="digital">⏰ Digital Alarm Clock (recommended)</SelectItem>
                    <SelectItem value="tick">⏱ Tick-Tock (digital watch)</SelectItem>
                    <SelectItem value="beep">🔔 Beep</SelectItem>
                    <SelectItem value="alarm">🚨 Alarm (long ring)</SelectItem>
                    {customSounds.map((s) => (
                      <SelectItem key={s.id} value={s.id}>🎵 {s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button variant="outline" size="icon" onClick={testCurrent} title="Test sound">
                  <Volume2 className="h-4 w-4" />
                </Button>
              </div>

              <div className="flex items-center gap-2">
                <input ref={fileRef} type="file" accept="audio/*" onChange={onUpload} className="hidden" />
                <Button variant="outline" size="sm" className="flex-1" onClick={() => fileRef.current?.click()}>
                  <Upload className="h-3.5 w-3.5 mr-1" /> Custom sound add karo
                </Button>
                <Button onClick={add} className="flex-1 bg-blue-600 hover:bg-blue-700">
                  <Plus className="h-4 w-4 mr-1" /> Add reminder
                </Button>
              </div>

              {customSounds.length > 0 && (
                <div className="pt-1 space-y-1">
                  <div className="text-[11px] text-slate-500">Aapke sounds:</div>
                  {customSounds.map((s) => (
                    <div key={s.id} className="flex items-center gap-2 text-xs">
                      <span className="flex-1 truncate text-slate-700">🎵 {s.name}</span>
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => { getCtx(); playCustom(s.dataUrl); }}>
                        <Volume2 className="h-3 w-3" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-6 w-6 text-red-500" onClick={() => removeSound(s.id)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              <p className="text-[11px] text-slate-400">
                Note: App khula rehna chahiye (ya home-screen pe installed) taaki sound time pe baje.
              </p>
            </div>

            <div className="space-y-2 max-h-72 overflow-y-auto">
              {reminders.length === 0 ? (
                <div className="text-center text-sm text-slate-500 py-6">Abhi koi reminder nahi.</div>
              ) : (
                reminders.map((r) => {
                  const soundLabel =
                    r.sound === "tick" ? "Tick-Tock" :
                    r.sound === "beep" ? "Beep" :
                    r.sound === "alarm" ? "Alarm" :
                    r.sound === "digital" ? "Digital Alarm" :
                    customSounds.find((s) => s.id === r.sound)?.name || "Custom";
                  return (
                    <div key={r.id} className="flex items-center gap-2 p-2 rounded-md border border-slate-200 bg-white">
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-slate-900 truncate text-sm">{r.label}</div>
                        <div className="text-xs text-slate-500 flex items-center gap-2">
                          <span className="font-mono">{r.time}</span>
                          <span className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 text-[10px] font-semibold">{soundLabel}</span>
                        </div>
                      </div>
                      <Switch checked={r.enabled} onCheckedChange={() => toggle(r.id)} />
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-red-600" onClick={() => remove(r.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  );
                })
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
