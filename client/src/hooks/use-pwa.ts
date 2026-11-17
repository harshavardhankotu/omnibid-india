import { useCallback, useEffect, useState } from "react";
import { registerSW } from "virtual:pwa-register";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    setIsInstalled(isStandalone);

    const userAgent = window.navigator.userAgent.toLowerCase();
    setIsIOS(/iphone|ipad|ipod/.test(userAgent));

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  const install = useCallback(async () => {
    if (!deferredPrompt) return false;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      setIsInstalled(true);
      setDeferredPrompt(null);
      return true;
    }
    return false;
  }, [deferredPrompt]);

  return {
    isInstallable: !!deferredPrompt,
    isInstalled,
    isIOS,
    install,
  };
}

export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true
  );

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  return isOnline;
}

let swUpdater: ((reloadPage?: boolean) => Promise<void>) | null = null;
let swInitialized = false;

export function useServiceWorkerPWA() {
  const [needRefresh, setNeedRefresh] = useState(false);
  const [offlineReady, setOfflineReady] = useState(false);
  const [swActive, setSwActive] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>(
    typeof Notification !== "undefined" ? Notification.permission : "default"
  );

  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    if (!swInitialized) {
      swInitialized = true;
      swUpdater = registerSW({
        immediate: true,
        onNeedRefresh() {
          setNeedRefresh(true);
        },
        onOfflineReady() {
          setOfflineReady(true);
        },
        onRegisteredSW(_swUrl, registration) {
          if (registration) {
            setSwActive(true);
          }
        },
      });
    } else {
      navigator.serviceWorker.ready
        .then(() => setSwActive(true))
        .catch(() => {});
    }
  }, []);

  const updateServiceWorker = useCallback(async () => {
    if (swUpdater) {
      await swUpdater(true);
      setNeedRefresh(false);
    }
  }, []);

  const enablePushNotifications = useCallback(async (userId?: string) => {
    if (typeof Notification === "undefined") {
      return { ok: false, error: "Notifications are not supported in this browser." };
    }

    const result = await Notification.requestPermission();
    setPermission(result);

    if (result !== "granted") {
      return { ok: false, error: "Notification permission was not granted." };
    }

    try {
      if ("serviceWorker" in navigator) {
        const reg = await navigator.serviceWorker.ready;
        setSwActive(true);

        const vapidRes = await fetch("/api/push/vapid-public-key");
        if (vapidRes.ok && reg.pushManager && userId) {
          const { publicKey } = await vapidRes.json();
          if (publicKey) {
            const existing = await reg.pushManager.getSubscription();
            const sub =
              existing ||
              (await reg.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(publicKey) as unknown as BufferSource,
              }));

            await fetch("/api/push/subscribe", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ userId, subscription: sub.toJSON() }),
            });
          }
        }
      }
      return { ok: true };
    } catch (err: any) {
      return { ok: true, warning: err?.message };
    }
  }, []);

  const sendTestSWNotification = useCallback(
    async (payload?: { title?: string; body?: string; url?: string }) => {
      if (typeof Notification === "undefined") {
        return { ok: false, error: "Notifications not supported." };
      }

      let currentPermission = Notification.permission;
      if (currentPermission === "default") {
        currentPermission = await Notification.requestPermission();
        setPermission(currentPermission);
      }

      if (currentPermission !== "granted") {
        return { ok: false, error: "Please allow notifications in browser settings." };
      }

      const title = payload?.title || "OmniBid Live Deal Alert";
      const body = payload?.body || "New L1 reverse-auction bid placed. Tap to inspect.";
      const url = payload?.url || "/notifications";

      if ("serviceWorker" in navigator) {
        const reg = await navigator.serviceWorker.ready;
        if (reg.active) {
          reg.active.postMessage({
            type: "SHOW_NOTIFICATION",
            payload: { title, body, url },
          });
          return { ok: true };
        }
        await reg.showNotification(title, {
          body,
          icon: "/pwa-192x192.png",
          badge: "/pwa-192x192.png",
          data: { url },
        });
        return { ok: true };
      }

      new Notification(title, { body, icon: "/pwa-192x192.png" });
      return { ok: true };
    },
    []
  );

  return {
    needRefresh,
    offlineReady,
    swActive,
    permission,
    updateServiceWorker,
    enablePushNotifications,
    sendTestSWNotification,
  };
}
