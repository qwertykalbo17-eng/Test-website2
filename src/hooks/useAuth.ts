import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "../supabase";

// Supabase logs in with an email, so a username is turned into a placeholder one.
const usernameToEmail = (username: string) =>
  `${username.trim().toLowerCase().replace(/[^a-z0-9_]/g, "")}@gmail.com`;

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null);
      setReady(true);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setReady(true);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  /** Returns an error message, or null on success. */
  async function login(username: string, password: string): Promise<string | null> {
    if (!username.trim() || !password) return "Please enter your username and password.";
    const { error } = await supabase.auth.signInWithPassword({
      email: usernameToEmail(username),
      password,
    });
    if (!error) return null;
    return error.message.toLowerCase().includes("invalid login")
      ? "Invalid username or password."
      : error.message;
  }

  async function signup(username: string, password: string): Promise<string | null> {
    const name = username.trim();
    if (!name || !password) return "Please enter a username and password.";
    if (!/^[A-Za-z0-9_]{3,20}$/.test(name)) {
      return "Username must be 3-20 characters: letters, numbers or underscore.";
    }
    if (password.length < 6) return "Password must be at least 6 characters.";

    const { data, error } = await supabase.auth.signUp({
      email: usernameToEmail(name),
      password,
      options: { data: { username: name } },
    });

    if (error) {
      return error.message.toLowerCase().includes("already") ? "Username already exists." : error.message;
    }
    // Supabase returns a user with no identities when the email is already registered.
    if (data.user && data.user.identities?.length === 0) return "Username already exists.";
    if (!data.session) {
      return "Account created, but email confirmation is enabled in Supabase. Turn it off under Authentication → Providers → Email.";
    }
    // The profile row is created by the database (trigger), nothing else to do here.
    return null;
  }

  const logout = () => supabase.auth.signOut();

  const username =
    (user?.user_metadata?.username as string | undefined) || user?.email?.split("@")[0] || "Player";

  return { user, ready, username, login, signup, logout };
}
