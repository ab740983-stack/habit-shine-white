import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/auth")({ component: AuthPage });

function AuthPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  useEffect(() => {
    if (!loading && user) navigate({ to: "/" });
  }, [user, loading, navigate]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-md p-8 shadow-xl border-slate-200">
        <div className="flex flex-col items-center mb-6">
          <div className="h-12 w-12 rounded-2xl bg-blue-600 flex items-center justify-center mb-3">
            <CheckCircle2 className="h-7 w-7 text-white" />
          </div>
          <h1 className="text-2xl font-semibold text-slate-900">Habit Tracker</h1>
          <p className="text-sm text-slate-500 mt-1">Sign in to save your progress securely</p>
        </div>

        <Button
          variant="outline"
          className="w-full mb-4 border-slate-300"
          onClick={async () => {
            const r = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin });
            if (r.error) toast.error(r.error.message || "Google sign-in failed");
          }}
        >
          <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
          Continue with Google
        </Button>

        <div className="relative my-4">
          <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-slate-200"/></div>
          <div className="relative flex justify-center text-xs"><span className="bg-card px-2 text-slate-500">or</span></div>
        </div>

        <Tabs defaultValue="email">
          <TabsList className="grid grid-cols-1 w-full">
            <TabsTrigger value="email">Email</TabsTrigger>
          </TabsList>
          <TabsContent value="email"><EmailAuth /></TabsContent>
        </Tabs>
        <p className="text-xs text-slate-400 text-center mt-4">
          Phone OTP login coming soon — for now use Google or Email to sign in securely.
        </p>
      </Card>
    </div>
  );
}

function EmailAuth() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email, password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        toast.success("Check your email to verify your account");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (e: any) { toast.error(e.message); }
    finally { setBusy(false); }
  };

  return (
    <div className="space-y-3 mt-4">
      <div><Label>Email</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@email.com" /></div>
      <div><Label>Password</Label><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" /></div>
      <Button className="w-full bg-blue-600 hover:bg-blue-700" onClick={submit} disabled={busy}>
        {mode === "signin" ? "Sign In" : "Create Account"}
      </Button>
      <button type="button" className="text-sm text-blue-600 hover:underline w-full text-center" onClick={() => setMode(mode === "signin" ? "signup" : "signin")}>
        {mode === "signin" ? "New here? Create an account" : "Have an account? Sign in"}
      </button>
    </div>
  );
}

function PhoneAuth() {
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  const send = async () => {
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({ phone });
      if (error) throw error;
      setSent(true);
      toast.success("OTP sent");
    } catch (e: any) { toast.error(e.message); }
    finally { setBusy(false); }
  };
  const verify = async () => {
    setBusy(true);
    try {
      const { error } = await supabase.auth.verifyOtp({ phone, token: otp, type: "sms" });
      if (error) throw error;
    } catch (e: any) { toast.error(e.message); }
    finally { setBusy(false); }
  };

  return (
    <div className="space-y-3 mt-4">
      <div><Label>Phone (with country code)</Label><Input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+919876543210" disabled={sent} /></div>
      {sent && (<div><Label>OTP</Label><Input value={otp} onChange={(e) => setOtp(e.target.value)} placeholder="6-digit code" /></div>)}
      {!sent
        ? <Button className="w-full bg-blue-600 hover:bg-blue-700" onClick={send} disabled={busy || !phone}>Send OTP</Button>
        : <Button className="w-full bg-blue-600 hover:bg-blue-700" onClick={verify} disabled={busy || !otp}>Verify</Button>}
    </div>
  );
}
