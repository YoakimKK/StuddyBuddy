import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient("https://zudndghrqhnsvmpahlfk.supabase.co", "sb_publishable_CDCPNXagxObZwyVzGqpqJQ_8MZhPEf4");
