"use client"
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { toast } from 'sonner'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getJSON, putJSON } from '@/lib/api'
import { getClientRole } from '@/lib/role'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { LoadingState, PageHeader, SectionCard, StatusBanner } from '@/components/product'
// minimal local resolver to avoid extra dep in this snapshot
const zodResolver = (schema: any) => async (values: any) => {
  try {
    const data = schema.parse(values);
    return { values: data, errors: {} };
  } catch (e: any) {
    const errors = e.errors?.reduce((acc: any, err: any) => {
      acc[err.path[0]] = { message: err.message };
      return acc;
    }, {}) || { root: { message: e.message } };
    return { values: {}, errors };
  }
}

const S = z.object({
  framework: z.enum(['BRSR']),
  fy: z.string().min(4),
  currency: z.enum(['INR', 'USD', 'EUR']),
  units: z.enum(['metric', 'us'])
})
type S = z.infer<typeof S>

type Settings = {
  framework: string
  fiscalYearStart: string
  reportingCurrency: string
  units: string
}

const DEFAULTS: S = { framework: 'BRSR', fy: '2025', currency: 'INR', units: 'metric' }

export default function OnboardingPage() {
  const qc = useQueryClient()
  const role = getClientRole()
  const canManage = role === 'ADMIN'
  const { register, handleSubmit, setValue, watch, reset } = useForm<S>({
    resolver: zodResolver(S),
    defaultValues: DEFAULTS,
  })
  const values = watch()

  const q = useQuery({
    queryKey: ['settings'],
    queryFn: async () => (await getJSON<{ settings: Settings | null }>('/settings')).settings,
  })

  useEffect(() => {
    const s = q.data
    if (!s) return
    reset({
      framework: (s.framework as S['framework']) || DEFAULTS.framework,
      fy: s.fiscalYearStart || DEFAULTS.fy,
      currency: (s.reportingCurrency as S['currency']) || DEFAULTS.currency,
      units: (s.units as S['units']) || DEFAULTS.units,
    })
  }, [q.data, reset])

  const save = useMutation({
    mutationFn: async (form: S) =>
      (await putJSON<{ settings: Settings }>('/settings', {
        framework: form.framework,
        fiscalYearStart: form.fy,
        reportingCurrency: form.currency,
        units: form.units,
      })).settings,
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['settings'] })
      toast.success('Saved onboarding settings. Continue to Users and Entities.')
    },
    onError: (e: unknown) => {
      toast.error(e instanceof Error ? e.message : 'Failed to save settings.')
    },
  })

  const isLoading = q.status === 'pending'

  return (
    <div className="space-y-4">
      <PageHeader
        title="Onboarding"
        description="Configure reporting defaults for this tenant before data intake begins."
      />
      <SectionCard title="Organization Setup">
        {!canManage && (
          <StatusBanner tone="info" testId="onboarding-rbac-note">
            Read-only: saving settings requires the ADMIN role.
          </StatusBanner>
        )}
        {isLoading ? (
          <LoadingState testId="onboarding-loading" label="Loading settings…" />
        ) : (
          <form
            className="space-y-4"
            onSubmit={handleSubmit((form) => save.mutate(form))}
          >
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="framework">Framework</Label>
                <Select
                  value={values.framework}
                  onValueChange={(value) => setValue('framework', value as S['framework'])}
                  disabled={!canManage}
                >
                  <SelectTrigger id="framework" data-test="onboarding-framework">
                    <SelectValue placeholder="Select framework" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="BRSR">BRSR</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="fy">Financial Year</Label>
                <Input id="fy" data-test="onboarding-fy" placeholder="2025" disabled={!canManage} {...register('fy')} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="currency">Currency</Label>
                <Select
                  value={values.currency}
                  onValueChange={(value) => setValue('currency', value as S['currency'])}
                  disabled={!canManage}
                >
                  <SelectTrigger id="currency" data-test="onboarding-currency">
                    <SelectValue placeholder="Select currency" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="INR">INR</SelectItem>
                    <SelectItem value="USD">USD</SelectItem>
                    <SelectItem value="EUR">EUR</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="units">Units</Label>
                <Select
                  value={values.units}
                  onValueChange={(value) => setValue('units', value as S['units'])}
                  disabled={!canManage}
                >
                  <SelectTrigger id="units" data-test="onboarding-units">
                    <SelectValue placeholder="Select units" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="metric">Metric</SelectItem>
                    <SelectItem value="us">US</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <input type="hidden" {...register('framework')} />
            <input type="hidden" {...register('currency')} />
            <input type="hidden" {...register('units')} />

            <div className="flex justify-end">
              <Button
                data-test="onboarding-next"
                type="submit"
                disabled={!canManage || save.isPending}
                title={!canManage ? 'Insufficient permissions.' : ''}
              >
                {save.isPending ? 'Saving…' : 'Continue'}
              </Button>
            </div>
          </form>
        )}
      </SectionCard>
    </div>
  )
}
