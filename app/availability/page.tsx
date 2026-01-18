"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";
import { generatePlanForUser } from "@/lib/generatePlan";



type AvailabilityRow = {
  id?: string;
  user_id: string;
  weekday: number; // 0=Sun ... 6=Sat
  hours_available: number;
};

export default function AvailabilityPage() {
  const router = useRouter();

  const dayNames = useMemo(
    () => ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
    []
  );

  const [sessionUserId, setSessionUserId] = useState<string | null>(null);

  // hours[0] = Sunday hours, ... hours[6] = Saturday hours
  const [hours, setHours] = useState<number[]>([2, 2, 2, 2, 2, 2, 2]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [planMsg, setPlanMsg] = useState<string | null>(null);
  const [planWarn, setPlanWarn] = useState<string | null>(null);
  const [planLoading, setPlanLoading] = useState(false);

  async function requireSession() {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;

    const userId = data.session?.user?.id ?? null;
    if (!userId) {
      router.push("/login");
      return null;
    }
    setSessionUserId(userId);
    return userId;
  }

  async function loadAvailability() {
    setLoading(true);
    setError(null);

    try {
      const userId = await requireSession();
      if (!userId) return;

      const { data, error } = await supabase
        .from("availability")
        .select("weekday,hours_available")
        .order("weekday", { ascending: true });

      if (error) throw error;

      // Start with defaults, overwrite with DB values
      const next = [2, 2, 2, 2, 2, 2, 2];
      (data ?? []).forEach((row: any) => {
        const wd = Number(row.weekday);
        const ha = Number(row.hours_available);
        if (wd >= 0 && wd <= 6) next[wd] = ha;
      });

      setHours(next);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load availability");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAvailability();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function setDayHours(weekday: number, value: number) {
    setSavedMsg(null);
    setPlanMsg(null);
    setPlanWarn(null);
    setHours((prev) => {
      const copy = [...prev];
      copy[weekday] = value;
      return copy;
    });
  }

  async function regeneratePlan(userId?: string | null) {
    setPlanLoading(true);
    setPlanMsg(null);
    setPlanWarn(null);

    try {
      const uid = userId ?? sessionUserId ?? (await requireSession());
      if (!uid) return;

      const result = await generatePlanForUser(uid);
      setPlanMsg(result.message);
      setPlanWarn(result.warning);
    } catch (e: any) {
      setPlanWarn(e?.message ?? "Failed to regenerate plan");
    } finally {
      setPlanLoading(false);
    }
  }

  async function saveAvailability() {
    setError(null);
    setSavedMsg(null);
    setPlanMsg(null);
    setPlanWarn(null);

    try {
      setSaving(true);

      const userId = sessionUserId ?? (await requireSession());
      if (!userId) return;

      // Build rows for upsert
      const rows: AvailabilityRow[] = hours.map((h, weekday) => ({
        user_id: userId,
        weekday,
        hours_available: h,
      }));

      // Requires a unique constraint on (user_id, weekday)
      const { error } = await supabase
        .from("availability")
        .upsert(rows, { onConflict: "user_id,weekday" });

      if (error) throw error;

      setSavedMsg("Saved!");
      await regeneratePlan(userId);
    } catch (e: any) {
      setError(e?.message ?? "Failed to save availability");
    } finally {
      setSaving(false);
    }
  }

  function totalHours() {
    return hours.reduce((a, b) => a + b, 0);
  }

  function totalColorClass(total: number) {
    if (total >= 25) return "text-green-600";
    if (total >= 15) return "text-yellow-600";
    return "text-red-600";
  }

  type PresetKey = "light" | "balanced" | "heavy" | "weekend" | "workweek";

    const presets: Record<PresetKey, { label: string; hours: number[]; hint: string }> = {
    light: {
        label: "Light",
        hours: [0, 1.5, 1.5, 1.5, 1.5, 1, 0],
        hint: "Good for burnout recovery / busy weeks",
    },
    balanced: {
        label: "Balanced",
        hours: [1, 2, 2, 2, 2, 2, 1],
        hint: "Most students (steady, realistic)",
    },
    heavy: {
        label: "Heavy",
        hours: [2, 4, 4, 6, 4, 3, 2],
        hint: "Crunch mode / midterm season",
    },
    weekend: {
        label: "Weekend-only",
        hours: [0, 0, 0, 0, 0, 4, 6],
        hint: "If weekdays are packed",
    },
    workweek: {
        label: "Work Week",
        hours: [0, 3, 3, 3, 3, 3, 0],
        hint: "Mon–Fri focus, weekends off",
    },
    };

    function applyPreset(key: PresetKey) {
    setSavedMsg(null);
    setError(null);
    setPlanMsg(null);
    setPlanWarn(null);
    setHours(presets[key].hours);
    }


  return (
    <div className="min-h-screen bg-gray-100 px-4 py-8">
      <div className="mx-auto max-w-3xl">
        <div className="flex items-end justify-between gap-4 mb-6">
          <div>
            <h1 className="text-gray-600 text-2xl font-bold">Availability</h1>
            <p className="text-gray-600">
              Set how many hours you can study each day. This helps generate realistic plans.
            </p>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => router.push("/")}
              className="text-gray-600 text-sm px-3 py-2 rounded-md bg-white border hover:bg-gray-50"
            >
              Home
            </button>
            <button
              onClick={loadAvailability}
              className="text-gray-600 text-sm px-3 py-2 rounded-md bg-white border hover:bg-gray-50"
            >
              Refresh
            </button>
          </div>
        </div>

        <div className="mb-4">
  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
    <div className="text-gray-600 font-semibold">Presets</div>
    <div className="text-xs text-gray-500">One click to set your week</div>
  </div>

        <div className="mt-2 flex flex-wrap gap-2">
            {(
            Object.keys(presets) as Array<keyof typeof presets>
            ).map((key) => (
            <button
                key={key}
                type="button"
                onClick={() => applyPreset(key)}
                className="px-3 py-2 text-sm rounded-md border bg-white hover:bg-gray-50 text-gray-600"
                title={presets[key].hint}
            >
                {presets[key].label}
            </button>
            ))}

            <button
            type="button"
            onClick={() => {
                setSavedMsg(null);
                setError(null);
                setPlanMsg(null);
                setPlanWarn(null);
                setHours([2, 2, 2, 2, 2, 2, 2]);
            }}
            className="text-gray-500 px-3 py-2 text-sm rounded-md border bg-white hover:bg-gray-50"
            title="Reset to default 2 hours each day"
            >
            Reset
            </button>
        </div>

        <p className="mt-2 text-xs text-gray-500">
            Tip: After applying a preset, tweak a few days with sliders, then hit <span className="font-medium">Save</span>.
        </p>
        </div>


        <div className="bg-white rounded-xl shadow p-5">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 mb-4">
            <h2 className="text-gray-500 font-semibold">Weekly availability</h2>
            <div className="text-sm">
              Total:{" "}
              <span className={`font-semibold ${totalColorClass(totalHours())}`}>
                {totalHours().toFixed(1)} hrs/week
              </span>
            </div>
          </div>

          {loading ? (
            <p className="text-gray-600">Loading...</p>
          ) : (
            <div className="space-y-4">
              {hours.map((h, weekday) => (
                <div key={weekday} className="border rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div className="font-medium text-gray-900">{dayNames[weekday]}</div>
                    <div className="text-sm text-gray-700">
                      <span className="font-semibold text-gray-900">{h}</span> hrs
                    </div>
                  </div>

                  <input
                    type="range"
                    min={0}
                    max={12}
                    step={0.5}
                    value={h}
                    onChange={(e) => setDayHours(weekday, Number(e.target.value))}
                    className="mt-3 w-full accent-black"
                  />

                  <div className="mt-2 flex justify-between text-xs text-gray-500">
                    <span>0</span>
                    <span>6</span>
                    <span>12</span>
                  </div>
                </div>
              ))}

              <div className="flex items-center gap-3 pt-2">
                <button
                  onClick={saveAvailability}
                  disabled={saving}
                  className="px-4 py-2 rounded-md bg-black text-white hover:bg-gray-800 disabled:opacity-60"
                >
                  {saving ? "Saving..." : "Save availability"}
                </button>
                <button
                  onClick={() => regeneratePlan()}
                  disabled={planLoading}
                  className="px-4 py-2 rounded-md border bg-white hover:bg-gray-50 disabled:opacity-60"
                >
                  {planLoading ? "Regenerating..." : "Regenerate plan"}
                </button>

                {savedMsg && <p className="text-sm text-green-600">{savedMsg}</p>}
                {error && <p className="text-sm text-red-600">{error}</p>}
                {planMsg && <p className="text-sm text-green-600">{planMsg}</p>}
                {planWarn && <p className="text-sm text-red-600">{planWarn}</p>}
              </div>
            </div>
          )}
        </div>

        <p className="text-xs text-gray-500 mt-4">
          Tip: Use 0 hours for days you want completely off.
        </p>
      </div>
    </div>
  );
}
