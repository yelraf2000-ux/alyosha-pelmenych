import { useEffect, useRef } from 'react';
import { t } from '../i18n';

/** The brand film with sound. The file is only requested when the buyer opens this. */
export function FilmModal({ onClose }: { onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  return (
    <dialog
      ref={dialogRef}
      className="modal modal--film"
      aria-label={t.home.filmLabel}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === dialogRef.current) onClose();
      }}
    >
      <button type="button" className="modal__close modal__close--light" aria-label={t.close} onClick={onClose}>
        ×
      </button>
      <video src="/media/film.mp4" poster="/media/film-poster.webp" controls autoPlay playsInline />
    </dialog>
  );
}
