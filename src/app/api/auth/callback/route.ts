import { NextRequest, NextResponse } from "next/server"
import { createServerClient } from "@supabase/ssr"

export async function GET(req: NextRequest) {

    console.log("Callback request received")

    const requestUrl = new URL(req.url)
    
    // Supabase uses different parameters for different flows:
    // - "code" for PKCE flows (email confirmation, OAuth)
    // - "token_hash" for older email confirmation flows
    // - "type" to indicate the flow type (signup, recovery, etc.)
    const code = requestUrl.searchParams.get("code")
    const tokenHash = requestUrl.searchParams.get("token_hash")
    const type = requestUrl.searchParams.get("type")
    const next = requestUrl.searchParams.get("next")
    
    console.log("Callback params:", { code, tokenHash, type, next, url: requestUrl.toString() })

    // Check if we have either code or token_hash
    if (!code && !tokenHash) {
        console.error("Missing code or token_hash parameter")
        return NextResponse.redirect(new URL("/login?error=Missing%20authentication%20code", requestUrl.origin))
    }

    // Pass through incoming cookies so Supabase can read the PKCE verifier
    const incomingCookies = req.cookies.getAll()

    // Create a temporary response to collect cookies
    let cookiesToSet: Array<{ name: string; value: string; options: any }> = []

    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll() {
                    return incomingCookies
                },
                setAll(cookies) {
                    cookiesToSet = cookies
                },
            },
        }
    )

    // Exchange code for session
    const { data, error } = code 
        ? await supabase.auth.exchangeCodeForSession(code)
        : await supabase.auth.verifyOtp({ token_hash: tokenHash!, type: type as any })

    console.log("Auth result:", { data, error });

    if (error) {
        console.error("Auth error:", error)
        return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(error.message)}`, requestUrl.origin))
    }

    // Determine redirect URL based on session type
    let redirectTo = "/"

    // Check if this is a password recovery session
    const session = data?.session
    if (session) {
        // Check if this is a recovery token by inspecting the type parameter
        const isRecovery = type === "recovery"

        if (isRecovery) {
            // Redirect to reset password page
            redirectTo = "/auth/reset-password"
        } else if (next) {
            redirectTo = next
        }
    } else if (next) {
        redirectTo = next
    }

    const res = NextResponse.redirect(new URL(redirectTo, requestUrl.origin))

    // Set all cookies from Supabase
    cookiesToSet.forEach(({ name, value, options }) => {
        res.cookies.set(name, value, options)
    })

    // Optional: clear pending signup profile cookie
    try {
        res.cookies.delete("pending_profile")
    } catch { }

    return res
}


