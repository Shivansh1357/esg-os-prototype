"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"
import { Loader2, ShieldCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { setSession } from "@/lib/session"
import type { AppRole } from "@/lib/role"

const API = process.env.NEXT_PUBLIC_API_URL

const LoginSchema = z.object({
  email: z.string().min(1, "Email is required").email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
})
type LoginValues = z.infer<typeof LoginSchema>

type LoginResponse = {
  token: string
  user: {
    tenantId: string
    userId: string
    role: AppRole
    email: string
  }
}

export default function LoginPage() {
  const router = useRouter()
  const [serverError, setServerError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({
    resolver: zodResolver(LoginSchema),
    defaultValues: { email: "", password: "" },
  })

  async function onSubmit(values: LoginValues) {
    setServerError(null)
    try {
      const res = await fetch(`${API}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      })

      if (res.status === 401) {
        const message = "Invalid email or password"
        setServerError(message)
        toast.error(message)
        return
      }

      if (!res.ok) {
        const message = "Unable to sign in. Please try again."
        setServerError(message)
        toast.error(message)
        return
      }

      const data = (await res.json()) as LoginResponse
      setSession({
        token: data.token,
        tenantId: data.user.tenantId,
        userId: data.user.userId,
        role: data.user.role,
        email: data.user.email,
      })
      toast.success("Signed in")
      router.push("/")
    } catch {
      const message = "Unable to reach the server. Please try again."
      setServerError(message)
      toast.error(message)
    }
  }

  return (
    <div className="flex min-h-[70vh] w-full items-center justify-center px-4 py-10">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <ShieldCheck className="size-6" />
          </div>
          <CardTitle className="font-heading text-2xl">Sign in to ESG Console</CardTitle>
          <CardDescription>
            Enter your credentials to access your workspace.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={handleSubmit(onSubmit)} noValidate>
            <div className="space-y-2">
              <Label htmlFor="login-email">Email</Label>
              <Input
                id="login-email"
                type="email"
                autoComplete="email"
                placeholder="you@company.com"
                data-test="login-email"
                aria-invalid={!!errors.email}
                {...register("email")}
              />
              {errors.email ? (
                <p className="text-sm text-destructive">{errors.email.message}</p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="login-password">Password</Label>
              <Input
                id="login-password"
                type="password"
                autoComplete="current-password"
                placeholder="••••••••"
                data-test="login-password"
                aria-invalid={!!errors.password}
                {...register("password")}
              />
              {errors.password ? (
                <p className="text-sm text-destructive">{errors.password.message}</p>
              ) : null}
            </div>

            {serverError ? (
              <p role="alert" className="text-sm font-medium text-destructive">
                {serverError}
              </p>
            ) : null}

            <Button
              type="submit"
              className="w-full"
              data-test="login-submit"
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Signing in...
                </>
              ) : (
                "Sign in"
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
