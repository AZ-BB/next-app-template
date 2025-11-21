'use server'

import { db } from "@/db";
import { SystemRole } from "@/db/enums";
import { users } from "@/db/schema/schema";
import { GeneralResponse } from "@/utils/general-response";
import { createSupabaseAdminServerClient, createSupabaseServerClient } from "@/utils/supabase-server";
import config from "../../config"
import { eq } from "drizzle-orm";

export async function registerUser(formData: FormData): Promise<GeneralResponse<boolean>> {
    try {
        const email = formData.get("email") as string;
        const password = formData.get("password") as string;
        const firstName = formData.get("firstName") as string;
        const lastName = formData.get("lastName") as string;

        if (!email || !password || !firstName || !lastName) {
            return { error: "All fields are required", statusCode: 400, data: false };
        }

        const supabaseAdmin = await createSupabaseAdminServerClient();
        const supabaseClient = await createSupabaseServerClient();


        const isEmailExists = await db.select().from(users).where(eq(users.email, email));
        if (isEmailExists.length > 0) {
            return { error: "Email already exists", statusCode: 400, data: false };
        }


        // Email confirmation flow
        if (config.confirmation === 'email') {
            const { data, error } = await supabaseClient.auth.signUp({
                email,
                password,
                options: {
                    emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/api/auth/callback`,
                    data: {
                        firstName,
                        lastName,
                        role: SystemRole.USER
                    }
                }
            })

            if (error) {
                return { error: error.message, statusCode: 400, data: false };
            }

            // Create user in database
            try {
                await db.insert(users).values({
                    id: data.user?.id!,
                    firstName,
                    lastName,
                    email,
                    role: SystemRole.USER
                })
            }
            catch (error) {
                // Cleanup: delete the auth user if database insert fails
                await supabaseAdmin.auth.admin.deleteUser(data.user?.id!);
                return { error: "Failed to create user", statusCode: 400, data: false };
            }

            return { data: true, statusCode: 200, error: undefined, message: "Registration successful. Please check your email to confirm your account." };
        }

        // OTP confirmation flow
        if (config.confirmation === 'otp') {
            // TODO
        }

        // No confirmation flow
        const { data, error } = await supabaseAdmin.auth.admin.createUser({
            email,
            password,
            email_confirm: true,
            role: SystemRole.USER,
        })

        if (error) {
            return { error: error.message, statusCode: 400, data: false };
        }


        // Create user in database
        try {
            await db.insert(users).values({
                id: data.user?.id,
                firstName,
                lastName,
                email,
                role: SystemRole.USER
            })
        }
        catch (error) {
            await supabaseAdmin.auth.admin.deleteUser(data.user?.id);
            return { error: "Failed to create user", statusCode: 400, data: false };
        }

        return { data: true, statusCode: 200, error: undefined, message: "Registration successful" };
    }
    catch (error) {
        console.error(error);
        return { error: "Failed to register", statusCode: 500, data: false };
    }
}


export async function signInWithGoogleUser(nextPath: string): Promise<GeneralResponse<string | null>> {
    try {
        const supabase = await createSupabaseServerClient();
        const origin = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

        const callbackUrl = `${origin}/api/auth/oauth/callback?provider=google` + (nextPath ? `&next=${encodeURIComponent(nextPath)}` : '');

        const { data, error } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: {
                redirectTo: callbackUrl
            }
        })

        if (error) {
            return { error: error.message, statusCode: 400, data: null };
        }

        return { data: data.url, statusCode: 200, error: undefined, message: "Sign in successful" };
    }
    catch (error) {
        console.error(error);
        return { error: "Failed to sign in", statusCode: 500, data: null };
    }
}

export async function handleOAuthCallback(): Promise<GeneralResponse<boolean>> {
    try {
        const supabase = await createSupabaseServerClient();
        const { data: { user }, error } = await supabase.auth.getUser();

        if (error) {
            return { error: error.message, statusCode: 400, data: false };
        }

        console.log(user?.user_metadata);

        const isUserExists = await db.select().from(users).where(eq(users.id, user?.id!));
        if (isUserExists.length > 0) {
            return { data: false, statusCode: 200, error: undefined, message: "User already exists" };
        }

        await db.insert(users).values({
            id: user?.id!,
            firstName: user?.user_metadata?.full_name?.split(' ')[0],
            lastName: user?.user_metadata?.full_name?.split(' ')[1],
            email: user?.email!,
            role: SystemRole.USER
        })

        return { data: true, statusCode: 200, error: undefined, message: "User created successfully" };


    } catch (error) {
        console.error(error);
        return { error: "Failed to handle OAuth callback", statusCode: 500, data: false };
    }
}
