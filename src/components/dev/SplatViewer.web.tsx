import { Asset } from 'expo-asset';
import { useEffect, useMemo, useRef } from 'react';

import { buildSplatViewerHtml, type SplatViewerMessage } from './splatViewerHtml';
import type { SplatViewerProps } from './SplatViewer';

export function SplatViewer({ assetModule, up, yaw, onMessage }: SplatViewerProps) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const html = useMemo(() => {
    const url = new URL(Asset.fromModule(assetModule).uri, window.location.href).href;
    return buildSplatViewerHtml({ url, up, yaw });
  }, [assetModule, up, yaw]);

  useEffect(() => {
    const listener = (event: MessageEvent) => {
      if (event.source !== frameRef.current?.contentWindow || typeof event.data !== 'string') return;
      const message = JSON.parse(event.data) as SplatViewerMessage;
      if (message.type === 'needBytes') {
        onMessage({ type: 'error', message: `Fetch failed: ${message.reason}` });
        return;
      }
      onMessage(message);
    };
    window.addEventListener('message', listener);
    return () => window.removeEventListener('message', listener);
  }, [onMessage]);

  return <iframe ref={frameRef} title="Splat viewer" srcDoc={html} style={{ border: 0, flex: 1, width: '100%', height: '100%', background: '#141210' }} />;
}
