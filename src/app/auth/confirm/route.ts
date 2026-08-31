import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Exchanges the invite/recovery `code` for a session. Must be a Route Handler
// (not a Server Component) because only Route Handlers and Server Actions
// are allowed to write response cookies in the Next.js App Router.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/definir-senha";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?erro=link_invalido`);
}
