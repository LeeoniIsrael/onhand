import { supabase } from "./supabase";
export const authService = {
  async requestEmailLink(email: string, redirectTo: string) {
    if (!supabase)
      throw new Error("Connect a Supabase project to use email sign-in.");
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirectTo },
    });
    if (error) throw error;
  },
  async signOut() {
    if (!supabase) return;
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  },
  async getSession() {
    if (!supabase) return null;
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    return data.session;
  },
};
