"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";

type Course = {
  id: string;
  title: string;
  difficulty: number;
};

type Assessment = {
  id: string;
  user_id: string;
  course_id: string | null;
  title: string;
  due_date: string; // YYYY-MM-DD
  estimated_hours: number;
  status?: string;
  created_at?: string;
};

export default function AssessmentsPage() {
  const router = useRouter();

  const [sessionUserId, setSessionUserId] = useState<string | null>(null);

  const [courses, setCourses] = useState<Course[]>([]);
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [loading, setLoading] = useState(true);

  // Add form
  const [title, setTitle] = useState("");
  const [courseId, setCourseId] = useState<string>("");
  const [dueDate, setDueDate] = useState<string>("");
  const [estimatedHours, setEstimatedHours] = useState<number>(2);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Edit form
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editCourseId, setEditCourseId] = useState<string>("");
  const [editDueDate, setEditDueDate] = useState<string>("");
  const [editEstimatedHours, setEditEstimatedHours] = useState<number>(2);
  const [editError, setEditError] = useState<string | null>(null);
  const [editSaving, setEditSaving] = useState(false);

  const courseTitleById = useMemo(() => {
    const map = new Map<string, string>();
    courses.forEach((c) => map.set(c.id, c.title));
    return map;
  }, [courses]);

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

  async function loadCourses() {
    const { data, error } = await supabase
      .from("courses")
      .select("id,title,difficulty")
      .order("title", { ascending: true });

    if (error) throw error;
    setCourses((data ?? []) as Course[]);
  }

  async function loadAssessments() {
    const { data, error } = await supabase
      .from("assessments")
      .select("id,user_id,course_id,title,due_date,estimated_hours,status,created_at")
      .order("due_date", { ascending: true });

    if (error) throw error;
    setAssessments((data ?? []) as Assessment[]);
  }

  async function refreshAll() {
    setLoading(true);
    setFormError(null);

    try {
      const userId = await requireSession();
      if (!userId) return;

      await Promise.all([loadCourses(), loadAssessments()]);
    } catch (e: any) {
      setFormError(e?.message ?? "Failed to load assessments");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refreshAll();
    
  }, []);

  function todayAsYYYYMMDD() {
    const d = new Date();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${d.getFullYear()}-${mm}-${dd}`;
  }

  async function addAssessment(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    const trimmed = title.trim();
    if (!trimmed) return setFormError("Assessment title is required.");
    if (!courseId) return setFormError("Please choose a course.");
    if (!dueDate) return setFormError("Due date is required.");
    if (dueDate < todayAsYYYYMMDD()) return setFormError("Due date can’t be in the past.");
    if (Number.isNaN(estimatedHours) || estimatedHours <= 0)
      return setFormError("Estimated hours must be greater than 0.");

    try {
      setSaving(true);

      const userId = sessionUserId ?? (await requireSession());
      if (!userId) return;

      const { error } = await supabase.from("assessments").insert({
        user_id: userId,
        course_id: courseId,
        title: trimmed,
        due_date: dueDate,
        estimated_hours: estimatedHours,
        status: "todo",
      });

      if (error) throw error;

      setTitle("");
      setCourseId("");
      setDueDate("");
      setEstimatedHours(2);

      await loadAssessments();
    } catch (e: any) {
      setFormError(e?.message ?? "Failed to add assessment");
    } finally {
      setSaving(false);
    }
  }

  function startEdit(a: Assessment) {
    setEditingId(a.id);
    setEditTitle(a.title);
    setEditCourseId(a.course_id ?? "");
    setEditDueDate(a.due_date);
    setEditEstimatedHours(Number(a.estimated_hours));
    setEditError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditTitle("");
    setEditCourseId("");
    setEditDueDate("");
    setEditEstimatedHours(2);
    setEditError(null);
  }

  async function saveEdit(assessmentId: string) {
    setEditError(null);

    const trimmed = editTitle.trim();
    if (!trimmed) return setEditError("Assessment title is required.");
    if (!editCourseId) return setEditError("Please choose a course.");
    if (!editDueDate) return setEditError("Due date is required.");
    if (Number.isNaN(editEstimatedHours) || editEstimatedHours <= 0)
      return setEditError("Estimated hours must be greater than 0.");

    try {
      setEditSaving(true);

      const { error } = await supabase
        .from("assessments")
        .update({
          title: trimmed,
          course_id: editCourseId,
          due_date: editDueDate,
          estimated_hours: editEstimatedHours,
        })
        .eq("id", assessmentId);

      if (error) throw error;

      cancelEdit();
      await loadAssessments();
    } catch (e: any) {
      setEditError(e?.message ?? "Failed to save changes");
    } finally {
      setEditSaving(false);
    }
  }

  async function deleteAssessment(id: string) {
    const ok = confirm("Delete this assessment? This cannot be undone.");
    if (!ok) return;

    try {
      const { error } = await supabase.from("assessments").delete().eq("id", id);
      if (error) throw error;

      setAssessments((prev) => prev.filter((a) => a.id !== id));
      if (editingId === id) cancelEdit();
    } catch (e: any) {
      alert(e?.message ?? "Failed to delete assessment");
    }
  }

  function hoursColor(hours: number) {
  if (hours <= 4) return "accent-green-500";
  if (hours <= 8) return "accent-yellow-500";
  if (hours <= 12) return "accent-orange-500";
  return "accent-red-500";
}

  return (
    <div className="min-h-screen bg-gray-100 px-4 py-8">
      <div className="mx-auto max-w-4xl">
        <div className="flex items-end justify-between gap-4 mb-6">
          <div>
            <h1 className="text-gray-600 text-2xl font-bold">Assessments</h1>
            <p className="text-gray-600">Add assignments/tests and track deadlines.</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => router.push("/")}
              className="text-gray-400 text-sm px-3 py-2 rounded-md bg-white border hover:bg-gray-50"
            >
              Home
            </button>
            <button
              onClick={() => router.push("/availability")}
              className="text-gray-400 text-sm px-3 py-2 rounded-md bg-white border hover:bg-gray-50"
            >
              Availability
            </button>
            <button
              onClick={() => router.push("/courses")}
              className="text-gray-400 text-sm px-3 py-2 rounded-md bg-white border hover:bg-gray-50"
            >
              Courses
            </button>
            <button
              onClick={refreshAll}
              className="text-gray-400 text-sm px-3 py-2 rounded-md bg-white border hover:bg-gray-50"
            >
              Refresh
            </button>
          </div>
        </div>

        {/* Adding assessment form */}
        <div className="bg-white rounded-xl shadow p-5 mb-6">
          <h2 className="text-gray-600 font-semibold mb-3">Add an assessment</h2>

          {courses.length === 0 ? (
            <p className="text-gray-600">
              You need at least one course first. Go create one in <a className="underline" href="/courses">Courses</a>.
            </p>
          ) : (
            <form onSubmit={addAssessment} className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div className="md:col-span-2">
                <label className="text-sm text-gray-700">Title</label>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g., Lab 2, Midterm, Essay"
                  className="mt-1 w-full px-3 py-2 border rounded-md focus:outline-none focus:ring placeholder:text-gray-400 text-gray-900"
                />
              </div>

              <div>
                <label className="text-sm text-gray-700">Course</label>
                <select
                  value={courseId}
                  onChange={(e) => setCourseId(e.target.value)}
                  className="mt-1 w-full px-3 py-2 border rounded-md focus:outline-none focus:ring text-gray-900"
                >
                  <option value="">Select course…</option>
                  {courses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title} (D{c.difficulty})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-sm text-gray-700">Due date</label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="mt-1 w-full px-3 py-2 border rounded-md focus:outline-none focus:ring text-gray-900"
                />
              </div>

              <div>
                <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-700">Estimated hours</span>
                    <span className="text-sm font-medium text-gray-900">
                        {estimatedHours}h
                    </span>
                </div>
    
                <input
                  type="range"
                  min={1}
                  max={20}
                  step={0.5}
                  value={estimatedHours}
                  onChange={(e) => setEstimatedHours(Number(e.target.value))}
                  className={`mt-2 w-full ${hoursColor(estimatedHours)}`}
                  
                />
              </div>

              <div className="md:col-span-4 flex items-center gap-3">
                <button
                  disabled={saving || courses.length === 0}
                  className="px-4 py-2 rounded-md bg-black text-white hover:bg-gray-800 disabled:opacity-60"
                >
                  {saving ? "Adding..." : "Add Assessment"}
                </button>
                {formError && <p className="text-sm text-red-600">{formError}</p>}
              </div>
            </form>
          )}
        </div>

        {/* The List */}
        <div className="bg-white rounded-xl shadow p-5">
          <div className="text-gray-600 flex items-center justify-between mb-3">
            <h2 className="font-semibold">Your assessments</h2>
          </div>

          {loading ? (
            <p className="text-gray-600">Loading...</p>
          ) : assessments.length === 0 ? (
            <p className="text-gray-600">No assessments yet. Add one above.</p>
          ) : (
            <div className="space-y-3">
              {assessments.map((a) => {
                const isEditing = editingId === a.id;
                const courseTitle = a.course_id ? courseTitleById.get(a.course_id) : "Unknown course";

                return (
                  <div key={a.id} className="border rounded-lg p-4">
                    {!isEditing ? (
                      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                        <div>
                          <div className="font-semibold text-gray-900">{a.title}</div>
                          <div className="text-sm text-gray-600">
                            Course: <span className="font-medium">{courseTitle}</span>
                            {" • "}Due: <span className="font-medium">{a.due_date}</span>
                            {" • "}Est: <span className="font-medium">{a.estimated_hours}h</span>
                          </div>
                        </div>

                        <div className="flex gap-2">
                          <button
                            onClick={() => startEdit(a)}
                            className="text-gray-400 px-3 py-2 text-sm rounded-md border bg-white hover:bg-gray-50"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => deleteAssessment(a.id)}
                            className="text-gray-400 px-3 py-2 text-sm rounded-md border bg-white hover:bg-gray-50"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                          <div className="md:col-span-2">
                            <label className="text-sm text-gray-700">Title</label>
                            <input
                              value={editTitle}
                              onChange={(e) => setEditTitle(e.target.value)}
                              className="mt-1 w-full px-3 py-2 border rounded-md focus:outline-none focus:ring text-gray-900"
                            />
                          </div>

                          <div>
                            <label className="text-sm text-gray-700">Course</label>
                            <select
                              value={editCourseId}
                              onChange={(e) => setEditCourseId(e.target.value)}
                              className="mt-1 w-full px-3 py-2 border rounded-md focus:outline-none focus:ring text-gray-900"
                            >
                              <option value="">Select course…</option>
                              {courses.map((c) => (
                                <option key={c.id} value={c.id}>
                                  {c.title} (D{c.difficulty})
                                </option>
                              ))}
                            </select>
                          </div>

                          <div>
                            <label className="text-sm text-gray-700">Due date</label>
                            <input
                              type="date"
                              value={editDueDate}
                              onChange={(e) => setEditDueDate(e.target.value)}
                              className="mt-1 w-full px-3 py-2 border rounded-md focus:outline-none focus:ring text-gray-900"
                            />
                          </div>

                          <div>
                            <label className="text-sm text-gray-700">Estimated hours</label>
                            <input
                              type="range"
                              min={1}
                              max={20}
                              step={0.5}
                              value={editEstimatedHours}
                              onChange={(e) => setEditEstimatedHours(Number(e.target.value))}
                              className="mt-2 w-full accent-black"
                            />
                          </div>
                        </div>

                        {editError && <p className="text-sm text-red-600">{editError}</p>}

                        <div className="flex gap-2">
                          <button
                            disabled={editSaving}
                            onClick={() => saveEdit(a.id)}
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
