"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";
import type { QueryData } from "@supabase/supabase-js";
import PomodoroTimer from "@/components/pomodorotimer";


type PlanItem = {
  id: string;
  user_id: string;
  plan_date: string; // YYYY-MM-DD
  title: string;
  minutes: number;
  done: boolean;
  created_at?: string;
  assessments: {title: string; courses: {title: string}[]}[];
};
 

function toYYYYMMDD(d: Date) {
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

function addDays(base: Date, days: number) {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

function prettyDate(yyyyMmDd: string) {
  const [y, m, d] = yyyyMmDd.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function progressStats(dayItems: PlanItem[]) {
  const totalTasks = dayItems.length;
  const doneTasks = dayItems.filter((x) => x.done).length;

  const totalMinutes = dayItems.reduce((sum, x) => sum + (x.minutes || 0), 0);
  const doneMinutes = dayItems.reduce(
    (sum, x) => sum + (x.done ? (x.minutes || 0) : 0),
    0
  );

  const pct = totalTasks === 0 ? 0 : Math.round((doneTasks / totalTasks) * 100);

  return { totalTasks, doneTasks, totalMinutes, doneMinutes, pct };
}

function formatShortfall(mins: number) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (mins <= 0) return "0m";
  if (h <= 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}



export default function PlanPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [items, setItems] = useState<PlanItem[]>([]);

  const [shortfallMinutes, setShortfallMinutes] = useState<number>(0);


  const dayDates = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Array.from({ length: 7 }, (_, i) => toYYYYMMDD(addDays(today, i)));
  }, []);

  const grouped = useMemo(() => {
    const map = new Map<string, PlanItem[]>();
    dayDates.forEach((d) => map.set(d, []));
    items.forEach((it) => {
      if (!map.has(it.plan_date)) map.set(it.plan_date, []);
      map.get(it.plan_date)!.push(it);
    });

    // sorting each day's items: incomplete first, then by minutes desc
    for (const [k, arr] of map.entries()) {
      arr.sort((a, b) => Number(a.done) - Number(b.done) || b.minutes - a.minutes);
      map.set(k, arr);
    }
    return map;
  }, [items, dayDates]);

  async function requireSession() {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    if (!data.session) {
      router.push("/login");
      return null;
    }
    return data.session.user.id;
  }

    const todayDate = dayDates[0];
    const todayItems = grouped.get(todayDate) ?? [];
    const today = progressStats(todayItems);

  async function loadPlan() {
    setLoading(true);
    setError(null);

    try {
      const userId = await requireSession();
      if (!userId) return;

      const query = supabase
        .from("plan_items")
        .select("id,user_id,plan_date,title,minutes,done,created_at,assessments(title,courses(title))")
        .eq("user_id", userId)
        .in("plan_date", dayDates)
        .order("plan_date", { ascending: true })
        .order("created_at", { ascending: true });

      type PlanRow = QueryData<typeof query>;

      const { data, error } = await query;
      if (error) throw error;

      setItems(data ?? []);

      const { data: meta, error: metaErr } = await supabase
        .from("plan_meta")
        .select("shortfall_minutes")
        .eq("user_id", userId)
        .single();

      if (!metaErr && meta) setShortfallMinutes(meta.shortfall_minutes ?? 0);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load plan");
    } finally {
      setLoading(false);
    }

    
  }

  useEffect(() => {
    loadPlan();
    
  }, []);

  async function toggleDone(item: PlanItem) {
    setSavingId(item.id);
    setError(null);

    
    setItems((prev) =>
      prev.map((x) => (x.id === item.id ? { ...x, done: !x.done } : x))
    );

    const userId = await requireSession();
    if (!userId) {
      setSavingId(null);
      return;
    }

    const { error } = await supabase
    .from("plan_items")
    .update({ done: !item.done })
    .eq("id", item.id)
    .eq("user_id", userId);

    if (error) {
      // rollback
      setItems((prev) =>
        prev.map((x) => (x.id === item.id ? { ...x, done: item.done } : x))
      );
      setError(error.message);
    }

    setSavingId(null);

    const { data: meta, error: metaErr } = await supabase
    .from("plan_meta")
    .select("shortfall_minutes")
    .eq("user_id", userId)
    .single();

    if (!metaErr && meta) setShortfallMinutes(meta.shortfall_minutes ?? 0);

  }

  async function clearWeek() {
    const ok = confirm("Delete all plan items for the next 7 days?");
    if (!ok) return;

    setError(null);
    try {
      const userId = await requireSession();
      if (!userId) return;

      const { error } = await supabase
        .from("plan_items")
        .delete()
        .eq("user_id", userId)
        .in("plan_date", dayDates);

      if (error) throw error;

      setItems([]);
    } catch (e: any) {
      setError(e?.message ?? "Failed to clear plan");
    }
  }

  

  function minutesSummary(dayItems: PlanItem[]) {
    const total = dayItems.reduce((sum, it) => sum + (it.minutes || 0), 0);
    const done = dayItems.reduce((sum, it) => sum + (it.done ? it.minutes : 0), 0);
    return { total, done };
  }

  return (
    <div className="min-h-screen bg-gray-100 px-4 py-8">
      <div className="mx-auto max-w-4xl">
        <div className="flex items-end justify-between gap-4 mb-6">
          <div>
            <h1 className="text-gray-800 text-2xl font-bold">7-Day Plan</h1>
            <p className="text-gray-600">Your generated study blocks for the next week.</p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => router.push("/")}
              className="text-gray-600 text-sm px-3 py-2 rounded-md bg-white border hover:bg-gray-50"
            >
              Home
            </button>
            <button
              onClick={() => router.push("/availability")}
              className="text-gray-600 text-sm px-3 py-2 rounded-md bg-white border hover:bg-gray-50"
            >
              Availability
            </button>
            <button
              onClick={loadPlan}
              className="text-gray-600 text-sm px-3 py-2 rounded-md bg-white border hover:bg-gray-50"
            >
              Refresh
            </button>
            <button
              onClick={clearWeek}
              className="text-gray-600 text-sm px-3 py-2 rounded-md bg-white border hover:bg-gray-50"
            >
              Clear week
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2">
            <div className="bg-white rounded-xl shadow p-5">
              {loading ? (
                <p className="text-gray-600">Loading...</p>
              ) : (
                <div className="space-y-5">
                  {error && <p className="text-sm text-red-600">{error}</p>}

                  <div className="rounded-lg border bg-gray-50 p-4">
                    <div className="flex items-center justify-between">
                      <div className="font-semibold text-gray-900">Today</div>
                      <div className="text-sm text-gray-700">
                        {today.doneTasks}/{today.totalTasks} tasks completed
                      </div>
                    </div>

                    <div className="mt-2 h-2 w-full rounded bg-gray-200 overflow-hidden">
                      <div
                        className="h-2 bg-black transition-all"
                        style={{ width: `${clamp(today.pct, 0, 100)}%` }}
                      />
                    </div>

                    <div className="mt-2 text-xs text-gray-600">
                      {today.pct}% done
                      {today.totalMinutes > 0 && (
                        <>
                          {" "}
                          • Minutes: {(today.doneMinutes / 60).toFixed(1)}h /{" "}
                          {(today.totalMinutes / 60).toFixed(1)}h
                        </>
                      )}
                    </div>
                  </div>

                  {dayDates.map((date) => {
                    const dayItems = grouped.get(date) ?? [];
                    const { total, done } = minutesSummary(dayItems);
                    const totalHrs = (total / 60).toFixed(1);
                    const doneHrs = (done / 60).toFixed(1);

                    return (
                      <div key={date} className="border rounded-lg p-4">
                        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                          <div>
                            <div className="font-semibold text-gray-900">
                              {prettyDate(date)}
                            </div>
                            <div className="text-sm text-gray-600">
                              Planned: <span className="font-medium">{totalHrs}h</span>{" "}
                              • Done: <span className="font-medium">{doneHrs}h</span>
                            </div>
                          </div>

                          <button
                            onClick={() => router.push("/assessments")}
                            className="text-gray-600 text-sm px-3 py-2 rounded-md border bg-white hover:bg-gray-50"
                            title="Add/edit assessments"
                          >
                            Edit assessments
                          </button>
                        </div>

                        {dayItems.length === 0 ? (
                          <p className="mt-3 text-sm text-gray-600">
                            No tasks scheduled for this day.
                          </p>
                        ) : (
                          <div className="mt-3 space-y-2">
                            {dayItems.map((it) => {
                              const courseTitle = it.assessments?.[0]?.courses?.[0]?.title;

                              return (
                                <label
                                  key={it.id}
                                  className="flex items-start gap-3 rounded-md border p-3 hover:bg-gray-50 cursor-pointer"
                                >
                                  <input
                                    type="checkbox"
                                    checked={it.done}
                                    onChange={() => toggleDone(it)}
                                    disabled={savingId === it.id}
                                    className="mt-1"
                                  />

                                  <div className="flex-1">
                                    <div
                                      className={`font-medium ${
                                        it.done ? "line-through text-gray-500" : "text-gray-900"
                                      }`}
                                    >
                                      {it.title}
                                      {courseTitle && (
                                        <span className="text-sm text-gray-500">
                                          {" "}
                                          • {courseTitle}
                                        </span>
                                      )}
                                    </div>
                                    <div className="text-xs text-gray-500">
                                      {it.minutes} minutes
                                      {savingId === it.id ? " • saving..." : ""}
                                    </div>
                                  </div>
                                </label>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <div className="lg:col-span-1">
            <div className="sticky top-4 space-y-4">
              <PomodoroTimer />
                    {shortfallMinutes > 0 ? (
                    <div className="rounded-xl border border-red-200 bg-red-50 p-4">
                        <div className="font-semibold text-red-800">You’re overwhelmed</div>
                        <p className="mt-1 text-sm text-red-700">
                        Your next 7 days are short by{" "}
                        <span className="font-semibold">{formatShortfall(shortfallMinutes)}</span>.
                        </p>
                        <ul className="mt-2 text-sm text-red-700 list-disc pl-5">
                        <li>Reduce estimated hours for tasks</li>
                        <li>Increase daily availability</li>
                        <li>Split large assessments into smaller chunks</li>
                        </ul>
                    </div>
                    ) : (
                    <div className="rounded-xl border bg-white p-4">
                        <div className="font-semibold text-gray-900">Workload looks manageable</div>
                        <p className="mt-1 text-sm text-gray-600">
                        Your plan fits your availability for the next 7 days.
                        </p>
                    </div>
                    )}

            </div>
          </div>
        </div>

        <p className="text-xs text-gray-500 mt-4">
          If this page is empty, generate a plan from your dashboard (and make sure you have assessments due in the next 7 days).
        </p>
      </div>
    </div>
  );
}
