"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";

export default function Home() {
  const { user, role, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading) {
      if (user) {
        if (role === "admin") {
          router.push("/dashboard");
        } else {
          router.push("/chamada");
        }
      } else {
        router.push("/login");
      }
    }
  }, [user, role, loading, router]);

  return (
    <div className="flex h-screen items-center justify-center">
      <div className="w-10 h-10 border-4 border-green-500 border-t-transparent rounded-full animate-spin"></div>
    </div>
  );
}
