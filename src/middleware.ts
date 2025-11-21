import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value)
            supabaseResponse.cookies.set(name, value, options)
          })
        },
      },
    }
  )

  // Refresh session if expired - this is important for automatic login after email confirmation
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const path = request.nextUrl.pathname

  // Define public routes that don't require authentication
  const publicRoutes = ["/login", "/signup", "/api", "/auth/callback"]
  const isPublicRoute = publicRoutes.some((route) => path.startsWith(route))

  // Define auth routes (login, signup) - exclude callback as it needs to process first
  const authRoutes = ["/login", "/signup"]
  const isAuthRoute = authRoutes.some((route) => path.startsWith(route))

  // If user is authenticated and trying to access auth routes (login/signup),
  // redirect them to home
  if (user && isAuthRoute) {
    const url = request.nextUrl.clone()
    url.pathname = "/"
    return NextResponse.redirect(url)
  }

  // If user is not authenticated and trying to access protected routes,
  // redirect them to login
  if (!user && !isPublicRoute) {
    const url = request.nextUrl.clone()
    url.pathname = "/login"
    // Optionally save the original destination to redirect after login
    url.searchParams.set("next", path)
    return NextResponse.redirect(url)
  }

  // For all other cases, continue with the request
  return supabaseResponse
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public files (public folder)
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
}

