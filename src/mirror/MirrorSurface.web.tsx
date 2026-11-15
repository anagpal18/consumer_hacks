import { useEffect, useImperativeHandle, useRef, type Ref } from 'react';

export type MirrorSurfaceHandle = { send: (json: string) => void };

type Props = {
  html: string;
  onMessage: (raw: string) => void;
  onFailure: (message: string) => void;
  ref?: Ref<MirrorSurfaceHandle>;
};

export function MirrorSurface({ html, onMessage, ref }: Props) {
  const frame = useRef<HTMLIFrameElement>(null);
  useImperativeHandle(ref, () => ({
    send(json) {
      frame.current?.contentWindow?.postMessage(json, '*');
    },
  }));
  useEffect(() => {
    const listener = (e: MessageEvent) => {
      if (e.source === frame.current?.contentWindow && typeof e.data === 'string') onMessage(e.data);
    };
    window.addEventListener('message', listener);
    return () => window.removeEventListener('message', listener);
  }, [onMessage]);
  return (
    <iframe
      ref={frame}
      srcDoc={html}
      title="Mirror"
      style={{ border: 0, width: '100%', height: '100%', background: 'transparent', display: 'block' }}
    />
  );
}
