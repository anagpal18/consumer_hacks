import { useImperativeHandle, useRef, type ComponentType, type Ref } from 'react';
import { StyleSheet } from 'react-native';
import { WebView, type WebViewProps } from 'react-native-webview';

// The package's class typing defaults its generic to `undefined`, which collapses the props to never under React 19 types.
type WebViewHandle = { injectJavaScript: (script: string) => void };
const NativeWebView = WebView as unknown as ComponentType<WebViewProps & { ref?: Ref<WebViewHandle> }>;

export type MirrorSurfaceHandle = { send: (json: string) => void };

type Props = {
  html: string;
  onMessage: (raw: string) => void;
  onFailure: (message: string) => void;
  ref?: Ref<MirrorSurfaceHandle>;
};

export function MirrorSurface({ html, onMessage, onFailure, ref }: Props) {
  const web = useRef<WebViewHandle>(null);
  useImperativeHandle(ref, () => ({
    send(json) {
      web.current?.injectJavaScript('window.__mirror&&window.__mirror.receive(' + JSON.stringify(json) + ');true;');
    },
  }));
  return (
    <NativeWebView
      ref={web}
      source={{ html }}
      originWhitelist={['*']}
      style={styles.web}
      containerStyle={styles.web}
      onMessage={(e) => onMessage(e.nativeEvent.data)}
      onError={(e) => onFailure(e.nativeEvent.description || 'The 3D view failed to load.')}
      onContentProcessDidTerminate={() => onFailure('The 3D view stopped.')}
      scrollEnabled={false}
      bounces={false}
      overScrollMode="never"
      contentInsetAdjustmentBehavior="never"
      automaticallyAdjustContentInsets={false}
      setSupportMultipleWindows={false}
      webviewDebuggingEnabled={__DEV__}
    />
  );
}

const styles = StyleSheet.create({ web: { flex: 1, backgroundColor: 'transparent' } });
