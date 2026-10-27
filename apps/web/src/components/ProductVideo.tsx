import { videoInfo } from '@alyosha/shared';
import { useState } from 'react';

/**
 * A product's or a news post's clip. Nothing but the poster picture is fetched until the buyer
 * presses play, so pages stay light on mobile data. A product's clip has no sound track; a news
 * post's may (`sound`).
 */
export function ProductVideo({ path, label, sound = false }: { path: string; label: string; sound?: boolean }) {
  const info = videoInfo(path);
  // The file can be missing (hosting without a disk, a restored database): then show nothing.
  const [failed, setFailed] = useState(false);
  if (failed) return null;

  const portrait = info ? info.height > info.width : false;

  return (
    <div
      className={`video${portrait ? ' video--portrait' : ''}`}
      style={info ? { aspectRatio: `${info.width} / ${info.height}` } : undefined}
    >
      <video
        src={path}
        poster={info?.poster}
        width={info?.width}
        height={info?.height}
        controls
        playsInline
        muted={!sound}
        preload="none"
        aria-label={label}
        onError={() => setFailed(true)}
      />
    </div>
  );
}
