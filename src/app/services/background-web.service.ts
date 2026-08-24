import { Injectable } from '@angular/core';
import { WebPlugin } from '@capacitor/core';
import { Capacitor } from '@capacitor/core';

// Define BackgroundPlugin interface if not imported from elsewhere
export interface BackgroundPlugin {
    showNotificationFromIonic(data: any): Promise<void>;
    fireAlarmAlert(options: {
        title: string;
        body?: string;
        critical?: boolean;
        rule?: string;
    }): Promise<{ success: boolean }>;
    setAlarmThresholds(options: {
        low: number;
        high: number;
        urgentLow: number;
    }): Promise<{ success: boolean }>;
    setCollectorConfig(options: {
        pollIntervalMin: number;
        failureAlertAt: number;
        patientUsername: string;
    }): Promise<{ success: boolean }>;
    requestPermissions(): Promise<{ granted: boolean }>;
    hasNotificationPermission(): Promise<{ granted: boolean }>;
    setTokens(options: { accessToken: string; refreshToken: string }): Promise<{ success: boolean }>;
    getTokens(): Promise<{ accessToken: string; refreshToken: string }>;
    requestTokenRefresh(): Promise<{ success: boolean; accessToken: string; refreshToken: string }>;
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

    getTokens(): Promise<{ accessToken: string; refreshToken: string }> {
        return (window as any).Capacitor.Plugins.Background.getTokens();
    }

    requestTokenRefresh(): Promise<{ success: boolean; accessToken: string; refreshToken: string }> {
        return (window as any).Capacitor.Plugins.Background.requestTokenRefresh();
    }

    showNotificationFromIonic(data: any): Promise<void> {
        return (window as any).Capacitor.Plugins.Background.showNotificationFromIonic(data);
    }

    fireAlarmAlert(options: {
        title: string;
        body?: string;
        critical?: boolean;
        rule?: string;
    }): Promise<{ success: boolean }> {
        return (window as any).Capacitor.Plugins.Background.fireAlarmAlert(options);
    }

    setAlarmThresholds(options: {
        low: number;
        high: number;
        urgentLow: number;
    }): Promise<{ success: boolean }> {
        return (window as any).Capacitor.Plugins.Background.setAlarmThresholds(options);
    }

    setCollectorConfig(options: {
        pollIntervalMin: number;
        failureAlertAt: number;
        patientUsername: string;
    }): Promise<{ success: boolean }> {
        return (window as any).Capacitor.Plugins.Background.setCollectorConfig(options);
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