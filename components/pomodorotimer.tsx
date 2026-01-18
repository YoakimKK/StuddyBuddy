"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Mode = "focus" | "break";

function formatTime(totalSeconds: number) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export default function PomodoroTimer() {
  const FOCUS_MIN = 30;
  const BREAK_MIN = 10;

  const focusSeconds = FOCUS_MIN * 60;
  const breakSeconds = BREAK_MIN * 60;

  const [mode, setMode] = useState<Mode>("focus");
  const [secondsLeft, setSecondsLeft] = useState<number>(focusSeconds);
  const [running, setRunning] = useState(false);

  
  const [focusSessions, setFocusSessions] = useState(0);

  const intervalRef = useRef<number | null>(null);

  const totalSecondsThisMode = useMemo(
    () => (mode === "focus" ? focusSeconds : breakSeconds),
    [mode, focusSeconds, breakSeconds]
  );

  const pct = useMemo(() => {
    if (totalSecondsThisMode === 0) return 0;
    return Math.round(((totalSecondsThisMode - secondsLeft) / totalSecondsThisMode) * 100);
  }, [secondsLeft, totalSecondsThisMode]);

  function stopTick() {
    if (intervalRef.current !== null) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }

  function startTick() {
    if (intervalRef.current !== null) return;

    intervalRef.current = window.setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) return 0;
        return prev - 1;
      });
    }, 1000);
  }

  
  useEffect(() => {
    if (running) startTick();
    else stopTick();
    return () => stopTick();
    
  }, [running]);

  
  useEffect(() => {
    if (!running) return;
    if (secondsLeft > 0) return;

    
    if (mode === "focus") {
      setFocusSessions((n) => n + 1);
      setMode("break");
      setSecondsLeft(breakSeconds);
    } else {
      setMode("focus");
      setSecondsLeft(focusSeconds);
    }
    
  }, [secondsLeft, running]);

  function toggleRun() {
    setRunning((r) => !r);
  }

  function reset() {
    setRunning(false);
    setMode("focus");
    setSecondsLeft(focusSeconds);
  }

  function skip() {
    
    if (mode === "focus") {
      setMode("break");
      setSecondsLeft(breakSeconds);
    } else {
      setMode("focus");
      setSecondsLeft(focusSeconds);
    }
  }

  return (
    <div className="rounded-xl border bg-white p-4 shadow">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-gray-900">Pomodoro</h2>
        <span
          className={`text-xs px-2 py-1 rounded-full border ${
            mode === "focus" ? "text-gray-900" : "text-gray-700"
          }`}
        >
          {mode === "focus" ? "Focus 30" : "Break 10"}
        </span>
      </div>

      <div className="mt-3">
        <div className="text-4xl font-bold text-gray-900 tabular-nums">
          {formatTime(secondsLeft)}
        </div>
        <div className="mt-2 h-2 w-full rounded bg-gray-200 overflow-hidden">
          <div
            className="h-2 bg-black transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="mt-2 text-xs text-gray-500">
          {mode === "focus"
            ? "Work on one task. No distractions."
            : "Stand up, water, quick reset."}
        </div>
      </div>

      <div className="mt-4 flex gap-2">
        <button
          onClick={toggleRun}
          className="flex-1 px-3 py-2 rounded-md bg-black text-white hover:bg-gray-800"
        >
          {running ? "Pause" : "Start"}
        </button>

        <button
          onClick={skip}
          className="px-3 py-2 rounded-md border bg-white hover:bg-gray-50"
          title="Skip to next phase"
        >
          Skip
        </button>

        <button
          onClick={reset}
          className="px-3 py-2 rounded-md border bg-white hover:bg-gray-50"
          title="Reset timer"
        >
          Reset
        </button>
      </div>

      <div className="mt-3 text-sm text-gray-700">
        Focus sessions completed: <span className="font-semibold">{focusSessions}</span>
      </div>
    </div>
  );
}
