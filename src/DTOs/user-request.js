import { z } from "zod";

export const RegisterRequestSchema = z.object({
    email: z.string().email("Invalid email"),
    password: z.string().min(6, "Password must be at least 6 characters"),
    username: z.string().min(1, "username required"),
    role: z.enum(["user", "admin"]).optional().default("user"),
    device_id: z.string().min(1).optional().default(null),
})

export const LoginRequestSchema = z.object({
    email:z.string().email("Invalid email"),
    password: z.string(1, "Password is required"), 
})

export const UserUpdateSchema = z.object({
    email: z.string().email().optional(),
    password: z.string().min(1).optional(),
    username: z.string().min(6).optional(),
})
