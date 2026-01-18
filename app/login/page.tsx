"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSignup, setIsSignup] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const res  = isSignup
      ? await supabase.auth.signUp({ email, password })
      : await supabase.auth.signInWithPassword({ email, password });

    if (res.error) {
      setError(res.error.message);
      setLoading(false);
      return;
    }

    if (isSignup){
         const user = res.data.session?.user;

        if (user) {

            const { error: profileError } = await supabase
                .from("profiles")
                .insert({
                id: user.id,
                full_name: "",
                });

            if (profileError && !profileError.message.toLowerCase().includes("duplicate")){
                setError(profileError.message);
                setLoading(false);
                return;
            }
        }  
    }

    setLoading(false);
    router.push("/");
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 px-4">
      <div className="w-full max-w-md bg-white rounded-xl shadow-lg p-6">
        <h1 className="text-3xl font-bold text-center mb-1 text-black">
          Smart Schedule
        </h1>
        <p className="text-center text-gray-500 mb-6">
          {isSignup ? "Create an account" : "Sign in to your account"}
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="email"
            placeholder="Email"
            className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring placeholder-gray-300 text-gray-500"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />

          <input
            type="password"
            placeholder="Password"
            className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring placeholder-gray-300 text-gray-500"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />

          {error && (
            <p className="text-sm text-red-600">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-black text-white py-2 rounded-md hover:bg-gray-800 transition"
          >
            {loading
              ? "Loading..."
              : isSignup
              ? "Create Account"
              : "Sign In"}
          </button>
        </form>

        <div className="text-center mt-4">
          <button
            onClick={() => setIsSignup(!isSignup)}
            className="text-sm text-gray-600 hover:underline"
          >
            {isSignup
              ? "Already have an account? Sign in"
              : "No account? Create one"}
          </button>
        </div>
      </div>
    </div>
  );
}
