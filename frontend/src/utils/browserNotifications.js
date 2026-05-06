const NOTIFICATION_ICON = '/favicon.svg';

export const getDesktopNotificationPermission = () => {
  if (!('Notification' in window)) return 'unsupported';
  return Notification.permission;
};

export const requestDesktopNotificationPermission = async () => {
  if (!('Notification' in window)) return 'unsupported';

  if (Notification.permission === 'granted') return 'granted';
  if (Notification.permission === 'denied') return 'denied';

  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
};

export const registerNotificationServiceWorker = async () => {
  if (!('serviceWorker' in navigator)) return null;

  try {
    return await navigator.serviceWorker.register('/notification-sw.js');
  } catch (error) {
    console.error('[DesktopNotification] Service worker registration failed:', error);
    return null;
  }
};

export const showDesktopNotification = async (message, title = 'HRM Portal') => {
  if (!('Notification' in window)) return null;

  const permission = getDesktopNotificationPermission();
  if (permission !== 'granted') return null;

  try {
    const registration = await navigator.serviceWorker?.getRegistration?.();
    if (registration?.showNotification) {
      await registration.showNotification(title, {
        body: String(message || ''),
        icon: NOTIFICATION_ICON,
        badge: NOTIFICATION_ICON,
        tag: `hrm-${title}`,
        renotify: true,
        requireInteraction: false,
        silent: false,
      });
      return registration;
    }

    const notification = new Notification(title, {
      body: String(message || ''),
      icon: NOTIFICATION_ICON,
      badge: NOTIFICATION_ICON,
      tag: `hrm-${title}`,
      renotify: true,
      requireInteraction: false,
      silent: false,
    });

    notification.onclick = () => {
      window.focus();
      notification.close();
    };

    return notification;
  } catch (error) {
    console.error('[DesktopNotification] Failed to show notification:', error);
    return null;
  }
};
