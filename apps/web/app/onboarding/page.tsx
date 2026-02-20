"use client"
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { toast } from 'sonner'
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
import { PageHeader, SectionCard } from '@/components/product'
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

export default function OnboardingPage() {
  const { register, handleSubmit, setValue, watch } = useForm<S>({ resolver: zodResolver(S), defaultValues: { framework: 'BRSR', fy: '2025', currency: 'INR', units: 'metric' } })
  const values = watch()

  return (
    <div className="space-y-4">
      <PageHeader
        title="Onboarding"
        description="Configure reporting defaults for this tenant before data intake begins."
      />
      <SectionCard title="Organization Setup">
        <form
          className="space-y-4"
          onSubmit={handleSubmit(() => {
            toast.success('Saved onboarding settings. Continue to Users and Entities.')
          })}
        >
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="framework">Framework</Label>
              <Select
                value={values.framework}
                onValueChange={(value) => setValue('framework', value as S['framework'])}
              >
                <SelectTrigger id="framework">
                  <SelectValue placeholder="Select framework" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="BRSR">BRSR</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="fy">Financial Year</Label>
              <Input id="fy" placeholder="2025" {...register('fy')} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="currency">Currency</Label>
              <Select
                value={values.currency}
                onValueChange={(value) => setValue('currency', value as S['currency'])}
              >
                <SelectTrigger id="currency">
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
              >
                <SelectTrigger id="units">
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
            <Button data-test="onboarding-next" type="submit">
              Continue
            </Button>
          </div>
        </form>
      </SectionCard>
    </div>
  )
}
