import { handleOAuthCallback } from "@/action/auth";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
    console.log("OAuth callback request received");
    const { searchParams } = new URL(request.url);
    const code = searchParams.get("code");
    const next = searchParams.get("next") ?? "/";
    const provider = searchParams.get("provider");

    if (!code) {
        return NextResponse.redirect(
            new URL("/login?error=missing_code", request.url)
        );
    }

    // Optional: Validate provider is one of the supported OAuth providers
    const supportedProviders = ["google", "github", "facebook", "twitter", "discord"];
    if (provider && !supportedProviders.includes(provider)) {
        return NextResponse.redirect(
            new URL("/login?error=unsupported_provider", request.url)
        );
    }

    try {
        const cookieStore = await cookies();
        const supabase = createServerClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            {
                cookies: {
                    getAll() {
                        return cookieStore.getAll();
                    },
                    setAll(cookiesToSet) {
                        try {
                            cookiesToSet.forEach(({ name, value, options }) =>
                                cookieStore.set(name, value, options)
                            );
                        } catch {
                            // The `setAll` method was called from a Server Component.
                            // This can be ignored if you have middleware refreshing
                            // user sessions.
                        }
                    },
                },
            }
        );

        // Exchange the code for a session
        const { error } = await supabase.auth.exchangeCodeForSession(code);

        if (error) {
            console.error("OAuth callback error:", error);
            return NextResponse.redirect(
                new URL(`/login?error=${encodeURIComponent(error.message)}`, request.url)
            );
        }


        const { data, error: handleOAuthCallbackError } = await handleOAuthCallback();
        if (handleOAuthCallbackError) {
            console.error("OAuth callback error:", handleOAuthCallbackError);
            return NextResponse.redirect(
                new URL(`/login?error=${encodeURIComponent(handleOAuthCallbackError)}`, request.url)
            );
        }


        // Successful authentication - redirect to the next path
        const redirectUrl = new URL(next, request.url);
        return NextResponse.redirect(redirectUrl);
    } catch (error) {
        console.error("Unexpected OAuth callback error:", error);
        return NextResponse.redirect(
            new URL("/login?error=authentication_failed", request.url)
        );
    }
}

