import { Asset } from 'expo-asset';
import { File } from 'expo-file-system';
import { useCallback, useMemo, useRef, type ComponentType, type Ref } from 'react';
import { StyleSheet } from 'react-native';
import { WebView, type WebViewMessageEvent, type WebViewProps } from 'react-native-webview';

import { buildSplatViewerHtml, type SplatUpAxis, type SplatViewerMessage } from './splatViewerHtml';

export type SplatViewerProps = {
  assetModule: number;
  up: SplatUpAxis;
  yaw?: number;
  onMessage: (message: SplatViewerMessage) => void;
};

type WebViewHandle = { injectJavaScript: (script: string) => void };

const TypedWebView = WebView as unknown as ComponentType<WebViewProps & { ref?: Ref<WebViewHandle> }>;

const CHUNK_CHARS = 1 << 20;

export function SplatViewer({ assetModule, up, yaw, onMessage }: SplatViewerProps) {
  const webRef = useRef<WebViewHandle>(null);
  const asset = useMemo(() => Asset.fromModule(assetModule), [assetModule]);
  const httpOrigin = /^https?:\/\/[^/]+/.exec(asset.uri)?.[0];
  const html = useMemo(
    () => buildSplatViewerHtml({ url: httpOrigin ? asset.uri : null, up, yaw }),
    [asset, httpOrigin, up, yaw],
  );

  const sendBytes = useCallback(async () => {
    const downloaded = await asset.downloadAsync();
    const base64 = await new File(downloaded.localUri ?? downloaded.uri).base64();
    const total = Math.ceil(base64.length / CHUNK_CHARS);
    for (let i = 0; i < total; i++) {
      const part = JSON.stringify(base64.slice(i * CHUNK_CHARS, (i + 1) * CHUNK_CHARS));
      webRef.current?.injectJavaScript(`window.__splatChunk(${i}, ${total}, ${part}); true;`);
    }
  }, [asset]);

  const handleMessage = useCallback(
    (event: WebViewMessageEvent) => {
      const message = JSON.parse(event.nativeEvent.data) as SplatViewerMessage;
      if (message.type === 'needBytes') {
        sendBytes().catch((error: unknown) =>
          onMessage({ type: 'error', message: `Fetch failed (${message.reason}) and file read failed: ${String(error)}` }),
        );
      }
      onMessage(message);
    },
    [onMessage, sendBytes],
  );

  return (
    <TypedWebView
      ref={webRef}
      style={styles.web}
      originWhitelist={['*']}
      source={{ html, baseUrl: httpOrigin ? `${httpOrigin}/` : undefined }}
      onMessage={handleMessage}
      onError={(event) => onMessage({ type: 'error', message: `WebView error: ${event.nativeEvent.description}` })}
      scrollEnabled={false}
      bounces={false}
      overScrollMode="never"
      setBuiltInZoomControls={false}
      webviewDebuggingEnabled={__DEV__}
    />
  );
}

const styles = StyleSheet.create({
  web: { flex: 1, backgroundColor: '#141210' },
});
