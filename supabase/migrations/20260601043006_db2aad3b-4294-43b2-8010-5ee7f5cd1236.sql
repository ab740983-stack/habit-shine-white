
-- Todos table
CREATE TABLE public.todos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  text TEXT NOT NULL,
  done BOOLEAN NOT NULL DEFAULT false,
  completed_at TIMESTAMPTZ,
  trashed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.todos TO authenticated;
GRANT ALL ON public.todos TO service_role;
ALTER TABLE public.todos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "todos_select_own" ON public.todos FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "todos_insert_own" ON public.todos FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "todos_update_own" ON public.todos FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "todos_delete_own" ON public.todos FOR DELETE USING (auth.uid() = user_id);

-- Schedule items table
CREATE TABLE public.schedule_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  time TEXT NOT NULL,
  title TEXT NOT NULL,
  trashed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.schedule_items TO authenticated;
GRANT ALL ON public.schedule_items TO service_role;
ALTER TABLE public.schedule_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "schedule_select_own" ON public.schedule_items FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "schedule_insert_own" ON public.schedule_items FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "schedule_update_own" ON public.schedule_items FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "schedule_delete_own" ON public.schedule_items FOR DELETE USING (auth.uid() = user_id);
