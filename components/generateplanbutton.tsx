"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { generatePlanForUser } from "@/lib/generatePlan";

export default function GeneratePlanButton() {
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [warn, setWarn] = useState<string | null>(null);

  async function generatePlan() {
    setLoading(true);
    setMsg(null);
    setWarn(null);

    try {
      const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
      if (sessionErr) throw sessionErr;
      const user = sessionData.session?.user;
      if (!user) throw new Error("Not logged in.");
      const result = await generatePlanForUser(user.id);
      setMsg(result.message);
      setWarn(result.warning);
    } catch (e: any) {
      alert(e?.message ?? "Failed to generate plan");
    } finally {
      setLoading(false);
    }
  }

  

  return (
    <div className="space-y-2">
      <button
        onClick={generatePlan}
        disabled={loading}
        className="px-4 py-2 rounded-md bg-black text-white hover:bg-gray-800 disabled:opacity-60"
      >
        {loading ? "Generating..." : "Generate 7-Day Plan"}
      </button>

      {msg && <p className="text-sm text-green-700">{msg}</p>}
      {warn && <p className="text-sm text-red-600">{warn}</p>}
    </div>
  );
}
