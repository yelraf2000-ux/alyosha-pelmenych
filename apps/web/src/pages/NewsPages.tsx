import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getNews, getNewsPost } from '../api';
import { NewsGrid } from '../components/News';
import { ProductVideo } from '../components/ProductVideo';
import { t } from '../i18n';
import { formatDate, paragraphs } from '../lib/format';
import { useTitle } from '../lib/useTitle';
import type { NewsPost } from '../types';

type Loaded<T> = { state: 'loading' } | { state: 'error' } | { state: 'done'; value: T };

/** Loads once per `key`; a result that arrives after the page moved on is dropped. */
function useLoaded<T>(load: () => Promise<T>, key: unknown): Loaded<T> {
  const [loaded, setLoaded] = useState<Loaded<T>>({ state: 'loading' });
  useEffect(() => {
    let alive = true;
    setLoaded({ state: 'loading' });
    load()
      .then((value) => alive && setLoaded({ state: 'done', value }))
      .catch(() => alive && setLoaded({ state: 'error' }));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` stands for what `load` reads
  }, [key]);
  return loaded;
}

export function NewsListPage() {
  useTitle(t.news.title);
  const news = useLoaded(() => getNews(), 'all');

  return (
    <div className="section container">
      <h1 className="section__title">{t.news.title}</h1>
      {news.state === 'loading' && <p className="state">{t.loading}</p>}
      {news.state === 'error' && <p className="state">{t.news.loadError}</p>}
      {news.state === 'done' &&
        (news.value.length > 0 ? <NewsGrid posts={news.value} /> : <p className="muted">{t.news.empty}</p>)}
    </div>
  );
}

export function NewsPostPage() {
  const id = Number(useParams().id);
  const post = useLoaded<NewsPost | null>(() => (Number.isInteger(id) && id > 0 ? getNewsPost(id) : Promise.resolve(null)), id);
  useTitle(post.state === 'done' ? (post.value?.title ?? t.news.notFoundTitle) : t.news.title);

  if (post.state === 'loading') return <p className="section container state">{t.loading}</p>;
  if (post.state === 'error') return <p className="section container state">{t.news.loadError}</p>;

  if (!post.value) {
    return (
      <div className="section container narrow state">
        <h1>{t.news.notFoundTitle}</h1>
        <p>{t.news.notFoundText}</p>
        <Link to="/news" className="btn btn--primary">
          {t.news.all}
        </Link>
      </div>
    );
  }

  const { title, text, imagePath, videoPath, publishedOn } = post.value;
  return (
    <article className="section container narrow news-post">
      <nav className="crumbs" aria-label={t.nav.breadcrumbs}>
        <Link to="/news">{t.news.title}</Link>
      </nav>
      <p className="news-date">
        <time dateTime={publishedOn}>{formatDate(publishedOn)}</time>
      </p>
      <h1>{title}</h1>
      {imagePath && <img className="news-post__photo" src={imagePath} alt="" />}
      {videoPath && <ProductVideo path={videoPath} label={t.news.video} sound />}
      <div className="news-post__text">
        {paragraphs(text).map((paragraph, i) => (
          <p key={i}>{paragraph}</p>
        ))}
      </div>
      <Link to="/news" className="more-link">
        ← {t.news.all}
      </Link>
    </article>
  );
}
