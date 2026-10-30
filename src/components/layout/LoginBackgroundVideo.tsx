import { useEffect, useRef, useState } from 'react';

/** Decorative local media; the existing wallpaper is always visible beneath it. */
export function LoginBackgroundVideo({ enabled }: { enabled: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const video = ref.current;
    if (!video || failed) return;
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const syncPlayback = () => {
      if (!enabled || preference.matches || document.hidden) {
        video.pause();
        if (preference.matches) setReady(false);
        return;
      }
      // Reduced-motion visitors never download the video. Pausing preserves its frame.
      if (!video.getAttribute('src')) video.src = '/videos/login-abstract-blue.mp4';
      video.muted = true;
      void video.play().catch(error => {
        if (error instanceof Error && error.name !== 'AbortError') setReady(false);
      });
    };
    syncPlayback();
    document.addEventListener('visibilitychange', syncPlayback);
    preference.addEventListener('change', syncPlayback);
    return () => {
      video.pause();
      document.removeEventListener('visibilitychange', syncPlayback);
      preference.removeEventListener('change', syncPlayback);
    };
  }, [enabled, failed]);

  return <video ref={ref} className="login-background-video" data-ready={ready && !failed}
    muted loop playsInline preload="none" aria-hidden="true" tabIndex={-1}
    disablePictureInPicture disableRemotePlayback
    onPlaying={() => setReady(true)} onError={() => { setFailed(true); setReady(false); }} />;
}
