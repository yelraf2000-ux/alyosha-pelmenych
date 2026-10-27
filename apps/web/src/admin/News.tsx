import { NEWS_TEXT_MAX, NEWS_TITLE_MAX, newsExcerpt, shopToday, smallImagePath, videoInfo, type AdminNewsPost } from '@alyosha/shared';
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Field } from '../components/Field';
import { formatDate } from '../lib/format';
import { adminApi, type NewsPostInput } from './api';
import { errorText, LoadState, PageHead, useLoad } from './shared';

const MAX_PHOTO_BYTES = 12 * 1024 * 1024;
const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_VIDEO_BYTES = 100 * 1024 * 1024;

/** «Новости»: every post, the hidden ones too, newest first. */
export function NewsPage() {
  const { data: posts, error, reload } = useLoad(() => adminApi.news(), [], { refreshOnFocus: true });

  return (
    <>
      <PageHead title="Новости">
        <Link to="new" className="btn btn--primary">
          + Добавить
        </Link>
      </PageHead>

      {!posts ? (
        <LoadState error={error} onRetry={reload} />
      ) : posts.length === 0 ? (
        <p className="adm-muted">Новостей пока нет. На сайте раздел появится, когда вы добавите первую.</p>
      ) : (
        <ul className="adm-list">
          {posts.map((post) => {
            const picture = post.imagePath ? smallImagePath(post.imagePath) : post.videoPath ? videoInfo(post.videoPath)?.poster : undefined;
            return (
              <li key={post.id} className={`adm-product adm-news${post.isPublished ? '' : ' adm-product--hidden'}`}>
                <div className="adm-product__top">
                  {picture ? (
                    <img className="adm-product__thumb" src={picture} alt="" loading="lazy" />
                  ) : (
                    <span className="adm-product__thumb adm-product__thumb--empty">без фото</span>
                  )}
                  <div className="adm-product__info">
                    <Link to={String(post.id)} className="adm-product__name">
                      {post.title}
                    </Link>
                    <span className="adm-muted">{formatDate(post.publishedOn)}</span>
                    {newsExcerpt(post.text, 90) && <span className="adm-muted">{newsExcerpt(post.text, 90)}</span>}
                    <span className="adm-tags">
                      {!post.isPublished && <span className="adm-tag">скрыта</span>}
                      {post.videoPath && <span className="adm-tag">видео</span>}
                    </span>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

interface FormState {
  title: string;
  text: string;
  publishedOn: string;
  isPublished: boolean;
}

const fromPost = (post: AdminNewsPost): FormState => ({
  title: post.title,
  text: post.text,
  publishedOn: post.publishedOn,
  isPublished: post.isPublished,
});

/** Create and edit a post: title, text, date, a photo and a video. */
export function NewsFormPage() {
  const params = useParams();
  const id = params.id === undefined ? null : Number(params.id);
  const navigate = useNavigate();

  const loaded = useLoad(() => (id === null ? Promise.resolve(null) : adminApi.newsPost(id)), [id]);
  const [post, setPost] = useState<AdminNewsPost | null>(null);
  const [form, setForm] = useState<FormState>(() => ({ title: '', text: '', publishedOn: shopToday(), isPublished: true }));
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [video, setVideo] = useState<File | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [showErrors, setShowErrors] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fill the form once, when the post arrives; later reloads must not overwrite what is being typed.
  useEffect(() => {
    if (loaded.data && loaded.data.id !== post?.id) {
      setPost(loaded.data);
      setForm(fromPost(loaded.data));
    }
  }, [loaded.data, post?.id]);

  useEffect(() => {
    if (!photo) return setPreview(null);
    const url = URL.createObjectURL(photo);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  if (id !== null && !post) {
    return (
      <>
        <Link to=".." relative="path" className="adm-back">
          ← Все новости
        </Link>
        <LoadState error={loaded.error} onRetry={loaded.reload} />
      </>
    );
  }

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((current) => ({ ...current, [key]: value }));

  const errors = {
    title: form.title.trim() ? null : 'Напишите заголовок',
    publishedOn: /^\d{4}-\d{2}-\d{2}$/.test(form.publishedOn) ? null : 'Выберите дату',
  };
  const hasErrors = Object.values(errors).some(Boolean);

  function choosePhoto(file: File | undefined) {
    setError(null);
    if (!file) return setPhoto(null);
    if (!PHOTO_TYPES.includes(file.type)) return setError('Подойдут фото в формате JPG, PNG или WebP.');
    if (file.size > MAX_PHOTO_BYTES) return setError('Файл слишком большой. Максимум — 12 МБ.');
    setPhoto(file);
  }

  function chooseVideo(file: File | undefined) {
    setError(null);
    if (!file) return setVideo(null);
    if (!file.type.startsWith('video/')) return setError('Это не видео. Выберите ролик из галереи телефона.');
    if (file.size > MAX_VIDEO_BYTES) return setError('Видео слишком большое. Максимум — 100 МБ; ролик до минуты обычно меньше.');
    setVideo(file);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setShowErrors(true);
    if (hasErrors || busy) return;

    const input: NewsPostInput = {
      title: form.title.trim(),
      text: form.text.trim(),
      publishedOn: form.publishedOn,
      isPublished: form.isPublished,
    };

    setBusy(true);
    setError(null);
    setProgress('Сохраняем…');
    try {
      const saved = post ? await adminApi.updateNewsPost(post.id, input) : await adminApi.createNewsPost(input);
      // From here the post exists: a failed photo or video upload must not create it a second time.
      setPost(saved);
      if (photo) {
        setPost(await adminApi.uploadNewsImage(saved.id, photo));
        setPhoto(null);
      }
      if (video) {
        setProgress('Загружаем и обрабатываем видео. Это может занять пару минут, не закрывайте страницу…');
        setPost(await adminApi.uploadNewsVideo(saved.id, video));
        setVideo(null);
      }
      navigate('/admin/news');
    } catch (reason) {
      setError(errorText(reason));
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  async function removeMedia(kind: 'photo' | 'video') {
    if (!post || !window.confirm(kind === 'photo' ? 'Удалить фото новости?' : 'Удалить видео новости?')) return;
    setBusy(true);
    setError(null);
    try {
      setPost(kind === 'photo' ? await adminApi.deleteNewsImage(post.id) : await adminApi.deleteNewsVideo(post.id));
    } catch (reason) {
      setError(errorText(reason));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!post || !window.confirm(`Удалить новость «${post.title}» насовсем?`)) return;
    setBusy(true);
    setError(null);
    try {
      await adminApi.deleteNewsPost(post.id);
      navigate('/admin/news');
    } catch (reason) {
      setError(errorText(reason));
      setBusy(false);
    }
  }

  const shownPhoto = preview ?? post?.imagePath ?? null;

  return (
    <>
      <Link to=".." relative="path" className="adm-back">
        ← Все новости
      </Link>
      <PageHead title={post ? 'Изменить новость' : 'Новая новость'} />

      <form className="adm-form" onSubmit={submit} noValidate>
        <section className="adm-card">
          <Field
            label="Заголовок"
            value={form.title}
            onChange={(v) => set('title', v)}
            required
            maxLength={NEWS_TITLE_MAX}
            error={showErrors ? errors.title : null}
          />
          <div className="field">
            <label className="field__label" htmlFor="news-text">
              Текст
            </label>
            <textarea
              id="news-text"
              className="field__input adm-news__text"
              rows={10}
              maxLength={NEWS_TEXT_MAX}
              value={form.text}
              onChange={(event) => set('text', event.target.value)}
            />
            <p className="field__hint">
              Пустая строка начинает новый абзац. В списке новостей покажется начало первого абзаца, целиком — когда нажмут на
              новость.
            </p>
          </div>
          <Field
            label="Дата"
            type="date"
            value={form.publishedOn}
            onChange={(v) => set('publishedOn', v)}
            required
            hint="Показывается на новости. Новости на сайте идут по дате, свежие сверху."
            error={showErrors ? errors.publishedOn : null}
          />
        </section>

        <section className="adm-card">
          <h2>Фото</h2>
          {shownPhoto ? (
            <img className="adm-photo" src={shownPhoto} alt="" />
          ) : (
            <p className="adm-muted">Фото пока нет. Лучше всего горизонтальное.</p>
          )}
          <div className="adm-actions">
            <label className="btn">
              {shownPhoto ? 'Заменить фото' : 'Выбрать фото'}
              <input
                type="file"
                className="adm-file"
                accept={PHOTO_TYPES.join(',')}
                onChange={(event) => {
                  choosePhoto(event.target.files?.[0]);
                  event.target.value = '';
                }}
              />
            </label>
            {photo && (
              <button type="button" className="btn" onClick={() => setPhoto(null)}>
                Отменить выбор
              </button>
            )}
            {!photo && post?.imagePath && (
              <button type="button" className="btn adm-danger" disabled={busy} onClick={() => removeMedia('photo')}>
                Удалить фото
              </button>
            )}
          </div>
          {photo && <p className="adm-muted">Новое фото сохранится вместе с новостью.</p>}
        </section>

        <section className="adm-card">
          <h2>Видео</h2>
          {video ? (
            <p>
              Выбрано: <strong>{video.name}</strong> ({Math.max(1, Math.round(video.size / 1024 / 1024))} МБ). Оно
              загрузится и обработается, когда вы нажмёте «Сохранить».
            </p>
          ) : post?.videoPath ? (
            <video className="adm-video" src={post.videoPath} controls playsInline preload="metadata" />
          ) : (
            <p className="adm-muted">
              Видео пока нет. Подойдёт ролик с телефона до минуты, со звуком. Если есть и фото, в списке новостей покажется
              фото, а видео — на странице новости.
            </p>
          )}
          <div className="adm-actions">
            <label className="btn">
              {video || post?.videoPath ? 'Заменить видео' : 'Выбрать видео'}
              <input
                type="file"
                className="adm-file"
                accept="video/*"
                onChange={(event) => {
                  chooseVideo(event.target.files?.[0]);
                  event.target.value = '';
                }}
              />
            </label>
            {video && (
              <button type="button" className="btn" onClick={() => setVideo(null)}>
                Отменить выбор
              </button>
            )}
            {!video && post?.videoPath && (
              <button type="button" className="btn adm-danger" disabled={busy} onClick={() => removeMedia('video')}>
                Удалить видео
              </button>
            )}
          </div>
        </section>

        <section className="adm-card">
          <label className="adm-check">
            <input type="checkbox" checked={form.isPublished} onChange={(event) => set('isPublished', event.target.checked)} />
            Показывать на сайте
          </label>
          <p className="field__hint">Снимите галочку, чтобы подготовить новость заранее или убрать её с сайта, не удаляя.</p>
        </section>

        {showErrors && hasErrors && (
          <p className="alert alert--error" role="alert">
            Проверьте поля, отмеченные красным.
          </p>
        )}
        {error && (
          <p className="alert alert--error" role="alert">
            {error}
          </p>
        )}
        {busy && progress && (
          <p className="alert" role="status">
            {progress}
          </p>
        )}

        <div className="adm-form__submit">
          <button type="submit" className="btn btn--primary btn--lg" disabled={busy}>
            {busy ? 'Сохраняем…' : 'Сохранить'}
          </button>
          {post && id !== null && (
            <button type="button" className="btn adm-danger" disabled={busy} onClick={remove}>
              Удалить новость
            </button>
          )}
        </div>
      </form>
    </>
  );
}
