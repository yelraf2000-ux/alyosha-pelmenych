import { newsExcerpt, smallImagePath, videoInfo } from '@alyosha/shared';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getNews } from '../api';
import { t } from '../i18n';
import { formatDate } from '../lib/format';
import type { NewsPost } from '../types';
import { Reveal } from './Reveal';

/** The post's picture for the list: its photo, or else its clip's poster. Nothing when it has neither. */
function NewsCardMedia({ post }: { post: NewsPost }) {
  // A file can be missing (a restored database without its uploads): then show no picture at all.
  const [failed, setFailed] = useState(false);
  const poster = post.videoPath ? videoInfo(post.videoPath)?.poster : undefined;
  const src = post.imagePath ?? poster;
  if (!src || failed) return null;

  const small = post.imagePath ? smallImagePath(post.imagePath) : src;
  return (
    <div className="news-card__media">
      <img
        src={src}
        srcSet={small !== src ? `${small} 400w, ${src} 1000w` : undefined}
        sizes="(min-width: 640px) 360px, 100vw"
        alt=""
        loading="lazy"
        decoding="async"
        onError={() => setFailed(true)}
      />
      {!post.imagePath && (
        <span className="news-card__play" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="24" height="24" focusable="false">
            <path d="M8 5.5v13l11-6.5z" fill="currentColor" />
          </svg>
        </span>
      )}
    </div>
  );
}

/** One post in a list: picture, date, title and the beginning of the text; all of it opens the post. */
export function NewsCard({ post }: { post: NewsPost }) {
  const excerpt = newsExcerpt(post.text);
  return (
    <Link to={`/news/${post.id}`} className="news-card">
      <NewsCardMedia post={post} />
      <div className="news-card__body">
        <p className="news-date">
          <time dateTime={post.publishedOn}>{formatDate(post.publishedOn)}</time>
        </p>
        <h3 className="news-card__title">{post.title}</h3>
        {excerpt && <p className="news-card__excerpt">{excerpt}</p>}
        <span className="news-card__more">{t.news.readMore} →</span>
      </div>
    </Link>
  );
}

export function NewsGrid({ posts }: { posts: NewsPost[] }) {
  return (
    <div className="news-list">
      {posts.map((post, i) => (
        <Reveal key={post.id} delay={i * 70}>
          <NewsCard post={post} />
        </Reveal>
      ))}
    </div>
  );
}

/** The home page's block: the three latest posts. Not there at all while there is no news (or it fails to load). */
export function LatestNews() {
  const [posts, setPosts] = useState<NewsPost[]>([]);

  useEffect(() => {
    let alive = true;
    getNews(3)
      .then((loaded) => alive && setPosts(loaded))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  if (posts.length === 0) return null;

  return (
    <section className="section container" aria-labelledby="news-title">
      <Reveal>
        <h2 id="news-title" className="section__title">
          {t.news.title}
        </h2>
      </Reveal>
      <NewsGrid posts={posts} />
      <Link to="/news" className="more-link">
        {t.news.all} →
      </Link>
    </section>
  );
}
