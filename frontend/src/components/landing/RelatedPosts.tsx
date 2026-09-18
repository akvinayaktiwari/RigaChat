import { Link } from 'react-router-dom'
import type { BlogPostMeta } from '../../types/blog'

interface RelatedPostsProps {
  posts: readonly BlogPostMeta[]
  heading: string
}

/**
 * Links from a marketing page to the posts that go deeper on it.
 *
 * Links use the served trailing-slash URL: the bare /blog/<slug> form costs a
 * crawler a 301 hop on every visit. The post title is the anchor text because
 * it says what the reader gets, which "Read more" does not.
 */
export default function RelatedPosts({ posts, heading }: RelatedPostsProps) {
  if (posts.length === 0) return null

  return (
    <section className="max-w-7xl mx-auto mb-20">
      <h2 className="text-3xl md:text-4xl font-extrabold text-on-surface tracking-tight text-center mb-12">{heading}</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {posts.map((post) => (
          <Link
            key={post.slug}
            to={`/blog/${post.slug}/`}
            className="bg-white border border-outline-variant/30 rounded-2xl p-6 shadow-xs hover:shadow-md hover:border-primary transition-all"
          >
            <p className="text-xs font-bold uppercase tracking-widest text-primary mb-2">{post.category}</p>
            <h3 className="font-bold text-on-surface text-base mb-2">{post.title}</h3>
            <p className="text-sm text-on-surface-variant leading-relaxed line-clamp-3">{post.excerpt}</p>
          </Link>
        ))}
      </div>
    </section>
  )
}
