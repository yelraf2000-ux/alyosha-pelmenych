import { videoInfo } from '@alyosha/shared';
import { useState } from 'react';

/**
 * A product's clip. Nothing but the poster picture is fetched until the buyer presses play,
 * so product pages stay light on mobile data. There is no sound track.
 */
export function ProductVideo({ path, label }: { path: string; label: string }) {
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
        muted
        preload="none"
        aria-label={label}
        onError={() => setFailed(true)}
      />
    </div>
  );
}
