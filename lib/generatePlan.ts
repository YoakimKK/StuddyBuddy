"use client";

import { supabase } from "@/lib/supabaseClient";

type AssessmentRow = {
  id: string;
  title: string;
  course_id: string | null;
  due_date: string; // YYYY-MM-DD
  estimated_hours: number;
  status?: string;
};

type GeneratePlanResult = {
  planRowsCount: number;
  shortfallMinutes: number;
  message: string | null;
  warning: string | null;
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

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function parseYYYYMMDD(s: string) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function minutesToShortfall(mins: number) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h <= 0) return `${m} minutes`;
  if (m === 0) return `${h} hours`;
  return `${h}h ${m}m`;
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

export async function generatePlanForUser(userId: string): Promise<GeneratePlanResult> {
  const today = startOfDay(new Date());
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i));
  const dayDates = days.map(toYYYYMMDD);

  // Availability that defaults to 2h/day if not set
  const { data: availRows, error: availErr } = await supabase
    .from("availability")
    .select("weekday,hours_available")
    .eq("user_id", userId);
  if (availErr) throw availErr;

  const hoursByWeekday = new Map<number, number>();
  for (let wd = 0; wd <= 6; wd++) hoursByWeekday.set(wd, 2);

  (availRows ?? []).forEach((r: any) => {
    hoursByWeekday.set(Number(r.weekday), Number(r.hours_available));
  });

  const capacityByDayMinutes = days.map((d) => {
    const wd = d.getDay();
    const hours = hoursByWeekday.get(wd) ?? 2;
    return Math.round(hours * 60);
  });

  const totalCapacity = capacityByDayMinutes.reduce((a, b) => a + b, 0);

  // Load assessments due within next 7 days and not done
  const { data: assessmentRows, error: asErr } = await supabase
    .from("assessments")
    .select("id,title,course_id,due_date,estimated_hours,status")
    .eq("user_id", userId)
    .neq("status", "done");
  if (asErr) throw asErr;

  const lastDayStr = dayDates[dayDates.length - 1];
  const assessments = ((assessmentRows ?? []) as AssessmentRow[]).filter(
    (a) => a.due_date >= dayDates[0] && a.due_date <= lastDayStr
  );

  if (assessments.length === 0) {
    await supabase.from("plan_meta").upsert({
      user_id: userId,
      shortfall_minutes: 0,
      updated_at: new Date().toISOString(),
    });
    return {
      planRowsCount: 0,
      shortfallMinutes: 0,
      message: "No assessments due in the next 7 days.",
      warning: null,
    };
  }

  // Load course difficulty map (so score uses difficulty)
  const { data: courseRows, error: cErr } = await supabase
    .from("courses")
    .select("id,title,difficulty")
    .eq("user_id", userId);
  if (cErr) throw cErr;

  // Map built for course titles
  const courseTitleById = new Map<string, string>();
  (courseRows ?? []).forEach((c: any) => {
    courseTitleById.set(String(c.id), String(c.title));
  });

  const difficultyByCourseId = new Map<string, number>();
  (courseRows ?? []).forEach((c: any) =>
    difficultyByCourseId.set(String(c.id), Number(c.difficulty))
  );

  // Build scored assessment objects
  const scored = assessments.map((a) => {
    const due = startOfDay(parseYYYYMMDD(a.due_date));
    const daysLeft = Math.max(0, Math.round((due.getTime() - today.getTime()) / 86400000));
    const difficulty = a.course_id ? difficultyByCourseId.get(a.course_id) ?? 3 : 3;

    const score = (difficulty + 1) / (daysLeft + 1);
    const remainingMinutes = Math.max(0, Math.round(Number(a.estimated_hours) * 60));

    return {
      ...a,
      difficulty,
      daysLeft,
      score,
      remainingMinutes,
    };
  });

  // Prevent duplicates
  const { error: delErr } = await supabase
    .from("plan_items")
    .delete()
    .eq("user_id", userId)
    .in("plan_date", dayDates);
  if (delErr) throw delErr;

  // Generate plan day by day
  const planRows: any[] = [];
  let shortfallMinutes = 0;

  const CHUNK_MINUTES = 30;
  const MAX_CHUNK_MINUTES = 60;

  for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
    let remainingCapacity = capacityByDayMinutes[dayIndex];
    if (remainingCapacity <= 0) continue;

    const currentDate = dayDates[dayIndex];

    // Only consider assessments not past due and still needing time
    const candidates = scored
      .filter((a) => a.remainingMinutes > 0 && currentDate <= a.due_date)
      .sort((a, b) => b.score - a.score);

    for (const a of candidates) {
      if (remainingCapacity <= 0) break;

      // Allocate in CHUNK_MINUTES blocks
      while (a.remainingMinutes > 0 && remainingCapacity > 0) {
        const chunk = clamp(CHUNK_MINUTES, 15, MAX_CHUNK_MINUTES);
        const minutes = Math.min(chunk, a.remainingMinutes, remainingCapacity);
        if (minutes <= 0) break;

        const courseName = a.course_id ? courseTitleById.get(a.course_id) : null;

        planRows.push({
          user_id: userId,
          plan_date: currentDate,
          title: courseName ? `${courseName} — ${a.title}` : a.title,
          minutes,
          assessment_id: a.id,
          done: false,
        });

        a.remainingMinutes -= minutes;
        remainingCapacity -= minutes;
      }
    }
  }

  // Compute overload shortfall
  const remainingWork = scored.reduce((sum, a) => sum + a.remainingMinutes, 0);
  if (remainingWork > 0) shortfallMinutes = remainingWork;

  if (planRows.length === 0) {
    await supabase.from("plan_meta").upsert({
      user_id: userId,
      shortfall_minutes: shortfallMinutes,
      updated_at: new Date().toISOString(),
    });

    return {
      planRowsCount: 0,
      shortfallMinutes,
      message: "No time available in the next 7 days to schedule tasks.",
      warning: `Overload shortfall: ${minutesToShortfall(shortfallMinutes || 0)}.`,
    };
  }

  const { error: insErr } = await supabase.from("plan_items").insert(planRows);
  if (insErr) throw insErr;

  const { error: metaErr } = await supabase.from("plan_meta").upsert({
    user_id: userId,
    shortfall_minutes: shortfallMinutes,
    updated_at: new Date().toISOString(),
  });
  if (metaErr) throw metaErr;

  let warning: string | null = null;
  if (shortfallMinutes > 0) {
    warning =
      `Overload: you're short by ${minutesToShortfall(shortfallMinutes)} within the next 7 days. ` +
      "Increase availability or reduce estimated hours.";
  } else if (planRows.length > 0 && totalCapacity === 0) {
    warning = "Overload: availability is 0 for all 7 days.";
  }

  return {
    planRowsCount: planRows.length,
    shortfallMinutes,
    message: `Generated ${planRows.length} blocks across the next 7 days.`,
    warning,
  };
}
