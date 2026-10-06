import { useEffect, useRef } from "react";
import * as Notifications from "expo-notifications";
import { router, useRootNavigationState } from "expo-router";
import { useAuth } from "./Provider";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

export default function NotificationBridge() {
  const { session } = useAuth();
  const navigation = useRootNavigationState();
  const handled = useRef<string | null>(null);
  useEffect(() => {
    if (!session || !navigation?.key) return;
    function open(response: Notifications.NotificationResponse) {
      const notification = response.notification;
      const id = notification.request.content.data?.jobId;
      if (
        handled.current === notification.request.identifier ||
        typeof id !== "string" ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          id,
        )
      )
        return;
      handled.current = notification.request.identifier;
      // The server checks membership again; notification data never grants access.
      if (notification.request.content.data?.kind === "offer")
        router.replace("/");
      else router.push({ pathname: "/job", params: { id } });
    }
    const response = Notifications.getLastNotificationResponse();
    if (response) open(response);
    const listener =
      Notifications.addNotificationResponseReceivedListener(open);
    return () => listener.remove();
  }, [session, navigation?.key]);
  return null;
}
