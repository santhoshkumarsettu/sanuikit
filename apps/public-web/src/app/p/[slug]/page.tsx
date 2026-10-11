import { PublicMap } from '../../../components/public-map'

export default async function PublicProjectPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  return <PublicMap slug={slug} />
}
