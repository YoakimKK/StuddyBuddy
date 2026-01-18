"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";

type Course = {
  id: string;
  user_id: string;
  title: string;
  difficulty: number;
  created_at?: string;
};

export default function CoursesPage() {
  const router = useRouter();

  const [sessionUserId, setSessionUserId] = useState<string | null>(null);

  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);

  // Add 
  const [title, setTitle] = useState("");
  const [difficulty, setDifficulty] = useState<number>(3);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Edit 
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDifficulty, setEditDifficulty] = useState<number>(3);
  const [editError, setEditError] = useState<string | null>(null);
  const [editSaving, setEditSaving] = useState(false);

  const difficultyLabel = useMemo(() => {
    const labels: Record<number, string> = {
      1: "Very Easy",
      2: "Easy",
      3: "Medium",
      4: "Hard",
      5: "Very Hard",
    };
    return labels;
  }, []);

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

  async function fetchCourses() {
    setLoading(true);
    setFormError(null);

    try {
      const userId = await requireSession();
      if (!userId) return;

      //user-specific courses
      const { data, error } = await supabase
        .from("courses")
        .select("id,user_id,title,difficulty,created_at")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setCourses((data ?? []) as Course[]);
    } catch (e: any) {
      setFormError(e?.message ?? "Failed to load courses");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchCourses();
    
  }, []);

  async function addCourse(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    const trimmed = title.trim();
    if (!trimmed) {
      setFormError("Course title is required.");
      return;
    }
    if (difficulty < 1 || difficulty > 5) {
      setFormError("Difficulty must be between 1 and 5.");
      return;
    }

    try {
      setSaving(true);

      const userId = sessionUserId ?? (await requireSession());
      if (!userId) return;

      const { error } = await supabase.from("courses").insert({
        title: trimmed,
        difficulty,
      });

      if (error) throw error;

      setTitle("");
      setDifficulty(3);
      await fetchCourses();
    } catch (e: any) {
      setFormError(e?.message ?? "Failed to add course");
    } finally {
      setSaving(false);
    }
  }

  function startEdit(c: Course) {
    setEditingId(c.id);
    setEditTitle(c.title);
    setEditDifficulty(c.difficulty);
    setEditError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditTitle("");
    setEditDifficulty(3);
    setEditError(null);
  }

  async function saveEdit(courseId: string) {
    setEditError(null);

    const trimmed = editTitle.trim();
    if (!trimmed) {
      setEditError("Course title is required.");
      return;
    }
    if (editDifficulty < 1 || editDifficulty > 5) {
      setEditError("Difficulty must be between 1 and 5.");
      return;
    }

    try {
      setEditSaving(true);

      const { error } = await supabase
        .from("courses")
        .update({ title: trimmed, difficulty: editDifficulty })
        .eq("id", courseId);

      if (error) throw error;

      cancelEdit();
      await fetchCourses();
    } catch (e: any) {
      setEditError(e?.message ?? "Failed to save changes");
    } finally {
      setEditSaving(false);
    }
  }

  async function deleteCourse(courseId: string) {
    const ok = confirm("Delete this course? This cannot be undone.");
    if (!ok) return;

    try {
      const { error } = await supabase.from("courses").delete().eq("id", courseId);
      if (error) throw error;

      
      setCourses((prev) => prev.filter((c) => c.id !== courseId));
      if (editingId === courseId) cancelEdit();
    } catch (e: any) {
      alert(e?.message ?? "Failed to delete course");
    }
  }

  return (
    <div className="min-h-screen bg-gray-100 px-4 py-8">
      <div className="mx-auto max-w-3xl">
        <div className="flex items-end justify-between gap-4 mb-6">
          <div>
            <h1 className="text-gray-700 text-2xl font-bold">Courses</h1>
            <p className="text-gray-600">Add your courses and rate difficulty (1–5).</p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => router.push("/")}
              className="text-gray-500 text-sm px-3 py-2 rounded-md bg-white border hover:bg-gray-50"
            >
              Home
            </button>
            <button
              onClick={() => router.push("/availability")}
              className="text-gray-500 text-sm px-3 py-2 rounded-md bg-white border hover:bg-gray-50"
            >
              Availability
            </button>
          </div>
        </div>

        {/* Add course card */}
        <div className="bg-white rounded-xl shadow p-5 mb-6">
          <h2 className="text-gray-700 font-semibold mb-3">Add a course</h2>

          <form onSubmit={addCourse} className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="md:col-span-2">
              <label className="text-sm text-gray-700">Course name</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g., CST8132 - OOP"
                className="mt-1 w-full px-3 py-2 border rounded-md focus:outline-none focus:ring placeholder:text-gray-400 text-gray-900"
              />
            </div>

            <div>
              <label className="text-sm text-gray-700">Difficulty</label>
              <select
                value={difficulty}
                onChange={(e) => setDifficulty(Number(e.target.value))}
                className="mt-1 w-full px-3 py-2 border rounded-md focus:outline-none focus:ring text-gray-900"
              >
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>
                    {n} — {difficultyLabel[n]}
                  </option>
                ))}
              </select>
            </div>

            <div className="md:col-span-3 flex items-center gap-3">
              <button
                disabled={saving}
                className="px-4 py-2 rounded-md bg-black text-white hover:bg-gray-800 disabled:opacity-60"
              >
                {saving ? "Adding..." : "Add Course"}
              </button>

              {formError && <p className="text-sm text-red-600">{formError}</p>}
            </div>
          </form>
        </div>

        {/* List */}
        <div className="bg-white rounded-xl shadow p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-gray-700 font-semibold">Your courses</h2>
            <button
              onClick={fetchCourses}
              className="text-sm text-gray-500 px-3 py-2 rounded-md bg-white border hover:bg-gray-50"
            >
              Refresh
            </button>
          </div>

          {loading ? (
            <p className="text-gray-600">Loading...</p>
          ) : courses.length === 0 ? (
            <p className="text-gray-600">No courses yet. Add one above.</p>
          ) : (
            <div className="space-y-3">
              {courses.map((c) => {
                const isEditing = editingId === c.id;

                return (
                  <div key={c.id} className="border rounded-lg p-4">
                    {!isEditing ? (
                      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                        <div>
                          <div className="font-semibold text-gray-900">{c.title}</div>
                          <div className="text-sm text-gray-600">
                            Difficulty: <span className="font-medium">{c.difficulty}</span>{" "}
                            <span className="text-gray-500">({difficultyLabel[c.difficulty]})</span>
                          </div>
                        </div>

                        <div className="flex gap-2">
                          <button
                            onClick={() => startEdit(c)}
                            className="px-3 py-2 text-sm rounded-md border bg-white hover:bg-gray-50"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => deleteCourse(c.id)}
                            className="px-3 py-2 text-sm rounded-md border bg-white hover:bg-gray-50"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                          <div className="md:col-span-2">
                            <label className="text-sm text-gray-700">Course name</label>
                            <input
                              value={editTitle}
                              onChange={(e) => setEditTitle(e.target.value)}
                              className="mt-1 w-full px-3 py-2 border rounded-md focus:outline-none focus:ring text-gray-900"
                            />
                          </div>

                          <div>
                            <label className="text-sm text-gray-700">Difficulty</label>
                            <select
                              value={editDifficulty}
                              onChange={(e) => setEditDifficulty(Number(e.target.value))}
                              className="mt-1 w-full px-3 py-2 border rounded-md focus:outline-none focus:ring text-gray-900"
                            >
                              {[1, 2, 3, 4, 5].map((n) => (
                                <option key={n} value={n}>
                                  {n} — {difficultyLabel[n]}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>

                        {editError && <p className="text-sm text-red-600">{editError}</p>}

                        <div className="flex gap-2">
                          <button
                            disabled={editSaving}
                            onClick={() => saveEdit(c.id)}
                            className="px-3 py-2 text-sm rounded-md bg-black text-white hover:bg-gray-800 disabled:opacity-60"
                          >
                            {editSaving ? "Saving..." : "Save"}
                          </button>
                          <button
                            disabled={editSaving}
                            onClick={cancelEdit}
                            className="px-3 py-2 text-sm rounded-md border bg-white hover:bg-gray-50 disabled:opacity-60"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
