
CREATE TABLE public.habits (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  category TEXT,
  color TEXT DEFAULT '#3b82f6',
  month_goal INT NOT NULL DEFAULT 25,
  frequency TEXT NOT NULL DEFAULT 'daily',
  archived BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.habits TO authenticated;
GRANT ALL ON public.habits TO service_role;
ALTER TABLE public.habits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "habits_select_own" ON public.habits FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "habits_insert_own" ON public.habits FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "habits_update_own" ON public.habits FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "habits_delete_own" ON public.habits FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TABLE public.habit_completions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  habit_id UUID REFERENCES public.habits(id) ON DELETE CASCADE NOT NULL,
  date DATE NOT NULL,
  completed BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(habit_id, date)
);
CREATE INDEX habit_completions_user_date_idx ON public.habit_completions(user_id, date);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.habit_completions TO authenticated;
GRANT ALL ON public.habit_completions TO service_role;
ALTER TABLE public.habit_completions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "completions_select_own" ON public.habit_completions FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "completions_insert_own" ON public.habit_completions FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "completions_update_own" ON public.habit_completions FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "completions_delete_own" ON public.habit_completions FOR DELETE TO authenticated USING (auth.uid() = user_id);
