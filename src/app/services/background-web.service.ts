import { Injectable } from '@angular/core';
import { WebPlugin } from '@capacitor/core';
import { Capacitor } from '@capacitor/core';

// Define BackgroundPlugin interface if not imported from elsewhere
export interface BackgroundPlugin {
    updateNotification(options: { content: string }): Promise<void>;
    requestPermissions(): Promise<{ granted: boolean }>;
    hasNotificationPermission(): Promise<{ granted: boolean }>;
    setTokens(options: { accessToken: string; refreshToken: string }): Promise<{ success: boolean }>;
    startPolling(): Promise<void>;
    stopPolling(): Promise<void>;
}

@Injectable({ providedIn: 'root' })
export class BackgroundWeb extends WebPlugin implements BackgroundPlugin {
    startPolling(): Promise<void> {
        return (window as any).Capacitor.Plugins.Background.startPolling();
    }
    stopPolling(): Promise<void> {
        return (window as any).Capacitor.Plugins.Background.stopPolling();
    }
    setTokens(options: { accessToken: string; refreshToken: string; }): Promise<{ success: boolean; }> {
        return (window as any).Capacitor.Plugins.Background.setTokens(options);
    }

    updateNotification(options: { content: string; }): Promise<void> {
        return (window as any).Capacitor.Plugins.Background.updateNotification(options);
    }

    requestPermissions(): Promise<{ granted: boolean }> {
        return (window as any).Capacitor.Plugins.Background.requestNotificationPermission();
    }

    hasNotificationPermission(): Promise<{ granted: boolean }> {
        return (window as any).Capacitor.Plugins.Background.hasNotificationPermission();
    }

    async ensureNotificationPermission(): Promise<boolean> {
        const permissionStatus = await this.hasNotificationPermission();
        if (permissionStatus.granted) {
            return true;
        }

        console.warn('Notification permission not granted. Requesting...');
        const result = await this.requestPermissions();
        return result.granted ?? false;
    }
}