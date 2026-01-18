"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";
import GeneratePlanButton from "@/components/generateplanbutton";
import PomodoroTimer from "@/components/pomodorotimer";

type PlanItem = {
  id: string;
  plan_date: string;
  title: string;
  minutes: number;
  done: boolean;
};

type Assessment = {
  id: string;
  title: string;
  due_date: string;
  estimated_hours: number;
  status?: string;
  courses?: { title: string } | { title: string }[] | null;
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
  return dt.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatShortfall(mins: number) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (mins <= 0) return "0m";
  if (h <= 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function getCourseTitle(assessment: Assessment) {
  const courses = assessment.courses;
  if (!courses) return null;
  if (Array.isArray(courses)) return courses[0]?.title ?? null;
  return courses.title ?? null;
}

function summaryStats(items: PlanItem[]) {
  const totalTasks = items.length;
  const doneTasks = items.filter((x) => x.done).length;
  const totalMinutes = items.reduce((sum, x) => sum + (x.minutes || 0), 0);
  const doneMinutes = items.reduce((sum, x) => sum + (x.done ? x.minutes || 0 : 0), 0);
  return { totalTasks, doneTasks, totalMinutes, doneMinutes };
}

export default function HomePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [items, setItems] = useState<PlanItem[]>([]);
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [shortfallMinutes, setShortfallMinutes] = useState(0);

  const dayDates = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Array.from({ length: 7 }, (_, i) => toYYYYMMDD(addDays(today, i)));
  }, []);

  const todayDate = dayDates[0];

  const weekTotals = useMemo(() => {
    const totals = new Map<string, number>();
    dayDates.forEach((d) => totals.set(d, 0));
    items.forEach((it) => {
      const prev = totals.get(it.plan_date) ?? 0;
      totals.set(it.plan_date, prev + (it.minutes || 0));
    });
    return totals;
  }, [items, dayDates]);

  const todayItems = useMemo(
    () => items.filter((it) => it.plan_date === todayDate),
    [items, todayDate]
  );

  const statsToday = useMemo(() => summaryStats(todayItems), [todayItems]);

  const weekMinutesPlanned = useMemo(
    () => items.reduce((sum, it) => sum + (it.minutes || 0), 0),
    [items]
  );

  const nextAssessment = assessments[0] ?? null;

  async function requireSession() {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    if (!data.session) {
      router.push("/login");
      return null;
    }
    return data.session.user.id;
  }

  async function loadDashboard() {
    setLoading(true);
    setError(null);

    try {
      const userId = await requireSession();
      if (!userId) return;

      const today = dayDates[0];
      const lastDay = dayDates[dayDates.length - 1];

      const [planRes, metaRes, assessmentRes] = await Promise.all([
        supabase
          .from("plan_items")
          .select("id,plan_date,title,minutes,done")
          .eq("user_id", userId)
          .in("plan_date", dayDates)
          .order("plan_date", { ascending: true }),
        supabase
          .from("plan_meta")
          .select("shortfall_minutes")
          .eq("user_id", userId)
          .single(),
        supabase
          .from("assessments")
          .select("id,title,due_date,estimated_hours,status,courses(title)")
          .neq("status", "done")
          .gte("due_date", today)
          .lte("due_date", lastDay)
          .order("due_date", { ascending: true })
          .limit(5),
      ]);

      if (planRes.error) throw planRes.error;
      if (assessmentRes.error) throw assessmentRes.error;

      setItems((planRes.data ?? []) as PlanItem[]);
      setAssessments((assessmentRes.data ?? []) as Assessment[]);

      if (!metaRes.error && metaRes.data) {
        setShortfallMinutes(metaRes.data.shortfall_minutes ?? 0);
      }
    } catch (e: any) {
      setError(e?.message ?? "Failed to load dashboard");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDashboard();
    
  }, []);

  return (
    <div className="min-h-screen bg-gray-100 px-4 py-8">
      <div className="mx-auto max-w-4xl">
        <div className="flex items-end justify-between gap-4 mb-6">
          <div>
            <h1 className="text-gray-800 text-2xl font-bold">Dashboard</h1>
            <p className="text-gray-600">
              Today’s focus, upcoming deadlines, and workload health in one glance.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={loadDashboard}
              className="text-gray-600 text-sm px-3 py-2 rounded-md bg-white border hover:bg-gray-50"
            >
              Refresh
            </button>
            <button
              onClick={() => router.push("/plan")}
              className="text-gray-600 text-sm px-3 py-2 rounded-md bg-white border hover:bg-gray-50"
            >
              View plan
            </button>
            <button
              onClick={() => router.push("/assessments")}
              className="text-gray-600 text-sm px-3 py-2 rounded-md bg-white border hover:bg-gray-50"
            >
              Assessments
            </button>
            <button
              onClick={() => router.push("/availability")}
              className="text-gray-600 text-sm px-3 py-2 rounded-md bg-white border hover:bg-gray-50"
            >
              Availability
            </button>
            <button
              onClick={() => router.push("/courses")}
              className="text-gray-600 text-sm px-3 py-2 rounded-md bg-white border hover:bg-gray-50"
            >
              Courses
            </button>
          </div>
        </div>

        {loading ? (
          <div className="bg-white rounded-xl shadow p-5">
            <p className="text-gray-600">Loading your dashboard...</p>
          </div>
        ) : (
          <>
            {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <div className="bg-white rounded-xl shadow p-5">
                <p className="text-sm text-gray-600">Today tasks</p>
                <p className="mt-2 text-2xl font-bold text-gray-900">
                  {statsToday.doneTasks}/{statsToday.totalTasks}
                </p>
                <p className="text-sm text-gray-500">tasks complete</p>
              </div>
              <div className="bg-white rounded-xl shadow p-5">
                <p className="text-sm text-gray-600">Hours today</p>
                <p className="mt-2 text-2xl font-bold text-gray-900">
                  {(statsToday.doneMinutes / 60).toFixed(1)}h
                </p>
                <p className="text-sm text-gray-500">
                  of {(statsToday.totalMinutes / 60).toFixed(1)}h planned
                </p>
              </div>
              <div className="bg-white rounded-xl shadow p-5">
                <p className="text-sm text-gray-600">Next deadline</p>
                {nextAssessment ? (
                  <>
                    <p className="mt-2 text-lg font-semibold text-gray-900">
                      {nextAssessment.title}
                    </p>
                    <p className="text-sm text-gray-500">
                      {prettyDate(nextAssessment.due_date)} •{" "}
                      {getCourseTitle(nextAssessment) ?? "No course"}
                    </p>
                  </>
                ) : (
                  <p className="mt-2 text-sm text-gray-500">No upcoming assessments</p>
                )}
              </div>
              <div className="bg-white rounded-xl shadow p-5">
                <p className="text-sm text-gray-600">Week planned</p>
                <p className="mt-2 text-2xl font-bold text-gray-900">
                  {(weekMinutesPlanned / 60).toFixed(1)}h
                </p>
                <p className="text-sm text-gray-500">total scheduled time</p>
              </div>
            </div>

            <div className="mt-6 grid gap-4 lg:grid-cols-3">
              <div className="lg:col-span-2 space-y-4">
                <div className="bg-white rounded-xl shadow p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-600">Today focus</p>
                      <h2 className="text-xl font-semibold text-gray-900">
                        Plan for {prettyDate(todayDate)}
                      </h2>
                    </div>
                    <button
                      onClick={() => router.push("/plan")}
                      className="text-gray-600 text-sm px-3 py-2 rounded-md border bg-white hover:bg-gray-50"
                    >
                      Open plan
                    </button>
                  </div>
                  {todayItems.length === 0 ? (
                    <p className="mt-3 text-sm text-gray-600">No tasks scheduled for today yet.</p>
                  ) : (
                    <div className="mt-4 space-y-3">
                      {todayItems.slice(0, 5).map((it) => (
                        <div
                          key={it.id}
                          className="flex items-start gap-3 rounded-md border p-3 hover:bg-gray-50"
                        >
                          <span
                            className={`mt-1 inline-flex h-3 w-3 rounded-full ${
                              it.done ? "bg-green-500" : "bg-black"
                            }`}
                          />
                          <div className="flex-1">
                            <p
                              className={`text-sm font-medium ${
                                it.done ? "line-through text-gray-500" : "text-gray-900"
                              }`}
                            >
                              {it.title}
                            </p>
                            <p className="text-xs text-gray-500">{it.minutes} minutes</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="bg-white rounded-xl shadow p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-600">Next 7 days</p>
                      <h2 className="text-xl font-semibold text-gray-900">Weekly plan snapshot</h2>
                    </div>
                    <span className="text-sm text-gray-500">{dayDates.length} days</span>
                  </div>
                  <div className="mt-4 space-y-3">
                    {dayDates.map((date) => {
                      const totalMinutes = weekTotals.get(date) ?? 0;
                      const hours = totalMinutes / 60;
                      const maxMinutes = Math.max(...Array.from(weekTotals.values()), 1);
                      const pct = Math.round((totalMinutes / maxMinutes) * 100);
                      return (
                        <div key={date} className="flex items-center gap-3">
                          <div className="w-20 text-sm text-gray-600">{prettyDate(date)}</div>
                          <div className="flex-1">
                            <div className="h-2 rounded-full bg-gray-200">
                              <div className="h-2 rounded-full bg-black" style={{ width: `${pct}%` }} />
                            </div>
                          </div>
                          <div className="w-14 text-right text-sm text-gray-600">
                            {hours.toFixed(1)}h
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="bg-white rounded-xl shadow p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-600">Deadlines</p>
                      <h2 className="text-xl font-semibold text-gray-900">Upcoming assessments</h2>
                    </div>
                    <button
                      onClick={() => router.push("/assessments")}
                      className="text-gray-600 text-sm px-3 py-2 rounded-md border bg-white hover:bg-gray-50"
                    >
                      Manage
                    </button>
                  </div>
                  {assessments.length === 0 ? (
                    <p className="mt-3 text-sm text-gray-600">
                      No assessments due in the next week.
                    </p>
                  ) : (
                    <div className="mt-4 space-y-3">
                      {assessments.map((a) => (
                        <div key={a.id} className="flex items-center justify-between gap-4">
                          <div>
                            <p className="text-sm font-medium text-gray-900">{a.title}</p>
                            <p className="text-xs text-gray-500">
                              {prettyDate(a.due_date)} • {getCourseTitle(a) ?? "No course"}
                            </p>
                          </div>
                          <div className="text-sm text-gray-600">
                            {Number(a.estimated_hours).toFixed(1)}h
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-4">
                <PomodoroTimer />

                {shortfallMinutes > 0 ? (
                  <div className="rounded-xl border border-red-200 bg-red-50 p-4">
                    <h3 className="text-lg font-semibold text-red-800">Workload is heavy</h3>
                    <p className="mt-2 text-sm text-red-700">
                      You’re short by {formatShortfall(shortfallMinutes)} this week.
                    </p>
                    <ul className="mt-3 text-sm text-red-700 list-disc pl-5">
                      <li>Reduce task estimates</li>
                      <li>Increase daily availability</li>
                      <li>Split large assessments</li>
                    </ul>
                  </div>
                ) : (
                  <div className="rounded-xl border bg-white p-4">
                    <h3 className="text-lg font-semibold text-gray-900">
                      Workload looks manageable
                    </h3>
                    <p className="mt-2 text-sm text-gray-600">
                      Your plan fits your availability for the week.
                    </p>
                  </div>
                )}

                <div className="bg-white rounded-xl shadow p-5">
                  <h3 className="text-lg font-semibold text-gray-900">Quick actions</h3>
                  <div className="mt-3 flex flex-col gap-2">
                    <GeneratePlanButton />
                    <button
                      onClick={() => router.push("/availability")}
                      className="text-gray-600 text-sm px-3 py-2 rounded-md border bg-white hover:bg-gray-50"
                    >
                      Edit availability
                    </button>
                    <button
                      onClick={() => router.push("/assessments")}
                      className="text-gray-600 text-sm px-3 py-2 rounded-md border bg-white hover:bg-gray-50"
                    >
                      Add assessment
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
