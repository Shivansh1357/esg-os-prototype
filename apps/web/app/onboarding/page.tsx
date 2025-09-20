"use client"
import { useForm } from 'react-hook-form'
import { z } from 'zod'
// minimal local resolver to avoid extra dep in this snapshot
const zodResolver = (schema: any) => ({
  resolver: async (values: any) => {
    try { schema.parse(values); return { values, errors: {} }; }
    catch (e) { return { values: {}, errors: e }; }
  }
}) as any

const S = z.object({
  framework: z.enum(['BRSR']),
  fy: z.string().min(4),
  currency: z.enum(['INR','USD','EUR']),
  units: z.enum(['metric','us'])
})
type S = z.infer<typeof S>

export default function OnboardingPage() {
  const { register, handleSubmit } = useForm<S>({ resolver: zodResolver(S), defaultValues:{framework:'BRSR', fy:'2025', currency:'INR', units:'metric'} })
  return (
    <form onSubmit={handleSubmit(() => alert('Saved (stub) – continue to Admin/Entities'))}>
      <h2 style={{fontSize:18, marginBottom:12}}>Onboarding</h2>
      <label>Framework</label>
      <select {...register('framework')}>
        <option value="BRSR">BRSR</option>
      </select>
      <label>Financial Year</label>
      <input placeholder="2025" {...register('fy')} />
      <label>Currency</label>
      <select {...register('currency')}>
        <option>INR</option><option>USD</option><option>EUR</option>
      </select>
      <label>Units</label>
      <select {...register('units')}>
        <option value="metric">Metric</option>
        <option value="us">US</option>
      </select>
      <div style={{marginTop:16}}>
        <button data-test="onboarding-next" type="submit">Continue</button>
      </div>
    </form>
  )
}


