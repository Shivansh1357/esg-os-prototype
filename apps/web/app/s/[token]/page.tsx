import SupplierPublicForm from '@/components/SupplierPublicForm'

export default function Page({ params }: { params: { token: string } }) {
  return <SupplierPublicForm token={params.token} />
}


