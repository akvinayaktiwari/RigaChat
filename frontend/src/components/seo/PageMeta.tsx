import { Helmet } from 'react-helmet-async'
import { absoluteUrl } from '../../lib/site'

export const BRAND_NAME = 'Vyostra AI'

/** 1200x630, the size WhatsApp, LinkedIn and X all crop previews to. */
const DEFAULT_OG_IMAGE = '/og-image.png'

interface PageMetaProps {
  /** Full document title, brand included. */
  title: string
  description: string
  /** Path exactly as served, e.g. "/features/crm". Becomes canonical and og:url. */
  path: string
  type?: 'website' | 'article'
}

/**
 * The head tags every public marketing page needs: title, description,
 * canonical, Open Graph and Twitter card.
 *
 * One component rather than hand-written <Helmet> blocks, because the
 * hand-written ones drifted: six pages had a title and description but no
 * canonical, and none had an og:image, so every shared link previewed blank.
 */
export default function PageMeta({ title, description, path, type = 'website' }: PageMetaProps) {
  const url = absoluteUrl(path)
  const image = absoluteUrl(DEFAULT_OG_IMAGE)

  return (
    <Helmet>
      <title>{title}</title>
      <meta name="description" content={description} />
      <link rel="canonical" href={url} />
      <meta property="og:site_name" content={BRAND_NAME} />
      <meta property="og:type" content={type} />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={url} />
      <meta property="og:image" content={image} />
      <meta property="og:image:width" content="1200" />
      <meta property="og:image:height" content="630" />
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={image} />
    </Helmet>
  )
}
