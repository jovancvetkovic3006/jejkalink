import { Injectable } from '@angular/core';
import { WebPlugin } from '@capacitor/core';
import { Capacitor } from '@capacitor/core';

// Define BackgroundPlugin interface if not imported from elsewhere
export interface BackgroundPlugin {
    echo(options: { value: string }): Promise<{ value: string }>;
}

@Injectable({ providedIn: 'root' })
export class BackgroundWeb extends WebPlugin implements BackgroundPlugin {
    async echo(options: { value: string }): Promise<{ value: string }> {
        return await (window as any).Capacitor.Plugins.Background.echo(options);
    }
}